import * as fsSync from "node:fs";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import * as vscode from "vscode";

type EngineDiagnostics = {
  status: string;
  llamaIndexAvailable: boolean;
};

export function activate(context: vscode.ExtensionContext): void {
  const openCanvas = vscode.commands.registerCommand(
    "workflowAgent.openWorkflowCanvas",
    async () => {
      const panel = vscode.window.createWebviewPanel(
        "workflowAgentCanvas",
        "Workflow Canvas",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: getWebviewResourceRoots(context),
        },
      );

      try {
        const html = await loadWebviewHtml(context, panel.webview);
        panel.webview.html = html;
      } catch (error) {
        void vscode.window.showErrorMessage(
          error instanceof Error ? error.message : "Failed to load workflow canvas.",
        );
        panel.webview.html = getWebviewPlaceholderHtml(
          "The workflow canvas bundle is missing. Run `npm run build --workspace workflow-agent-webview` and try again.",
        );
      }
    },
  );

  const runWorkflow = vscode.commands.registerCommand(
    "workflowAgent.runWorkflow",
    async () => {
      await runEngineCheck(context);
    },
  );

  context.subscriptions.push(openCanvas, runWorkflow);
}

export function deactivate(): void {
  // Nothing to clean up yet.
}

function getWebviewPlaceholderHtml(message?: string): string {
  return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline';" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Workflow Agent</title>
      </head>
      <body>
        <main style="font-family: sans-serif; margin: 2rem;">
          <h1>Workflow Agent</h1>
          <p>${message ?? "The interactive workflow canvas will appear here in a later sprint."}</p>
        </main>
      </body>
    </html>
  `;
}

async function runEngineCheck(context: vscode.ExtensionContext): Promise<void> {
  const location = resolveEngineLocation(context);
  if (!location) {
    return;
  }

  const pythonSetting = vscode.workspace
    .getConfiguration("workflowAgent")
    .get<string>("pythonPath");
  const pythonExecutable = pythonSetting ?? "python";

  const diagnostics = await executeEngineCheck(
    pythonExecutable,
    location.enginePath,
    location.cwd,
  );
  if (!diagnostics) {
    return;
  }

  const message = diagnostics.llamaIndexAvailable
    ? "Python environment looks good. LlamaIndex is available."
    : "Python environment detected, but LlamaIndex is not installed.";

  void vscode.window.showInformationMessage(message);
}

function executeEngineCheck(
  pythonExecutable: string,
  enginePath: string,
  cwd: string,
): Promise<EngineDiagnostics | undefined> {
  return new Promise((resolve) => {
    const child = spawn(pythonExecutable, [enginePath, "--check"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (error: Error) => {
      void vscode.window.showErrorMessage(
        `Failed to execute Python: ${error.message}`,
      );
      resolve(undefined);
    });

    child.on("close", (code: number | null) => {
      if (code !== 0) {
        const details = stderr.trim() || stdout.trim() || "Unknown error";
        void vscode.window.showErrorMessage(
          `Engine diagnostics exited with code ${code}. ${details}`,
        );
        resolve(undefined);
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as unknown;
        if (!isEngineDiagnostics(parsed)) {
          throw new Error("Invalid payload");
        }
        resolve(parsed);
      } catch {
        void vscode.window.showErrorMessage(
          "Could not parse engine diagnostics output.",
        );
        resolve(undefined);
      }
    });
  });
}

function isEngineDiagnostics(value: unknown): value is EngineDiagnostics {
  if (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "llamaIndexAvailable" in value
  ) {
    const record = value as Record<string, unknown>;
    return (
      typeof record.status === "string" &&
      typeof record.llamaIndexAvailable === "boolean"
    );
  }

  return false;
}

async function loadWebviewHtml(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
): Promise<string> {
  const distPath = getWebviewDistPath(context);
  const indexPath = path.join(distPath, "index.html");

  let rawHtml: string;
  try {
    rawHtml = await fs.readFile(indexPath, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new Error(
        "Workflow webview bundle not found. Run `npm run build --workspace workflow-agent-webview` before opening the canvas.",
      );
    }
    throw error;
  }

  const distUri = vscode.Uri.file(distPath);
  const withResources = rewriteLocalResourceUrls(rawHtml, webview, distUri);
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};">`;

  if (withResources.includes("Content-Security-Policy")) {
    return withResources;
  }

  return withResources.replace("<head>", `<head>\n  ${cspMeta}`);
}

function rewriteLocalResourceUrls(
  html: string,
  webview: vscode.Webview,
  distUri: vscode.Uri,
): string {
  const convert = (original: string): string => {
    if (!isLocalAssetPath(original)) {
      return original;
    }

    const normalized = original.replace(/^[./]+/, "").replace(/^assets\//, "assets/");
    const resourceUri = vscode.Uri.joinPath(distUri, normalized);
    return webview.asWebviewUri(resourceUri).toString();
  };

  return html
    .replace(
      /(<script\b[^>]*\bsrc=")([^"]+)(")/g,
      (match: string, prefix: string, src: string, suffix: string) => {
        return `${prefix}${convert(src)}${suffix}`;
      },
    )
    .replace(
      /(<link\b[^>]*\bhref=")([^"]+)(")/g,
      (match: string, prefix: string, href: string, suffix: string) => {
        return `${prefix}${convert(href)}${suffix}`;
      },
    );
}

function isLocalAssetPath(candidate: string): boolean {
  return (
    candidate.length > 0 &&
    !/^https?:\/\//i.test(candidate) &&
    !candidate.startsWith("vscode-resource:") &&
    !candidate.startsWith("data:")
  );
}

function getWebviewDistPath(context: vscode.ExtensionContext): string {
  const repoRoot = path.resolve(context.extensionUri.fsPath, "..", "..");
  return path.join(repoRoot, "packages", "webview", "dist");
}

function getWebviewResourceRoots(context: vscode.ExtensionContext): vscode.Uri[] {
  const distPath = getWebviewDistPath(context);
  return [vscode.Uri.file(distPath)];
}

function isErrnoException(value: unknown): value is NodeJS.ErrnoException {
  return typeof value === "object" && value !== null && "code" in value;
}

function resolveEngineLocation(
  context: vscode.ExtensionContext,
): { enginePath: string; cwd: string } | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceEngine = workspaceFolder
    ? path.join(workspaceFolder.uri.fsPath, "engine", "main.py")
    : undefined;

  if (workspaceEngine && pathExists(workspaceEngine)) {
    return {
      enginePath: workspaceEngine,
      cwd: workspaceFolder!.uri.fsPath,
    };
  }

  const repoRoot = path.resolve(context.extensionUri.fsPath, "..", "..");
  const fallbackEngine = path.join(repoRoot, "engine", "main.py");
  if (pathExists(fallbackEngine)) {
    return {
      enginePath: fallbackEngine,
      cwd: repoRoot,
    };
  }

  const errorMessage = workspaceFolder
    ? `Workflow Agent could not locate engine/main.py under ${workspaceFolder.uri.fsPath} or ${repoRoot}.`
    : "Workflow Agent requires an open workspace or engine configuration to run.";
  void vscode.window.showErrorMessage(errorMessage);

  return undefined;
}

function pathExists(candidate: string): boolean {
  try {
    fsSync.accessSync(candidate, fsSync.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
