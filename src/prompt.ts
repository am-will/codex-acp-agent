import type {
  ContentBlock,
  TextResourceContents,
  BlobResourceContents,
} from "@zed-industries/agent-client-protocol";

type ResourceLinkBlock = Extract<ContentBlock, { type: "resource_link" }>;

export interface PromptRenderOptions {
  includeResourceHeaders?: boolean;
}

const DEFAULT_OPTIONS: Required<PromptRenderOptions> = {
  includeResourceHeaders: true,
};

export function renderPrompt(blocks: ContentBlock[], options: PromptRenderOptions = DEFAULT_OPTIONS): string {
  const mergedOptions: Required<PromptRenderOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const sections: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "text":
        sections.push(block.text.trim());
        break;
      case "resource":
        sections.push(renderEmbeddedResource(block.resource, mergedOptions.includeResourceHeaders));
        break;
      case "resource_link":
        sections.push(renderResourceLink(block));
        break;
      case "image":
        sections.push(`Image resource (${block.mimeType}${block.uri ? `, ${block.uri}` : ""})`);
        break;
      case "audio":
        sections.push(`Audio resource (${block.mimeType}) attached`);
        break;
      default:
        sections.push("Unsupported content block");
        break;
    }
  }

  return sections.filter((section) => section.length > 0).join("\n\n");
}

function renderEmbeddedResource(resource: TextResourceContents | BlobResourceContents, includeHeader: boolean): string {
  if (isTextResource(resource)) {
    const header = includeHeader ? `# Embedded resource: ${resource.uri}` : undefined;
    return [header, resource.text.trim()].filter(Boolean).join("\n\n");
  }

  return `Binary resource ${resource.uri} (${resource.mimeType ?? "unknown"}) attached.`;
}

function renderResourceLink(block: ResourceLinkBlock): string {
  const name = block.title ?? block.name;
  const header = name ? `Linked resource: ${name}` : "Linked resource";
  const description = block.description ? `\n${block.description}` : "";
  return `${header}\n${block.uri}${description}`;
}

function isTextResource(resource: TextResourceContents | BlobResourceContents): resource is TextResourceContents {
  return (resource as TextResourceContents).text !== undefined;
}
