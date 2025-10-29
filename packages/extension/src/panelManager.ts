import * as vscode from "vscode";

export interface WorkflowPanelMessage {
  type: string;
  payload?: unknown;
}

export class WorkflowPanelManager {
  private activePanel: vscode.WebviewPanel | undefined;

  public register(panel: vscode.WebviewPanel): void {
    this.activePanel = panel;
    panel.onDidDispose(() => {
      if (this.activePanel === panel) {
        this.activePanel = undefined;
      }
    });
  }

  public postMessage(message: WorkflowPanelMessage): void {
    void this.activePanel?.webview.postMessage(message);
  }

  public hasPanel(): boolean {
    return Boolean(this.activePanel);
  }
}
