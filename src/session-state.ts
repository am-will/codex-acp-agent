import type { Thread } from "@openai/codex-sdk";

export interface ActiveTurnState {
  iterator: AsyncIterator<unknown>;
  cancelRequested: boolean;
  finished: boolean;
}

export interface SessionState {
  id: string;
  thread: Thread;
  workingDirectory: string;
  model?: string;
  activeTurn?: ActiveTurnState;
  /** Tracks incremental agent message content keyed by item id. */
  agentMessageBuffer: Map<string, string>;
  /** Tracks incremental reasoning updates keyed by item id. */
  reasoningBuffer: Map<string, string>;
  /** Tracks incremental command output keyed by item id. */
  commandOutputBuffer: Map<string, string>;
}

export function createSessionState(params: {
  id: string;
  thread: Thread;
  workingDirectory: string;
  model?: string;
}): SessionState {
  return {
    id: params.id,
    thread: params.thread,
    workingDirectory: params.workingDirectory,
    model: params.model,
    agentMessageBuffer: new Map(),
    reasoningBuffer: new Map(),
    commandOutputBuffer: new Map(),
  };
}
