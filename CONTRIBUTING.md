# Contributing Guide

Thank you for your interest in contributing to Workflow Agent! This document highlights the basics you need to know before opening a pull request.

## Development Workflow

1. Fork the repository and create a feature branch.
2. Run `npm install` at the repository root to install all JavaScript/TypeScript dependencies.
3. Use `npm run build` to ensure the extension and webview compile.
4. Run `npm run lint` for TypeScript checks and `ruff check` for Python linting.
5. Include tests or examples that demonstrate your change when possible.
6. Submit a pull request with a concise summary and link to any relevant issues.

## Coding Standards

- Follow the existing TypeScript and Python style guides enforced by ESLint and Ruff.
- Prefer small, focused commits with descriptive messages.
- Add documentation when you introduce new commands, configuration, or user-facing behaviour.

## Reporting Issues

When filing a bug report, include:

- Steps to reproduce.
- Expected/actual behaviour.
- Environment details (OS, Node.js version, Python version, VS Code version).

## Questions

If you have questions about the project or need help getting started, please open a discussion or issue in the repository.
