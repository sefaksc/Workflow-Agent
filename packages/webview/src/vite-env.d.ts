/// <reference types="vite/client" />

interface VsCodeApi<TMessage> {
  postMessage(message: TMessage): void;
  setState(state: unknown): void;
  getState(): unknown;
}

declare function acquireVsCodeApi<TMessage = unknown>(): VsCodeApi<TMessage>;
