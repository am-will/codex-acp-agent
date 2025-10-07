const DEFAULT_OPTIONS = {
    includeResourceHeaders: true,
};
export function renderPrompt(blocks, options = DEFAULT_OPTIONS) {
    const mergedOptions = {
        ...DEFAULT_OPTIONS,
        ...options,
    };
    const sections = [];
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
function renderEmbeddedResource(resource, includeHeader) {
    if (isTextResource(resource)) {
        const header = includeHeader ? `# Embedded resource: ${resource.uri}` : undefined;
        return [header, resource.text.trim()].filter(Boolean).join("\n\n");
    }
    return `Binary resource ${resource.uri} (${resource.mimeType ?? "unknown"}) attached.`;
}
function renderResourceLink(block) {
    const name = block.title ?? block.name;
    const header = name ? `Linked resource: ${name}` : "Linked resource";
    const description = block.description ? `\n${block.description}` : "";
    return `${header}\n${block.uri}${description}`;
}
function isTextResource(resource) {
    return resource.text !== undefined;
}
//# sourceMappingURL=prompt.js.map