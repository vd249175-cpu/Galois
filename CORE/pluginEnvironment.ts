import * as fs from 'fs';
import { exec } from 'child_process';

export interface PluginPackageDeclaration {
  name: string;
  importName: string;
  source: string;
}

export interface PluginPackageStatus extends PluginPackageDeclaration {
  installed: boolean;
}

export interface PluginEnvironmentStatus {
  extensionId: string;
  extensionPath: string;
  manifestPath: string;
  interpreter: string;
  packages: PluginPackageStatus[];
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function run(command: string, cwd: string, env: NodeJS.ProcessEnv) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    exec(command, { cwd, env }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function packageToImportName(name: string): string {
  const clean = name.split(/[<>=!~;\[]/)[0].trim();
  return clean.replace(/-/g, '_');
}

function addPackage(target: Map<string, PluginPackageDeclaration>, name: string, source: string, importName?: string) {
  const clean = String(name || '').trim();
  if (!clean) return;
  const key = clean.toLowerCase();
  if (!target.has(key)) {
    target.set(key, {
      name: clean,
      importName: importName || packageToImportName(clean),
      source,
    });
  }
}

function readManifest(manifestPath: string) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

function collectManifestPackages(manifestPath: string) {
  const manifest = readManifest(manifestPath);
  const packages = new Map<string, PluginPackageDeclaration>();
  const rootPackages = manifest.packages?.python || manifest.runtime?.python?.packages || [];

  for (const item of rootPackages) {
    if (typeof item === 'string') {
      addPackage(packages, item, manifestPath);
    } else if (item && typeof item === 'object') {
      addPackage(packages, item.name, manifestPath, item.import || item.importName);
    }
  }

  for (const service of manifest.services || []) {
    for (const item of service.dependencies || service.packages || []) {
      if (typeof item === 'string') {
        addPackage(packages, item, `${manifestPath}#services.${service.name}`);
      } else if (item && typeof item === 'object') {
        addPackage(packages, item.name, `${manifestPath}#services.${service.name}`, item.import || item.importName);
      }
    }
  }

  return {
    manifest,
    packages: Array.from(packages.values()),
  };
}

async function checkPackageInstalled(extensionPath: string, env: NodeJS.ProcessEnv, pkg: PluginPackageDeclaration) {
  const script = `import importlib.util, sys; sys.exit(0 if importlib.util.find_spec(${JSON.stringify(pkg.importName)}) else 1)`;
  try {
    await run(`uv run python -c ${quoteShellArg(script)}`, extensionPath, env);
    return true;
  } catch (_) {
    return false;
  }
}

export async function inspectPluginEnvironment(
  extensionId: string,
  extensionPath: string,
  manifestPath: string,
  env: NodeJS.ProcessEnv
): Promise<PluginEnvironmentStatus> {
  const { manifest, packages } = collectManifestPackages(manifestPath);
  const statuses = await Promise.all(
    packages.map(async (pkg) => ({
      ...pkg,
      installed: await checkPackageInstalled(extensionPath, env, pkg),
    }))
  );
  return {
    extensionId,
    extensionPath,
    manifestPath,
    interpreter: manifest.interpreters?.python || 'uv run',
    packages: statuses,
  };
}

export async function repairPluginEnvironment(
  extensionId: string,
  extensionPath: string,
  manifestPath: string,
  env: NodeJS.ProcessEnv
) {
  const before = await inspectPluginEnvironment(extensionId, extensionPath, manifestPath, env);
  const missing = before.packages.filter((pkg) => !pkg.installed);
  const commands: string[] = [];

  if (missing.length > 0) {
    commands.push('uv venv');
    await run('uv venv', extensionPath, env);
    const packages = missing.map((pkg) => quoteShellArg(pkg.name)).join(' ');
    commands.push(`uv pip install ${missing.map((pkg) => pkg.name).join(' ')}`);
    await run(`uv pip install ${packages}`, extensionPath, env);
  }

  const after = await inspectPluginEnvironment(extensionId, extensionPath, manifestPath, env);
  return {
    extensionId,
    extensionPath,
    commands,
    before,
    after,
    repaired: after.packages.every((pkg) => pkg.installed),
  };
}
