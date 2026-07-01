# Legacy Extension Workspace Note

This document is intentionally kept only as a redirect for older references.
Galois no longer treats `~/Documents/Galois/extensions/` as the default plugin
development workspace.

## Current Rule

The packaged `.app` is a launcher, classic seed, and recovery source. On
startup it ensures and launches the full external writable runtime workbench:

```text
~/Documents/Galois/workbench/Galois-vscode-core/
```

That external workbench contains and runs:

- `CORE/`
- `APP/`
- `.agents/`
- `docs/`
- root build files such as `package.json`, `index.tsx`, and `vite.config.ts`

In packaged app mode, APP plugin, CORE, agent-skill, and documentation changes
should happen in that external workbench. In source development mode, they
should happen in the current Galois source repository instead. Do not create
separate plugin-development or agent-document directories by default.

## Recovery Rule

The external workbench should be initialized as a Git repository when Git is
available. Agent recovery should use Git first:

```bash
cd ~/Documents/Galois/workbench/Galois-vscode-core
git status
```

Use branches, commits, `git restore`, or `git revert` for normal recovery.
Classic-code restore from the packaged app is the final fallback only.

## Development Guides

Use these current documents instead:

- `docs/CURRENT_ARCHITECTURE_AND_RELEASE.md`
- `docs/APP_DEVELOPMENT_SCENARIOS.md`
- `docs/PLUGIN_ENVIRONMENT.md`
