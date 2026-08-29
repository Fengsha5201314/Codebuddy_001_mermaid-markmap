// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { deflateRaw } from 'pako'
import { assessDrawioDiagram, assessMermaidDiagram } from './reliable-diagram-delivery'
import swimlanesTemplate from '../../vendor/drawio/templates/basic/swimlanes.xml?raw'

function compressedPage(model: string): string {
  const compressed = deflateRaw(encodeURIComponent(model))
  return btoa([...compressed].map((value) => String.fromCharCode(value)).join(''))
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('').toUpperCase()
}

const overlappingDrawio = `<mxfile><diagram name="Page-1"><mxGraphModel><root>
  <mxCell id="0"/><mxCell id="1" parent="0"/>
  <mxCell id="a" value="这是一个非常非常长而且需要自动换行的中文业务处理节点" style="rounded=1;fontSize=14;" vertex="1" parent="1"><mxGeometry x="20" y="20" width="100" height="30" as="geometry"/></mxCell>
  <mxCell id="b" value="复核" style="rounded=1;fontSize=14;" vertex="1" parent="1"><mxGeometry x="80" y="30" width="100" height="50" as="geometry"/></mxCell>
  <mxCell id="e" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`

describe('reliable diagram delivery module', () => {
  it('returns stable object-level diagnostics for the same bad draw.io input', async () => {
    const first = await assessDrawioDiagram(overlappingDrawio, 'professional')
    const second = await assessDrawioDiagram(overlappingDrawio, 'professional')
    const normalize = (value: typeof first) => value.diagnostics.map(({ code, subject, evidence }) => ({ code, subject, evidence }))
    expect(normalize(first)).toEqual(normalize(second))
    expect(first.ok).toBe(false)
    expect(first.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'layout/text-overflow', subject: expect.objectContaining({ id: 'a' }) }),
      expect.objectContaining({ code: 'layout/node-overlap', subject: expect.objectContaining({ id: 'a' }) }),
    ]))
    expect(first.visualReview).toBe('pending')
  })

  it('keeps uncertain layout findings as warnings in standard mode', async () => {
    const result = await assessDrawioDiagram(overlappingDrawio, 'standard')
    expect(result.ok).toBe(true)
    expect(result.diagnostics.every((item) => item.severity === 'warning')).toBe(true)
    expect(result.checks.some((item) => item.status === 'warning')).toBe(true)
  })

  it('rejects unsafe or malformed draw.io source before geometry checks', async () => {
    const result = await assessDrawioDiagram('<mxfile><script>alert(1)</script></mxfile>', 'professional')
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toMatchObject({ code: 'structure/drawio-invalid', severity: 'error' })
  })

  it('creates a Mermaid receipt with hashes, counts and pending visual review', async () => {
    const svg = '<svg viewBox="0 0 320 180"><g class="nodes"><g class="node" id="n1"><rect class="label-container" width="120" height="48"/><text font-size="14">开始</text></g></g><g class="edgePath"><path d="M 0 0 L 10 10"/></g></svg>'
    const result = await assessMermaidDiagram('flowchart LR\n  A[开始]', { svg, width: 320, height: 180, kind: 'flowchart' }, 'professional', svg)
    expect(result.ok).toBe(true)
    expect(result.inputSha256).toMatch(/^[A-F0-9]{64}$/)
    expect(result.outputSha256).toMatch(/^[A-F0-9]{64}$/)
    expect(result.counts).toMatchObject({ nodes: 1, edges: 1 })
    expect(result.visualReview).toBe('pending')
    expect(result.acceptance).toBe('provisional')
  })

  it('rejects fake compressed and empty draw.io pages', async () => {
    const bad = await assessDrawioDiagram('<mxfile><diagram>not-a-graph</diagram></mxfile>', 'professional')
    expect(bad.ok).toBe(false)
    expect(bad.diagnostics[0].code).toBe('structure/drawio-invalid')

    const empty = await assessDrawioDiagram('<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>', 'professional')
    expect(empty.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'structure/empty-diagram' })]))
    const standardEmpty = await assessDrawioDiagram('<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>', 'standard')
    expect(standardEmpty.ok).toBe(false)

    const opaqueSourceWithBlankArtifact = await assessDrawioDiagram(
      '<mxfile><diagram>eJyrVkrLz1eyUkpKLFKqBQAQAA</diagram></mxfile>',
      'standard',
      '<svg viewBox="0 0 10 10"><rect data-fengsha-export-background="true" width="10" height="10"/></svg>',
    )
    expect(opaqueSourceWithBlankArtifact.ok).toBe(false)
    expect(opaqueSourceWithBlankArtifact.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'structure/empty-diagram', severity: 'error' }),
    ]))
  })

  it('checks the final exported SVG rather than trusting the preview markup', async () => {
    const preview = '<svg viewBox="0 0 100 60"><g class="node" id="n"><rect width="80" height="40"/></g></svg>'
    const final = '<svg viewBox="0 0 100 60"><script>alert(1)</script><g class="node" id="n"><rect width="80" height="40"/></g></svg>'
    const result = await assessMermaidDiagram('flowchart LR\nA[ok]', { svg: preview, width: 100, height: 60, kind: 'flowchart' }, 'professional', final)
    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'artifact/unsafe-content' })]))
  })

  it('detects nodes outside lanes and cross-parent overlaps', async () => {
    const xml = '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="lane" value="泳道" style="swimlane;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="200" height="120" as="geometry"/></mxCell><mxCell id="a" value="A" vertex="1" parent="lane"><mxGeometry x="160" y="50" width="80" height="50" as="geometry"/></mxCell><mxCell id="b" value="B" vertex="1" parent="1"><mxGeometry x="170" y="60" width="80" height="50" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>'
    const result = await assessDrawioDiagram(xml, 'professional')
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(['layout/lane-overflow', 'layout/node-overlap']))
  })

  it('assesses wrapped diagrams.net cells instead of treating them as opaque', async () => {
    const xml = '<mxfile><diagram><mxGraphModel><root><UserObject id="0" label=""><mxCell/></UserObject><mxCell id="1" parent="0"/><UserObject id="node" label="开始"><mxCell vertex="1" parent="1" style="rounded=1;fontSize=14;"><mxGeometry x="20" y="20" width="100" height="50" as="geometry"/></mxCell></UserObject></root></mxGraphModel></diagram></mxfile>'
    const result = await assessDrawioDiagram(xml, 'professional')
    expect(result.ok).toBe(true)
    expect(result.counts.nodes).toBe(1)
  })

  it('rejects an empty Mermaid flowchart even when the SVG shell is valid', async () => {
    const svg = '<svg viewBox="0 0 120 80"><defs><marker id="arrow"/></defs><g class="root"/></svg>'
    const result = await assessMermaidDiagram('flowchart LR', { svg, width: 120, height: 80, kind: 'flowchart' }, 'standard', svg)
    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'structure/empty-diagram', severity: 'error' }),
    ]))
  })

  it('rejects an empty non-flowchart Mermaid diagram', async () => {
    const svg = '<svg viewBox="0 0 120 80"><g class="sequenceDiagram"/></svg>'
    const result = await assessMermaidDiagram('sequenceDiagram', { svg, width: 120, height: 80, kind: 'sequence' }, 'professional', svg)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'structure/empty-diagram', severity: 'error' }),
    ]))

    const validSvg = '<svg viewBox="0 0 120 80"><g class="actor" id="user"><rect width="80" height="40"/><text>用户</text></g></svg>'
    const valid = await assessMermaidDiagram('sequenceDiagram\n  actor U as 用户', { svg: validSvg, width: 120, height: 80, kind: 'sequence' }, 'professional', validSvg)
    expect(valid.ok).toBe(true)
    expect(valid.counts.nodes).toBe(1)
  })

  it('runs full structure and geometry checks for standard compressed draw.io pages', async () => {
    const model = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="A" vertex="1" parent="1"><mxGeometry x="20" y="20" width="100" height="50" as="geometry"/></mxCell><mxCell id="b" value="B" vertex="1" parent="1"><mxGeometry x="60" y="30" width="100" height="50" as="geometry"/></mxCell></root></mxGraphModel>'
    const xml = `<?xml version="1.0" encoding="UTF-8"?><mxfile><diagram id="page-1">${compressedPage(model)}</diagram></mxfile>`
    const result = await assessDrawioDiagram(xml, 'professional')
    expect(result.counts.nodes).toBe(2)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'layout/node-overlap', subject: expect.objectContaining({ id: 'a' }) }),
    ]))
  })

  it('checks each draw.io page in its own coordinate system', async () => {
    const page = (id: string) => `<diagram id="${id}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="node" value="节点" vertex="1" parent="1"><mxGeometry x="20" y="20" width="100" height="50" as="geometry"/></mxCell></root></mxGraphModel></diagram>`
    const result = await assessDrawioDiagram(`<mxfile>${page('first')}${page('second')}</mxfile>`, 'professional')
    expect(result.counts.nodes).toBe(2)
    expect(result.diagnostics.some((item) => item.code === 'layout/node-overlap')).toBe(false)
  })

  it('falls back to a wrapped cell label when its value attribute is empty', async () => {
    const xml = '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><UserObject id="node" value="" label="这是一个必须参与可见性检查的很长很长的包装节点标题"><mxCell vertex="1" parent="1" style="rounded=1;fontSize=14;"><mxGeometry x="20" y="20" width="90" height="24" as="geometry"/></mxCell></UserObject></root></mxGraphModel></diagram></mxfile>'
    const result = await assessDrawioDiagram(xml, 'professional')
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'layout/text-overflow', subject: expect.objectContaining({ id: 'node' }) }),
    ]))
  })

  it('checks a node against every ancestor swimlane boundary', async () => {
    const xml = '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="lane" value="泳道" style="swimlane;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="200" height="120" as="geometry"/></mxCell><mxCell id="group" value="" style="group;" vertex="1" parent="lane"><mxGeometry x="20" y="20" width="160" height="80" as="geometry"/></mxCell><mxCell id="node" value="越界节点" vertex="1" parent="group"><mxGeometry x="140" y="20" width="50" height="30" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>'
    const result = await assessDrawioDiagram(xml, 'professional')
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'layout/lane-overflow', evidence: expect.objectContaining({ laneId: 'lane' }) }),
    ]))
  })

  it('does not count a relative edge label as a business node', async () => {
    const xml = '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="A" vertex="1" parent="1"><mxGeometry width="80" height="40" as="geometry"/></mxCell><mxCell id="b" value="B" vertex="1" parent="1"><mxGeometry x="160" width="80" height="40" as="geometry"/></mxCell><mxCell id="edge" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell><mxCell id="edge-label" value="通过" style="edgeLabel;html=1;" vertex="1" connectable="0" parent="edge"><mxGeometry x="0" y="0" width="0" height="0" relative="1" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>'
    const result = await assessDrawioDiagram(xml, 'professional')
    expect(result.ok).toBe(true)
    expect(result.counts).toMatchObject({ nodes: 2, edges: 1 })
  })

  it('does not report nested swimlane containers as sibling overlaps', async () => {
    const result = await assessDrawioDiagram(swimlanesTemplate, 'professional')
    expect(result.diagnostics.some((item) => item.code === 'layout/lane-overlap')).toBe(false)
  })

  it('can hash the original request independently from compiled Mermaid source', async () => {
    const rawInput = '{"version":1,"title":"原始计划"}'
    const compiled = 'flowchart LR\n  A[原始计划]'
    const svg = '<svg viewBox="0 0 120 80"><g class="node" id="a"><rect width="80" height="40"/><text>原始计划</text></g></svg>'
    const fromCompiled = await assessMermaidDiagram(compiled, { svg, width: 120, height: 80, kind: 'flowchart' }, 'professional', svg)
    const fromOriginal = await assessMermaidDiagram(compiled, { svg, width: 120, height: 80, kind: 'flowchart' }, 'professional', svg, rawInput)
    expect(fromOriginal.inputSha256).not.toBe(fromCompiled.inputSha256)
    expect(fromOriginal.inputSha256).toBe(await sha256(rawInput))
  })
})
