export function createSessionState(params) {
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
//# sourceMappingURL=session-state.js.map