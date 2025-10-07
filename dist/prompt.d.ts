import type { ContentBlock } from "@zed-industries/agent-client-protocol";
export interface PromptRenderOptions {
    includeResourceHeaders?: boolean;
}
export declare function renderPrompt(blocks: ContentBlock[], options?: PromptRenderOptions): string;
