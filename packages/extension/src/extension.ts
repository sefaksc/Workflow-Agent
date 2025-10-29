import * as fsSync from "node:fs";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { EngineClient } from "./engineClient";
import { registerChatAgent } from "./chatAgent";
import { WorkflowPanelManager } from "./panelManager";
import { WorkflowStore, isWorkflowRunMessage, isWorkflowUpdateMessage } from "./workflowStore";

const workflowStore = new WorkflowStore();
const panelManager = new WorkflowPanelManager();
let engineClient: EngineClient | undefined;
let engineConfig:
  | {
      pythonExecutable: string;
      enginePath: string;
      cwd: string;
    }
  | undefined;
let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("Workflow Agent");
  context.subscriptions.push(outputChannel);
  context.subscriptions.push(
    new vscode.Disposable(() => {
      engineClient?.dispose();
    }),
  );

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
      panelManager.register(panel);

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

      panel.webview.onDidReceiveMessage((message: unknown) => {
        if (isWorkflowUpdateMessage(message)) {
          workflowStore.update(message.payload);
          return;
        }

        if (isWorkflowRunMessage(message)) {
          void vscode.commands.executeCommand("workflowAgent.runWorkflow");
        }
      });

      const snapshot = workflowStore.getSnapshot();
      if (snapshot) {
        setTimeout(() => {
          panelManager.postMessage({
            type: "workflow/replace",
            payload: snapshot,
          });
        }, 0);
      }
    },
  );

  const runWorkflow = vscode.commands.registerCommand(
    "workflowAgent.runWorkflow",
    async () => {
      const snapshot = workflowStore.getSnapshot();
      if (!snapshot) {
        void vscode.window.showInformationMessage(
          "Open the workflow canvas and make an edit before running the workflow.",
        );
        return;
      }

      const engine = ensureEngine(context);
      if (!engine) {
        return;
      }

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Workflow Agent: Running workflow",
            cancellable: true,
          },
          async (progress, token) => {
            progress.report({ message: "Preparing workflow..." });
            let result;
            try {
              result = await engine.runWorkflow(snapshot, progress, token);
            } catch (error) {
              const message =
                error instanceof Error
                  ? error.message
                  : "The workflow run failed due to an unexpected error.";
              outputChannel?.appendLine(`Run failed: ${message}`);
              void vscode.window.showErrorMessage(message);
              return;
            }

            if (result.cancelled) {
              outputChannel?.appendLine("Workflow run cancelled by user.");
              void vscode.window.showWarningMessage("Workflow run cancelled.");
              return;
            }

            const fileCount = result.files.length;
            outputChannel?.appendLine(`Workflow run completed. Generated ${fileCount} file(s):`);
            for (const file of result.files) {
              outputChannel?.appendLine(`  - ${file.path}`);
            }
            if (result.warnings?.length) {
              outputChannel?.appendLine("Warnings:");
              for (const warning of result.warnings) {
                outputChannel?.appendLine(`  • ${warning}`);
              }
            }
            const summary = `Workflow completed. Generated ${fileCount} file${fileCount === 1 ? "" : "s"}. See the Workflow Agent output for details.`;
            void vscode.window.showInformationMessage(summary, "Open Output").then((selection) => {
              if (selection === "Open Output") {
                outputChannel?.show(true);
              }
            });
          },
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "An unexpected error prevented the workflow from running.";
        outputChannel?.appendLine(`Run aborted: ${message}`);
        void vscode.window.showErrorMessage(message);
      }
    },
  );

  registerChatAgent(context, workflowStore, panelManager, () => Promise.resolve(ensureEngine(context)));

  context.subscriptions.push(openCanvas, runWorkflow);
}

export function deactivate(): void {
  engineClient?.dispose();
  engineClient = undefined;
  engineConfig = undefined;
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

function ensureEngine(context: vscode.ExtensionContext): EngineClient | undefined {
  const location = resolveEngineLocation(context);
  if (!location) {
    return undefined;
  }

  const pythonSetting = vscode.workspace
    .getConfiguration("workflowAgent")
    .get<string>("pythonPath");
  const pythonExecutable = pythonSetting ?? "python";

  const nextConfig = {
    pythonExecutable,
    enginePath: location.enginePath,
    cwd: location.cwd,
  };

  if (!engineClient || !engineConfig || !engineConfigsEqual(engineConfig, nextConfig)) {
    engineClient?.dispose();
    if (!outputChannel) {
      outputChannel = vscode.window.createOutputChannel("Workflow Agent");
      context.subscriptions.push(outputChannel);
    }
    engineClient = new EngineClient(
      nextConfig.pythonExecutable,
      nextConfig.enginePath,
      nextConfig.cwd,
      outputChannel,
    );
    engineConfig = nextConfig;
  }

  return engineClient;
}

function engineConfigsEqual(
  a: { pythonExecutable: string; enginePath: string; cwd: string },
  b: { pythonExecutable: string; enginePath: string; cwd: string },
): boolean {
  return a.pythonExecutable === b.pythonExecutable && a.enginePath === b.enginePath && a.cwd === b.cwd;
}
