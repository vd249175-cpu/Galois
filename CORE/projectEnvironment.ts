import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export interface PackageDeclaration {
  name: string;
  importName: string;
  source: string;
}

export interface ProjectEnvironmentDeclaration {
  projectPath: string;
  manifestPath: string | null;
  pyprojectPath: string | null;
  packages: PackageDeclaration[];
}

export interface PackageStatus extends PackageDeclaration {
  installed: boolean;
}

export interface ProjectEnvironmentStatus {
  projectPath: string;
  usesUv: boolean;
  hasPyproject: boolean;
  manifestPath: string | null;
  pyprojectPath: string | null;
  packages: PackageStatus[];
}

function quoteShellArg(value: string): string {
  if (process.platform === 'win32') {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function run(command: string, cwd: string, env: NodeJS.ProcessEnv) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const args: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < command.length; i++) {
      const char = command[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
    if (current) {
      args.push(current);
    }

    if (args.length === 0) {
      reject(new Error('Empty command'));
      return;
    }

    const child = spawn(args[0], args.slice(1), { cwd, env });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Process exited with code ${code}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function readJsonFile(filePath: string): any | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_) {
    return null;
  }
}

function packageToImportName(name: string): string {
  const clean = name.split(/[<>=!~;\[]/)[0].trim();
  return clean.replace(/-/g, '_');
}

function addPackage(target: Map<string, PackageDeclaration>, name: string, source: string, importName?: string) {
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

function collectManifestPackages(projectPath: string, target: Map<string, PackageDeclaration>) {
  const manifestPath = path.join(projectPath, '.dnote', 'environment.json');
  const manifest = readJsonFile(manifestPath);
  if (!manifest) return null;
  const pythonPackages = manifest.python?.packages || manifest.packages?.python || [];
  for (const item of pythonPackages) {
    if (typeof item === 'string') {
      addPackage(target, item, manifestPath);
    } else if (item && typeof item === 'object') {
      addPackage(target, item.name, manifestPath, item.import || item.importName);
    }
  }
  return manifestPath;
}

function collectPyprojectPackages(projectPath: string, target: Map<string, PackageDeclaration>) {
  const pyprojectPath = path.join(projectPath, 'pyproject.toml');
  if (!fs.existsSync(pyprojectPath)) return null;
  const text = fs.readFileSync(pyprojectPath, 'utf-8');
  const match = text.match(/dependencies\s*=\s*\[([\s\S]*?)\]/m);
  if (match) {
    for (const depMatch of match[1].matchAll(/["']([^"']+)["']/g)) {
      addPackage(target, depMatch[1], pyprojectPath);
    }
  }
  return pyprojectPath;
}

function collectPep723Packages(projectPath: string, target: Map<string, PackageDeclaration>) {
  const scriptDir = path.join(projectPath, 'script');
  if (!fs.existsSync(scriptDir)) return;
  for (const entry of fs.readdirSync(scriptDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.py')) continue;
    const scriptPath = path.join(scriptDir, entry.name);
    const text = fs.readFileSync(scriptPath, 'utf-8');
    const match = text.match(/^# dependencies\s*=\s*\[([\s\S]*?)^# \]/m);
    if (!match) continue;
    for (const depMatch of match[1].matchAll(/^#\s*["']([^"']+)["']/gm)) {
      addPackage(target, depMatch[1], scriptPath);
    }
  }
}

export function readProjectEnvironmentDeclaration(projectPath: string): ProjectEnvironmentDeclaration {
  const normalizedProjectPath = path.resolve(projectPath);
  const packages = new Map<string, PackageDeclaration>();
  const manifestPath = collectManifestPackages(normalizedProjectPath, packages);
  const pyprojectPath = collectPyprojectPackages(normalizedProjectPath, packages);
  collectPep723Packages(normalizedProjectPath, packages);
  return {
    projectPath: normalizedProjectPath,
    manifestPath,
    pyprojectPath,
    packages: Array.from(packages.values()),
  };
}

export async function inspectProjectEnvironment(projectPath: string, env: NodeJS.ProcessEnv): Promise<ProjectEnvironmentStatus> {
  const declaration = readProjectEnvironmentDeclaration(projectPath);
  
  let packages: PackageStatus[] = [];
  if (declaration.packages.length > 0) {
    const dictEntries = declaration.packages
      .map((pkg) => `${JSON.stringify(pkg.importName)}: importlib.util.find_spec(${JSON.stringify(pkg.importName)}) is not None`)
      .join(',\n    ');
    const pythonScript = `import importlib.util, json; print(json.dumps({\n    ${dictEntries}\n}))`;

    let statusMap: Record<string, boolean> = {};
    try {
      const result = await run(`uv run python -c ${quoteShellArg(pythonScript)}`, declaration.projectPath, env);
      statusMap = JSON.parse(result.stdout);
    } catch (_) {
      // uv/python not available or run failed
    }

    packages = declaration.packages.map((pkg) => ({
      ...pkg,
      installed: Boolean(statusMap[pkg.importName]),
    }));
  }

  return {
    projectPath: declaration.projectPath,
    usesUv: true,
    hasPyproject: Boolean(declaration.pyprojectPath),
    manifestPath: declaration.manifestPath,
    pyprojectPath: declaration.pyprojectPath,
    packages,
  };
}

export async function repairProjectEnvironment(projectPath: string, env: NodeJS.ProcessEnv) {
  const before = await inspectProjectEnvironment(projectPath, env);
  const missing = before.packages.filter((pkg) => !pkg.installed);
  const commands: string[] = [];

  if (before.hasPyproject) {
    commands.push('uv sync');
    await run('uv sync', before.projectPath, env);
  } else if (missing.length > 0) {
    commands.push('uv venv');
    await run('uv venv', before.projectPath, env);
    const packages = missing.map((pkg) => quoteShellArg(pkg.name)).join(' ');
    commands.push(`uv pip install ${missing.map((pkg) => pkg.name).join(' ')}`);
    await run(`uv pip install ${packages}`, before.projectPath, env);
  }

  const after = await inspectProjectEnvironment(projectPath, env);
  return {
    projectPath: before.projectPath,
    commands,
    before,
    after,
    repaired: after.packages.every((pkg) => pkg.installed),
  };
}
