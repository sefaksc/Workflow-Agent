import * as vscode from "vscode";
import type { EngineChatAction, EngineChatResponse, EngineClient } from "./engineClient";
import type { WorkflowPanelManager } from "./panelManager";
import type { WorkflowRules, WorkflowStore } from "./workflowStore";

type WorkflowCommand =
  | { kind: "new" }
  | { kind: "addNode"; nodeType: "LoginFormComponent" | "LoginAPIEndpoint"; nodeId?: string }
  | { kind: "connect"; from: string; to: string }
  | { kind: "setRules"; rules: WorkflowRules };

type EnsureEngineFn = () => Promise<EngineClient | undefined>;

const SLASH_PREFIX = "/";

export function registerChatAgent(
  context: vscode.ExtensionContext,
  store: WorkflowStore,
  panelManager: WorkflowPanelManager,
  ensureEngine: EnsureEngineFn,
): void {
  const handler: vscode.ChatRequestHandler = async (request, _context, response, token) => {
    const prompt = request.prompt?.trim() ?? "";
    if (prompt.length === 0) {
      response.markdown("Bir sey yazmadin; ornek: `login form ekle`.");
      return;
    }

    if (prompt.startsWith(SLASH_PREFIX)) {
      await handleSlashCommandText(prompt, response, panelManager, store);
      return;
    }

    const engine = await ensureEngine();
    if (!engine) {
      response.markdown("Python motoru baslatilamadi; Output panelini kontrol edin.");
      return;
    }

    const snapshot = store.getSnapshot();
    let chatResult: EngineChatResponse;
    try {
      chatResult = await engine.sendChatPrompt(prompt, snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat istemi islenirken beklenmeyen hata olustu.";
      response.markdown(message);
      return;
    }

    chatResult.messages.forEach((line) => {
      const text = line.trim();
      if (text.length > 0) {
        response.markdown(text);
      }
    });

    if (chatResult.followUps?.length) {
      chatResult.followUps.forEach((hint) => {
        response.markdown(`-> ${hint}`);
      });
    }

    const commands: WorkflowCommand[] = [];
    let shouldRun = false;
    chatResult.actions.forEach((action) => {
      const conversion = convertAction(action);
      if (conversion.command) {
        commands.push(conversion.command);
      }
      if (conversion.runWorkflow) {
        shouldRun = true;
      }
    });

    const previousSnapshotId = store.getSnapshot()?.generatedAt;
    const commandsApplied = await applyCommands(commands, panelManager, response);

    if (shouldRun && commandsApplied && !token.isCancellationRequested) {
      if (commands.length > 0) {
        await waitForSnapshotRefresh(store, previousSnapshotId, 800);
      }
      await vscode.commands.executeCommand("workflowAgent.runWorkflow");
    }
  };

  const participant = vscode.chat.createChatParticipant("workflowAgent", handler);
  context.subscriptions.push(participant);

  registerSlashCommandSuggestions(context, panelManager, store);
}

async function handleSlashCommandText(
  raw: string,
  response: vscode.ChatResponseStream,
  panelManager: WorkflowPanelManager,
  store: WorkflowStore,
): Promise<void> {
  const [command, ...rest] = raw.slice(1).trim().split(/\s+/);
  const keyword = command?.toLowerCase();

  switch (keyword) {
    case "new": {
      if (await applyCommands([{ kind: "new" }], panelManager, response)) {
        response.markdown("Workflow sifirlandi.");
      }
      return;
    }
    case "add": {
      if (rest[0]?.toLowerCase() !== "node") {
        response.markdown("Kullanim: `/add node LoginForm|LoginAPI [Id]`");
        return;
      }
      const nodeTypeToken = rest[1]?.toLowerCase();
      const nodeId = rest[2];
      const nodeType = parseNodeType(nodeTypeToken);
      if (!nodeType) {
        response.markdown("Desteklenen node tipleri: LoginForm, LoginAPI.");
        return;
      }

      const commandPayload: WorkflowCommand = {
        kind: "addNode",
        nodeType,
        nodeId,
      };

      if (await applyCommands([commandPayload], panelManager, response)) {
        response.markdown(
          `Yeni ${nodeType === "LoginFormComponent" ? "Login Form" : "Login API"} dugumu ekleniyor.`,
        );
      }
      return;
    }
    case "connect": {
      if (rest.length < 2) {
        response.markdown("Kullanim: `/connect <kaynakId> <hedefId>`");
        return;
      }
      const [source, target] = rest;
      if (await applyCommands([{ kind: "connect", from: source, to: target }], panelManager, response)) {
        response.markdown(`${source} -> ${target} baglantisi talep edildi.`);
      }
      return;
    }
    case "rules": {
      const snapshot = store.getSnapshot();
      const currentRules = snapshot?.document.rules;
      const nextRules = deriveRules(rest, currentRules);
      if (!nextRules) {
        response.markdown(
          "Kullanim: `/rules language ts|js`, `/rules frontend <framework>`, `/rules backend <framework>`, `/rules coding <formatter> <style>`",
        );
        return;
      }
      if (await applyCommands([{ kind: "setRules", rules: nextRules }], panelManager, response)) {
        response.markdown("Kurallar guncelleniyor.");
      }
      return;
    }
    case "run": {
      await vscode.commands.executeCommand("workflowAgent.runWorkflow");
      response.markdown("Workflow calistiriliyor.");
      return;
    }
    default:
      response.markdown(`Taninmayan komut: /${keyword ?? ""}. Ornek: /add node LoginForm`);
  }
}

function parseNodeType(token?: string): "LoginFormComponent" | "LoginAPIEndpoint" | undefined {
  if (!token) {
    return undefined;
  }
  if (token === "loginform" || token === "form") {
    return "LoginFormComponent";
  }
  if (token === "loginapi" || token === "api") {
    return "LoginAPIEndpoint";
  }
  return undefined;
}

function deriveRules(args: string[], current: WorkflowRules | undefined): WorkflowRules | undefined {
  if (args.length === 0) {
    return undefined;
  }

  const [scope, ...rest] = args;
  const base: WorkflowRules = current
    ? {
        frontend: { ...current.frontend },
        backend: { ...current.backend },
        coding: { ...current.coding },
      }
    : {
        frontend: { framework: "React", language: "TS" },
        backend: { framework: "NodeExpress", language: "TS" },
        coding: { formatter: "prettier", style: "airbnb" },
      };

  switch (scope.toLowerCase()) {
    case "language": {
      const value = rest[0]?.toUpperCase();
      if (value === "TS" || value === "JS") {
        base.frontend.language = value;
        base.backend.language = value;
        return base;
      }
      return undefined;
    }
    case "frontend": {
      const framework = rest[0];
      if (!framework) {
        return undefined;
      }
      base.frontend.framework = framework;
      if (rest[1]) {
        const lang = rest[1].toUpperCase();
        if (lang === "TS" || lang === "JS") {
          base.frontend.language = lang;
        }
      }
      return base;
    }
    case "backend": {
      const framework = rest[0];
      if (!framework) {
        return undefined;
      }
      base.backend.framework = framework;
      if (rest[1]) {
        const lang = rest[1].toUpperCase();
        if (lang === "TS" || lang === "JS") {
          base.backend.language = lang;
        }
      }
      return base;
    }
    case "coding": {
      const [formatter, style] = rest;
      if (!formatter || !style) {
        return undefined;
      }
      base.coding.formatter = formatter;
      base.coding.style = style;
      return base;
    }
    default:
      return undefined;
  }
}

function convertAction(action: EngineChatAction): { command?: WorkflowCommand; runWorkflow?: boolean } {
  switch (action.type) {
    case "new_workflow":
      return { command: { kind: "new" } };
    case "add_node":
      return {
        command: {
          kind: "addNode",
          nodeType: action.nodeType,
          nodeId: action.nodeId,
        },
      };
    case "connect":
      return {
        command: {
          kind: "connect",
          from: action.from,
          to: action.to,
        },
      };
    case "set_rules":
      return { command: { kind: "setRules", rules: action.rules } };
    case "run_workflow":
      return { runWorkflow: true };
    default:
      return {};
  }
}

function applyCommands(
  commands: WorkflowCommand[],
  panelManager: WorkflowPanelManager,
  response: vscode.ChatResponseStream,
): Promise<boolean> {
  if (commands.length === 0) {
    return Promise.resolve(true);
  }

  if (!panelManager.hasPanel()) {
    response.markdown("Canvas acik degil. Lutfen `Workflow Agent: Open Workflow Canvas` komutunu calistir.");
    return Promise.resolve(false);
  }

  panelManager.postMessage({
    type: "workflow/applyCommands",
    payload: commands,
  });
  return Promise.resolve(true);
}

async function waitForSnapshotRefresh(
  store: WorkflowStore,
  previousId: string | undefined,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const current = store.getSnapshot()?.generatedAt;
    if (current && current !== previousId) {
      return;
    }
    await delay(60);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function registerSlashCommandSuggestions(
  context: vscode.ExtensionContext,
  panelManager: WorkflowPanelManager,
  store: WorkflowStore,
): void {
  const chatNamespace = vscode.chat as unknown as {
    registerSlashCommand?: (
      id: string,
      handler: (...args: unknown[]) => unknown,
    ) => vscode.Disposable;
  };

  if (typeof chatNamespace.registerSlashCommand !== "function") {
    return;
  }

  const register = chatNamespace.registerSlashCommand.bind(vscode.chat);

  const wrap = (id: string, commandText: string) =>
    register(id, async (...args: unknown[]) => {
      const response = args[1] as vscode.ChatResponseStream;
      await handleSlashCommandText(commandText, response, panelManager, store);
    });

  context.subscriptions.push(wrap("workflowAgent.new", "/new"));
  context.subscriptions.push(wrap("workflowAgent.addNode", "/add node"));
  context.subscriptions.push(wrap("workflowAgent.connect", "/connect"));
  context.subscriptions.push(wrap("workflowAgent.rules", "/rules"));
  context.subscriptions.push(wrap("workflowAgent.run", "/run"));
}
