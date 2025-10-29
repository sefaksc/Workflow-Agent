import * as fs from "node:fs";
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
    () => {
      const panel = vscode.window.createWebviewPanel(
        "workflowAgentCanvas",
        "Workflow Canvas",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
        },
      );

      panel.webview.html = getWebviewPlaceholderHtml();
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

function getWebviewPlaceholderHtml(): string {
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
          <p>The interactive workflow canvas will appear here in a later sprint.</p>
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
    fs.accessSync(candidate, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
