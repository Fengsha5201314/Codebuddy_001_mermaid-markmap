// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { assessDrawioDiagram, assessMermaidDiagram } from './reliable-diagram-delivery'

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
})
