# Workflow Agent Monorepo

This repository contains the code for a VS Code extension that lets developers design AI-assisted workflows visually and generate application scaffolding end to end. The project is split into three main parts:

- `packages/extension`: the VS Code extension (TypeScript).
- `packages/webview`: the React-based webview that renders the workflow canvas.
- `engine`: the Python process that powers the workflow execution engine.

## Getting Started

```bash
# Install dependencies for the JavaScript workspaces
npm install

# Build the extension and webview bundles
npm run build

# Lint all TypeScript and Python sources
npm run lint
pip install -r requirements-dev.txt
python -m ruff check
```

### Repository Layout

- `docs/` – design documents and protocol specifications.
- `examples/` – sample YAML workflows.
- `.github/workflows/` – CI configuration.

See `CONTRIBUTING.md` for development guidelines and `CODE_OF_CONDUCT.md` for community standards.
