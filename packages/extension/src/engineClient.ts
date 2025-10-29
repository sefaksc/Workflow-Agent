import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import type { WorkflowSnapshot } from "./workflowStore";
import { toEngineWorkflow, type EngineWorkflowDocument } from "./workflowTransform";

interface EngineGeneratedFile {
  path: string;
  content: string;
}

export type EngineChatAction =
  | { type: "new_workflow" }
  | { type: "add_node"; nodeType: "LoginFormComponent" | "LoginAPIEndpoint"; nodeId?: string }
  | { type: "connect"; from: string; to: string }
  | { type: "set_rules"; rules: WorkflowSnapshot["document"]["rules"] }
  | { type: "run_workflow" };

export interface EngineChatResponse {
  messages: string[];
  actions: EngineChatAction[];
  followUps?: string[];
}

interface RunWorkflowMessage {
  type: "RUN_WORKFLOW";
  correlationId: string;
  yaml: string;
  document: EngineWorkflowDocument;
  settings: {
    rules: WorkflowSnapshot["document"]["rules"];
  };
}

interface CancelMessage {
  type: "CANCEL";
  correlationId: string;
}

interface PingMessage {
  type: "PING";
}

interface ChatRequestMessage {
  type: "CHAT_REQUEST";
  correlationId: string;
  prompt: string;
  workflow?: {
    document: EngineWorkflowDocument;
    yaml: string;
  };
}

type EngineInboundMessage =
  | { type: "READY"; message?: string }
  | { type: "PONG" }
  | {
      type: "LOG";
      level?: "debug" | "info" | "warn" | "error";
      message: string;
      correlationId?: string;
    }
  | {
      type: "PROGRESS";
      correlationId: string;
      step?: string;
      pct?: number;
    }
  | {
      type: "COMPLETE";
      correlationId: string;
      files: EngineGeneratedFile[];
      warnings?: string[];
      cancelled?: boolean;
    }
  | {
      type: "ERROR";
      correlationId?: string;
      message: string;
      code?: string;
      details?: unknown;
    }
  | {
      type: "ASK_USER";
      correlationId: string;
      question: string;
      fields?: Array<{ name: string; label: string; type: string }>;
    }
  | {
      type: "CHAT_RESPONSE";
      correlationId: string;
      reply: string[];
      actions: EngineChatAction[];
      followUps?: string[];
    };

export interface RunWorkflowResult {
  files: EngineGeneratedFile[];
  warnings?: string[];
  cancelled: boolean;
}

interface PendingRun {
  correlationId: string;
  resolve: (value: RunWorkflowResult) => void;
  reject: (reason: Error) => void;
  progress: vscode.Progress<{ message?: string; increment?: number }>;
  lastPct?: number;
  cancelledByUser: boolean;
}

interface PendingPing {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface PendingChat {
  resolve: (value: EngineChatResponse) => void;
  reject: (error: Error) => void;
}

export class EngineClient {
  private child: ChildProcessWithoutNullStreams | undefined;
  private stdoutBuffer = "";
  private readyResolver: (() => void) | undefined;
  private readyRejector: ((error: Error) => void) | undefined;
  private readyTimeout: NodeJS.Timeout | undefined;
  private readyPromise: Promise<void> | undefined;
  private activeRun: PendingRun | undefined;
  private pendingPings: PendingPing[] = [];
  private pendingChats = new Map<string, PendingChat>();
  private disposed = false;

  constructor(
    private readonly pythonExecutable: string,
    private readonly enginePath: string,
    private readonly cwd: string,
    private readonly output: vscode.OutputChannel,
  ) {}

  public async runWorkflow(
    snapshot: WorkflowSnapshot,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken,
  ): Promise<RunWorkflowResult> {
    await this.ensureStarted();
    await this.ping();

    if (this.activeRun) {
      throw new Error("The workflow engine is already busy with another run.");
    }

    const correlationId = randomUUID();
    const document = toEngineWorkflow(snapshot);
    const message: RunWorkflowMessage = {
      type: "RUN_WORKFLOW",
      correlationId,
      yaml: snapshot.yaml,
      document,
      settings: {
        rules: snapshot.document.rules,
      },
    };

    const runPromise = new Promise<RunWorkflowResult>((resolve, reject) => {
      this.activeRun = {
        correlationId,
        resolve,
        reject,
        progress,
        cancelledByUser: false,
      };
    });

    token.onCancellationRequested(() => {
      if (this.activeRun && this.activeRun.correlationId === correlationId) {
        this.activeRun.cancelledByUser = true;
        this.sendMessage<CancelMessage>({ type: "CANCEL", correlationId });
      }
    });

    this.output.appendLine("Starting workflow run...");
    this.sendMessage(message);

    return runPromise.finally(() => {
      this.activeRun = undefined;
    });
  }

