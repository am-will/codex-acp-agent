import { randomUUID } from "node:crypto";
import type {
  Agent,
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  CancelNotification,
  SessionNotification,
  ContentBlock,
  ToolCallContent,
  PlanEntry,
} from "@zed-industries/agent-client-protocol";
import {
  AgentSideConnection,
  RequestError,
} from "@zed-industries/agent-client-protocol";
import {
  Codex,
  type ThreadEvent,
  type ItemStartedEvent,
  type ItemUpdatedEvent,
  type ItemCompletedEvent,
  type CommandExecutionItem,
  type FileChangeItem,
  type AgentMessageItem,
  type ReasoningItem,
  type TodoListItem,
  type Thread,
  type McpToolCallItem,
  type WebSearchItem,
} from "@openai/codex-sdk";

import type { CodexAgentConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { renderPrompt } from "./prompt.js";
import {
  createSessionState,
  type SessionState,
} from "./session-state.js";
import { SlashCommandRegistry, type SlashCommandMatch } from "./slash-commands.js";

interface EventResult {
  stopReason?: PromptResponse["stopReason"];
  terminate?: boolean;
}

interface ToolCallContext {
  kind: "read" | "edit" | "delete" | "move" | "search" | "execute" | "think" | "fetch" | "switch_mode" | "other";
  title: string;
}

export class CodexAgent implements Agent {
  private readonly sessions = new Map<string, SessionState>();
  private readonly slashCommands: SlashCommandRegistry;

  constructor(
    private readonly connection: AgentSideConnection,
    private readonly codex: Codex,
    private readonly config: CodexAgentConfig,
    private readonly logger: Logger,
  ) {
    this.slashCommands = new SlashCommandRegistry(config, logger);
  }

  async initialize(params: InitializeRequest): Promise<InitializeResponse> {
    this.logger.info("initialize", { clientProtocol: params.protocolVersion });
    return {
      protocolVersion: Math.min(1, params.protocolVersion),
      agentCapabilities: {
        promptCapabilities: {
          embeddedContext: true,
        },
      },
    };
  }

  async authenticate(): Promise<void> {
    // Authentication is handled out-of-band via `codex login` or `CODEX_API_KEY`.
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    if (!params.cwd) {
      throw RequestError.invalidParams({ message: "cwd is required" });
    }

    if (params.mcpServers.length > 0) {
      this.logger.warn("Ignoring MCP server configuration", { count: params.mcpServers.length });
    }

    const thread = this.createThread({ cwd: params.cwd });
    const sessionId = randomUUID();

    const state = createSessionState({
      id: sessionId,
      thread,
      workingDirectory: params.cwd,
      model: this.config.model,
    });

    this.sessions.set(sessionId, state);
    this.logger.info("session created", { sessionId, cwd: params.cwd });

    try {
      await this.slashCommands.refresh();
    } catch (error) {
      this.logger.warn("failed to refresh slash commands", { message: (error as Error).message });
    }

    setImmediate(() => {
      void this.advertiseAvailableCommands(state);
    });

    return {
      sessionId,
    };
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    const session = this.requireSession(params.sessionId);

    if (session.activeTurn && !session.activeTurn.finished) {
      throw RequestError.invalidRequest({ message: "session already has an active prompt" });
    }

    try {
      await this.slashCommands.refreshIfNeeded();
    } catch (error) {
      this.logger.warn("failed to refresh slash commands", { sessionId: session.id, message: (error as Error).message });
    }

    const slashCommand = this.slashCommands.match(params.prompt);
    let promptBlocks = params.prompt;
    if (slashCommand) {
      try {
        promptBlocks = this.transformBlocksForSlashCommand(session, params.prompt, slashCommand);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn("slash command expansion failed", { sessionId: session.id, message });
        await this.emitAgentMessage(session, message);
        return { stopReason: "refusal" };
      }
    }

    const promptText = renderPrompt(promptBlocks);
    this.logger.debug("prompt start", { sessionId: params.sessionId, length: promptText.length });

    const { events } = await session.thread.runStreamed(promptText);
    const iterator = events[Symbol.asyncIterator]();

    session.activeTurn = {
      iterator,
      cancelRequested: false,
      finished: false,
    };

    let stopReason: PromptResponse["stopReason"] = "end_turn";
    let finished = false;

    try {
      while (true) {
        if (session.activeTurn?.cancelRequested) {
          this.logger.debug("prompt cancelled", { sessionId: session.id });
          stopReason = "cancelled";
          await iterator.return?.(undefined);
          finished = true;
          break;
        }

        const { value, done } = await iterator.next();
        if (done) {
          finished = true;
          break;
        }

        const event = value as ThreadEvent;
        const result = await this.handleEvent(session, event);
        if (result?.stopReason) {
          stopReason = result.stopReason;
        }
        if (result?.terminate) {
          finished = true;
          break;
        }
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error("prompt loop error", { sessionId: session.id, message: err.message });
      await this.emitAgentMessage(session, `Codex error: ${err.message}`);
      stopReason = session.activeTurn?.cancelRequested ? "cancelled" : "refusal";
    } finally {
      session.activeTurn = undefined;
      if (!finished) {
        try {
          await iterator.return?.(undefined);
        } catch (closeError) {
          this.logger.warn("failed to close iterator", { message: (closeError as Error).message });
        }
      }
    }

    return { stopReason };
  }

  async cancel(params: CancelNotification): Promise<void> {
    const session = this.requireSession(params.sessionId);
    if (!session.activeTurn) {
      this.logger.debug("cancel ignored: no active turn", { sessionId: params.sessionId });
      return;
    }

    session.activeTurn.cancelRequested = true;
    try {
      await session.activeTurn.iterator.return?.(undefined);
      session.activeTurn.finished = true;
    } catch (error) {
      this.logger.warn("cancel return failed", { message: (error as Error).message });
    }
  }

  // Optional ACP methods left unimplemented intentionally.
  private createThread(params: { cwd: string }): Thread {
    return this.codex.startThread({
      workingDirectory: params.cwd,
      sandboxMode: this.config.sandboxMode,
      skipGitRepoCheck: this.config.skipGitRepoCheck,
      model: this.config.model,
    });
  }

  private requireSession(sessionId: string): SessionState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw RequestError.invalidParams({ message: `Unknown session ${sessionId}` });
    }
    return session;
  }

  private async advertiseAvailableCommands(session: SessionState): Promise<void> {
    try {
      await this.slashCommands.refreshIfNeeded();

      const availableCommands = this.slashCommands.getAvailableCommands();
      if (availableCommands.length === 0) return;

      await this.connection.sessionUpdate({
        sessionId: session.id,
        update: {
          sessionUpdate: "available_commands_update",
          availableCommands,
        },
      });
      this.logger.debug("advertised slash commands", {
        sessionId: session.id,
        commands: availableCommands.map((command) => command.name),
      });
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn("failed to advertise slash commands", { sessionId: session.id, message });
    }
  }

  private transformBlocksForSlashCommand(
    session: SessionState,
    blocks: ContentBlock[],
    match: SlashCommandMatch,
  ): ContentBlock[] {
    const transformed = this.slashCommands.apply(blocks, match, {
      workingDirectory: session.workingDirectory,
      model: session.model,
    });

    this.logger.debug("slash command detected", {
      sessionId: session.id,
      command: match.definition.name,
    });

    return transformed;
  }

  private async handleEvent(session: SessionState, event: ThreadEvent): Promise<EventResult> {
    switch (event.type) {
      case "thread.started":
        this.logger.debug("thread started", { sessionId: session.id, threadId: event.thread_id });
        return {};
      case "turn.started":
        this.logger.debug("turn started", { sessionId: session.id });
        return {};
      case "item.started":
        await this.handleItemEvent(session, event as ItemStartedEvent, "started");
        return {};
      case "item.updated":
        await this.handleItemEvent(session, event as ItemUpdatedEvent, "updated");
        return {};
      case "item.completed":
        await this.handleItemEvent(session, event as ItemCompletedEvent, "completed");
        return {};
      case "turn.completed":
        this.logger.debug("turn completed", { sessionId: session.id, usage: event.usage });
        return { stopReason: "end_turn", terminate: true };
      case "turn.failed":
        this.logger.warn("turn failed", { sessionId: session.id, error: event.error.message });
        await this.emitAgentMessage(session, `Codex run failed: ${event.error.message}`);
        return { stopReason: session.activeTurn?.cancelRequested ? "cancelled" : "refusal", terminate: true };
      case "error":
        this.logger.error("stream error", { sessionId: session.id, message: event.message });
        await this.emitAgentMessage(session, `Codex stream error: ${event.message}`);
        return { stopReason: "refusal", terminate: true };
      default:
        this.logger.debug("unhandled event", { type: (event as ThreadEvent).type });
        return {};
    }
  }

  private async handleItemEvent(
    session: SessionState,
    event: ItemStartedEvent | ItemUpdatedEvent | ItemCompletedEvent,
    phase: "started" | "updated" | "completed",
  ): Promise<void> {
    const item = event.item;
    switch (item.type) {
      case "agent_message":
        await this.processAgentMessage(session, item, phase);
        break;
      case "reasoning":
        await this.processReasoning(session, item, phase);
        break;
      case "command_execution":
        await this.processCommandExecution(session, item, phase);
        break;
      case "file_change":
        await this.processFileChange(session, item, phase);
        break;
      case "mcp_tool_call":
        await this.processMcpToolCall(session, item, phase);
        break;
      case "web_search":
        await this.processWebSearch(session, item, phase);
        break;
      case "todo_list":
        await this.processTodoList(session, item);
        break;
      case "error":
        await this.emitAgentMessage(session, `Codex error item: ${item.message}`);
        break;
      default:
        this.logger.debug("ignored item", {});
    }
  }

  private async processAgentMessage(
    session: SessionState,
    item: AgentMessageItem,
    phase: "started" | "updated" | "completed",
  ) {
    if (phase === "started" && item.text.length === 0) {
      // No content yet.
      return;
    }

    const delta = this.computeDelta(session.agentMessageBuffer, item.id, item.text);
    if (!delta) return;

    await this.emitAgentMessage(session, delta);
  }

  private async processReasoning(
    session: SessionState,
    item: ReasoningItem,
    phase: "started" | "updated" | "completed",
  ) {
    if (!this.config.sendReasoning) return;
    if (phase === "started" && item.text.length === 0) return;

    const delta = this.computeDelta(session.reasoningBuffer, item.id, item.text);
    if (!delta) return;

    await this.connection.sessionUpdate({
      sessionId: session.id,
      update: {
        sessionUpdate: "agent_thought_chunk",
        content: this.textBlock(delta),
      },
    });
  }

  private async processCommandExecution(
    session: SessionState,
    item: CommandExecutionItem,
    phase: "started" | "updated" | "completed",
  ) {
    if (!this.config.allowCommands) return;

    const status = this.mapCommandStatus(item.status);
    if (phase === "started") {
      await this.connection.sessionUpdate({
        sessionId: session.id,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: item.id,
          title: `Run: ${item.command}`,
          kind: "execute",
          status,
          content: item.aggregated_output
            ? [this.textContent(item.aggregated_output)]
            : undefined,
          rawOutput: undefined,
        },
      });
      return;
    }

    const delta = this.computeDelta(session.commandOutputBuffer, item.id, item.aggregated_output);

    await this.connection.sessionUpdate({
      sessionId: session.id,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: item.id,
        status,
        content: delta ? [this.textContent(delta)] : undefined,
        rawOutput: item.exit_code !== undefined ? { exitCode: item.exit_code } : undefined,
      },
    });
  }

  private async processFileChange(
    session: SessionState,
    item: FileChangeItem,
    phase: "started" | "updated" | "completed",
  ) {
    const title = phase === "started" ? "Proposed file changes" : "File changes";
    const lines = item.changes.map((change) => `${change.kind.toUpperCase()} ${change.path}`);
    const content = lines.length > 0 ? lines.join("\n") : "No file updates";

    const update: SessionNotification["update"] =
      phase === "started"
        ? {
            sessionUpdate: "tool_call",
            toolCallId: item.id,
            title,
            kind: "edit",
            status: item.status === "failed" ? "failed" : "in_progress",
            content: [this.textContent(content)],
          }
        : {
            sessionUpdate: "tool_call_update",
            toolCallId: item.id,
            status: this.mapPatchStatus(item.status),
            content: [this.textContent(content)],
          };

    await this.connection.sessionUpdate({
      sessionId: session.id,
      update,
    });
  }

  private async processMcpToolCall(
    session: SessionState,
    item: McpToolCallItem,
    phase: "started" | "updated" | "completed",
  ) {
    const context: ToolCallContext = {
      kind: "fetch",
      title: `MCP ${item.server}.${item.tool}`,
    };
    await this.emitToolCall(session, item.id, item.status, context, phase);
  }

  private async processWebSearch(
    session: SessionState,
    item: WebSearchItem,
    phase: "started" | "updated" | "completed",
  ) {
    const context: ToolCallContext = {
      kind: "search",
      title: `Web search: ${item.query}`,
    };
    const status = phase === "completed" ? "completed" : "in_progress";
    await this.emitToolCall(session, item.id, status, context, phase);
  }

  private async processTodoList(session: SessionState, item: TodoListItem) {
    const entries: PlanEntry[] = item.items.map((todo) => ({
      content: todo.text,
      priority: todo.completed ? "medium" : "high",
      status: todo.completed ? "completed" : "pending",
    }));

    await this.connection.sessionUpdate({
      sessionId: session.id,
      update: {
        sessionUpdate: "plan",
        entries,
      },
    });
  }

  private async emitAgentMessage(session: SessionState, text: string) {
    if (!text.trim()) return;

    await this.connection.sessionUpdate({
      sessionId: session.id,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: this.textBlock(text),
      },
    });
  }

  private async emitToolCall(
    session: SessionState,
    toolCallId: string,
    status: "in_progress" | "completed" | "failed",
    context: ToolCallContext,
    phase: "started" | "updated" | "completed",
  ) {
    const update: SessionNotification["update"] =
      phase === "started"
        ? {
            sessionUpdate: "tool_call",
            toolCallId,
            title: context.title,
            kind: context.kind,
            status,
          }
        : {
            sessionUpdate: "tool_call_update",
            toolCallId,
            title: context.title,
            kind: context.kind,
            status,
          };

    await this.connection.sessionUpdate({
      sessionId: session.id,
      update,
    });
  }

  private computeDelta(buffer: Map<string, string>, key: string, next: string | undefined): string | undefined {
    if (next === undefined) return undefined;
    const previous = buffer.get(key) ?? "";
    if (next.startsWith(previous)) {
      const delta = next.slice(previous.length);
      buffer.set(key, next);
      return delta;
    }

    buffer.set(key, next);
    return next;
  }

  private textBlock(text: string): ContentBlock {
    return {
      type: "text",
      text,
    };
  }

  private textContent(text: string): ToolCallContent {
    return {
      type: "content",
      content: this.textBlock(text),
    };
  }

  private mapCommandStatus(status: CommandExecutionItem["status"]): "pending" | "in_progress" | "completed" | "failed" {
    switch (status) {
      case "in_progress":
        return "in_progress";
      case "completed":
        return "completed";
      case "failed":
        return "failed";
      default:
        return "in_progress";
    }
  }

  private mapPatchStatus(status: FileChangeItem["status"]): "pending" | "in_progress" | "completed" | "failed" {
    switch (status) {
      case "completed":
        return "completed";
      case "failed":
        return "failed";
      default:
        return "in_progress";
    }
  }
}
