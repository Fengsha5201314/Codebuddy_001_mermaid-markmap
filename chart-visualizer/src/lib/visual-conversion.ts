export interface DrawioMermaidCompatibilityResult {
  source: string
  normalized: boolean
  note?: string
}

/**
 * diagrams.net's Mermaid importer can lag behind the Mermaid renderer bundled by
 * the workbench. Keep conversion deterministic by lowering syntax that has a
 * structurally equivalent flowchart representation before sending it to the iframe.
 */
export function toDrawioCompatibleMermaid(source: string): DrawioMermaidCompatibilityResult {
  const swimlaneDirective = /^(\s*)swimlane-beta(?:\s+(TB|TD|BT|RL|LR))?/m
  if (swimlaneDirective.test(source)) {
    return {
      source: source.replace(swimlaneDirective, (_match, indent: string, direction?: string) =>
        `${indent}flowchart ${direction || 'LR'}`,
      ),
      normalized: true,
      note: '泳道已转换为兼容的分组流程图，节点与连线保持可编辑。',
    }
  }

  return { source, normalized: false }
}
