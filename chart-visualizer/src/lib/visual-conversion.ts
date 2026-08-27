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
  let compatible = source
  const notes: string[] = []
  if (swimlaneDirective.test(compatible)) {
    compatible = compatible.replace(swimlaneDirective, (_match, indent: string, direction?: string) =>
      `${indent}flowchart ${direction || 'LR'}`,
    )
    notes.push('泳道已转换为兼容的分组流程图，节点与连线保持可编辑。')
  }

  const withoutAccessibility = compatible
    .replace(/^\s*accTitle\s*:[^\r\n]*(?:\r?\n|$)/gim, '')
    .replace(/^\s*accDescr\s*:[^\r\n]*(?:\r?\n|$)/gim, '')
    .replace(/^\s*accDescr\s*\{[\s\S]*?^\s*\}\s*(?:\r?\n|$)/gim, '')
  if (withoutAccessibility !== compatible) {
    compatible = withoutAccessibility
    notes.push('无障碍标题与描述保留在 Mermaid 源码中，不作为可视化节点导入。')
  }

  return {
    source: compatible,
    normalized: compatible !== source,
    ...(notes.length ? { note: notes.join(' ') } : {}),
  }
}