  public async ping(): Promise<void> {
    await this.ensureStarted();
    const promise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out waiting for engine ping response."));
      }, 5000);
      this.pendingPings.push({ resolve, reject, timeout });
    });
    this.sendMessage<PingMessage>({ type: "PING" });
    return promise;
  }

  public async sendChatPrompt(
    prompt: string,
    snapshot: WorkflowSnapshot | undefined,
  ): Promise<EngineChatResponse> {
    await this.ensureStarted();
    await this.ping();

    const correlationId = randomUUID();
    const document = snapshot ? toEngineWorkflow(snapshot) : undefined;
    const message: ChatRequestMessage = {
      type: "CHAT_REQUEST",
      correlationId,
      prompt,
      workflow: document
        ? {
            document,
            yaml: snapshot!.yaml,
          }
        : undefined,
    };

    return new Promise<EngineChatResponse>((resolve, reject) => {
      this.pendingChats.set(correlationId, { resolve, reject });
      try {
        this.sendMessage(message);
      } catch (error) {
        this.pendingChats.delete(correlationId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public dispose(): void {
    this.disposed = true;
    for (const pending of this.pendingPings) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Engine client disposed."));
    }
    this.pendingPings = [];

    if (this.activeRun) {
      this.activeRun.reject(new Error("Engine client disposed."));
      this.activeRun = undefined;
    }

    this.pendingChats.forEach((pending, correlationId) => {
      pending.reject(new Error("Engine client disposed."));
      this.pendingChats.delete(correlationId);
    });

    if (this.child) {
      this.child.removeAllListeners();
      this.child.stdout.removeAllListeners();
      this.child.stderr.removeAllListeners();
      this.child.kill();
      this.child = undefined;
    }
  }

  private async ensureStarted(): Promise<void> {
    if (this.disposed) {
      throw new Error("Engine client is disposed.");
    }

    if (this.child && this.readyPromise) {
      return this.readyPromise;
    }

    this.stdoutBuffer = "";

    this.child = spawn(this.pythonExecutable, [this.enginePath], {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.on("error", (error) => {
      this.output.appendLine(`Engine process error: ${error.message}`);
      if (this.activeRun) {
        this.activeRun.reject(new Error(`Engine process failed: ${error.message}`));
        this.activeRun = undefined;
      }
      this.teardown();
    });

    this.child.on("exit", (code, signal) => {
      this.output.appendLine(
        `Engine process exited${code !== null ? ` with code ${code}` : ""}${
          signal ? ` after signal ${signal}` : ""
        }.`,
      );
      if (this.activeRun) {
        this.activeRun.reject(new Error("Engine process exited before completion."));
        this.activeRun = undefined;
      }
      this.teardown();
    });

    this.child.stdout.on("data", (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString();
      this.processStdout();
    });

    this.child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      text
        .split(/\r?\n/g)
        .filter((line) => line.trim().length > 0)
        .forEach((line) => this.output.appendLine(`[stderr] ${line}`));
    });

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolver = resolve;
      this.readyRejector = reject;
      this.readyTimeout = setTimeout(() => {
        reject(new Error("Engine did not signal readiness."));
      }, 5000);
    });

    return this.readyPromise;
  }

  private teardown(): void {
    if (this.child) {
      this.child.removeAllListeners();
      this.child.stdout.removeAllListeners();
      this.child.stderr.removeAllListeners();
      this.child = undefined;
    }
    this.readyPromise = undefined;
    this.readyResolver = undefined;
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = undefined;
    }
    if (this.readyRejector) {
      this.readyRejector(new Error("Engine stopped before signalling readiness."));
      this.readyRejector = undefined;
    }
    this.stdoutBuffer = "";
    for (const pending of this.pendingPings) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Engine process exited."));
    }
    this.pendingPings = [];
    this.pendingChats.forEach((pending, correlationId) => {
      pending.reject(new Error("Engine process exited."));
      this.pendingChats.delete(correlationId);
    });
  }

  private processStdout(): void {
    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const raw = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (raw.length > 0) {
        this.handleMessage(raw);
      }
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  private handleMessage(raw: string): void {
    let parsed: EngineInboundMessage | undefined;
    try {
      parsed = JSON.parse(raw) as EngineInboundMessage;
    } catch (error) {
      this.output.appendLine(`Received malformed JSON from engine: ${raw}`);
      return;
    }

    switch (parsed.type) {
      case "READY": {
        this.output.appendLine("Engine reported READY.");
        if (this.readyResolver) {
          this.readyResolver();
          this.readyResolver = undefined;
        }
        if (this.readyTimeout) {
          clearTimeout(this.readyTimeout);
          this.readyTimeout = undefined;
        }
        this.readyRejector = undefined;
        break;
      }
      case "PONG": {
        const pending = this.pendingPings.shift();
        if (pending) {
          clearTimeout(pending.timeout);
          pending.resolve();
        }
        break;
      }
      case "LOG": {
        const level = parsed.level ?? "info";
        this.output.appendLine(`[${level}] ${parsed.message}`);
        break;
      }
      case "PROGRESS": {
        if (this.activeRun && this.activeRun.correlationId === parsed.correlationId) {
          const increment =
            typeof parsed.pct === "number" && parsed.pct >= 0 && parsed.pct <= 100
              ? Math.max(0, parsed.pct - (this.activeRun.lastPct ?? 0))
              : undefined;
          if (typeof parsed.pct === "number") {
            this.activeRun.lastPct = parsed.pct;
          }
          this.activeRun.progress.report({
            message: parsed.step ?? "Working...",
            increment,
          });
        }
        break;
      }
      case "COMPLETE": {
        if (this.activeRun && this.activeRun.correlationId === parsed.correlationId) {
          this.activeRun.resolve({
            files: parsed.files,
            warnings: parsed.warnings,
            cancelled: parsed.cancelled ?? false,
          });
          this.activeRun = undefined;
        }
        break;
      }
      case "ERROR": {
        if (this.activeRun && (!parsed.correlationId || parsed.correlationId === this.activeRun.correlationId)) {
          const error = new Error(parsed.message || "Engine reported an error.");
          this.activeRun.reject(error);
          this.activeRun = undefined;
        } else if (parsed.correlationId && this.pendingChats.has(parsed.correlationId)) {
          const pending = this.pendingChats.get(parsed.correlationId);
          if (pending) {
            pending.reject(new Error(parsed.message || "Engine reported an error."));
            this.pendingChats.delete(parsed.correlationId);
          }
        } else {
          const message = parsed.message || "Engine reported an error.";
          void vscode.window.showErrorMessage(message);
        }
        break;
      }
      case "CHAT_RESPONSE": {
        const pending = this.pendingChats.get(parsed.correlationId);
        if (pending) {
          const response: EngineChatResponse = {
            messages: parsed.reply ?? [],
            actions: parsed.actions ?? [],
            followUps: parsed.followUps,
          };
          pending.resolve(response);
          this.pendingChats.delete(parsed.correlationId);
        }
        break;
      }
      case "ASK_USER": {
        this.output.appendLine("Engine requested user input, which is not supported in this sprint.");
        if (this.activeRun && this.activeRun.correlationId === parsed.correlationId) {
          this.activeRun.reject(new Error("Engine requested input but interactive flows are not yet supported."));
          this.activeRun = undefined;
        }
        break;
      }
      default: {
        this.output.appendLine(`Received unsupported message type: ${JSON.stringify(parsed)}`);
      }
    }
  }

  private sendMessage<
    T extends PingMessage | CancelMessage | RunWorkflowMessage | ChatRequestMessage,
  >(message: T): void {
    if (!this.child || !this.child.stdin.writable) {
      throw new Error("Engine process is not available.");
    }
    const payload = `${JSON.stringify(message)}\n`;
    this.child.stdin.write(payload);
  }
}
