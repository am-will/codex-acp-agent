import { describe, expect, it } from "vitest";
import type { ContentBlock } from "@zed-industries/agent-client-protocol";
import { renderPrompt } from "../src/prompt.js";

describe("renderPrompt", () => {
  it("concatenates text blocks with spacing", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "Explain the build failure." },
      { type: "text", text: "Focus on the failing tests." },
    ];

    const prompt = renderPrompt(blocks);
    expect(prompt).toContain("Explain the build failure.");
    expect(prompt).toContain("Focus on the failing tests.");
    expect(prompt).toMatch(/\n\n/);
  });

  it("renders embedded text resources with header", () => {
    const blocks: ContentBlock[] = [
      {
        type: "resource",
        resource: {
          uri: "file:///workspace/src/app.ts",
          text: "const value = 42;",
          mimeType: "text/plain",
        },
      },
    ];

    const prompt = renderPrompt(blocks);
    expect(prompt).toContain("# Embedded resource");
    expect(prompt).toContain("const value = 42;");
  });
});
