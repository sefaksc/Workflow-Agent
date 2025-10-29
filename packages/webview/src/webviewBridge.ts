import type { WorkflowDocument } from "./types";

export type OutboundWebviewMessage =
  | {
      type: "workflow/update";
      payload: {
        document: WorkflowDocument;
        yaml: string;
        generatedAt: string;
      };
    };

const vscodeApi =
  typeof acquireVsCodeApi === "function" ? acquireVsCodeApi<OutboundWebviewMessage>() : undefined;

export function postMessage(message: OutboundWebviewMessage): void {
  if (!vscodeApi) {
    return;
  }
  try {
    vscodeApi.postMessage(message);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to post message to VS Code:", error);
  }
}
