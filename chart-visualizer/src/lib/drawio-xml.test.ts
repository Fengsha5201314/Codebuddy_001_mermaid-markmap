import { describe, expect, it } from 'vitest'
import { deflateRaw } from 'pako'
import { validateDrawioXml } from '@/lib/drawio-xml'
import swimlanesTemplate from '../../vendor/drawio/templates/basic/swimlanes.xml?raw'

function compressedPage(model: string): string {
  const compressed = deflateRaw(encodeURIComponent(model))
  return btoa([...compressed].map((value) => String.fromCharCode(value)).join(''))
}

describe('draw.io XML validation', () => {
  it('accepts a normal mxGraph document', () => {
    expect(validateDrawioXml('<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>')).toBeNull()
  })

  it('accepts diagrams.net UserObject wrappers used by Mermaid imports', () => {
    const wrapped = '<mxfile><diagram><mxGraphModel><root><UserObject id="0" label="" mermaidSource="flowchart LR"><mxCell/></UserObject><mxCell id="1" parent="0"/><UserObject id="group" label=""><mxCell vertex="1" parent="1" style="group;transparentBounds=1;"><mxGeometry as="geometry"/></mxCell></UserObject><UserObject id="node" label="开始"><mxCell vertex="1" parent="group"><mxGeometry x="20" y="20" width="100" height="50" as="geometry"/></mxCell></UserObject></root></mxGraphModel></diagram></mxfile>'
    expect(validateDrawioXml(wrapped)).toBeNull()
  })

  it('rejects malformed or unsafe XML', () => {
    expect(validateDrawioXml('<mxfile>\n<diagram></mxfile>')).toMatch(/格式.*第 2 行|格式.*2:/)
    expect(validateDrawioXml('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><mxfile />')).toContain('外部实体')
    expect(validateDrawioXml('<mxfile><diagram><mxGraphModel><script /></mxGraphModel></diagram></mxfile>')).toContain('脚本')
  })

  it('rejects graph-model reference errors before the candidate reaches draw.io', () => {
    expect(validateDrawioXml('<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="same" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell><mxCell id="same" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>')).toContain('重复 ID：same')
    expect(validateDrawioXml('<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="edge" edge="1" parent="1" source="missing" target="1"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>')).toContain('不存在的 source：missing')
    expect(validateDrawioXml('<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="node" vertex="1" parent="1"/></root></mxGraphModel></diagram></mxfile>')).toContain('缺少 mxGeometry')
  })

  it('rejects fake compressed pages and invalid geometry values', () => {
    expect(validateDrawioXml('<mxfile><diagram id="bad">not-a-graph</diagram></mxfile>')).toContain('不是可识别')
    expect(validateDrawioXml('<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="node" vertex="1" parent="1"><mxGeometry x="0" y="0" width="NaN" height="30" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>')).toContain('width')
  })

  it('decompresses declared diagrams.net pages before validating their graph references', () => {
    const model = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="edge" edge="1" parent="1" source="missing" target="1"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel>'
    const xml = `<?xml version="1.0" encoding="UTF-8"?><mxfile><diagram id="page-1">${compressedPage(model)}</diagram></mxfile>`
    expect(validateDrawioXml(xml)).toContain('不存在的 source：missing')
  })

  it('applies the unsafe-content policy after decompression', () => {
    const model = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><script>alert(1)</script></root></mxGraphModel>'
    const xml = `<mxfile><diagram id="page-1">${compressedPage(model)}</diagram></mxfile>`
    expect(validateDrawioXml(xml)).toContain('不安全的脚本内容')
  })

  it('accepts a standard relative edge label with zero-size geometry', () => {
    const xml = '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="A" vertex="1" parent="1"><mxGeometry width="80" height="40" as="geometry"/></mxCell><mxCell id="b" value="B" vertex="1" parent="1"><mxGeometry x="160" width="80" height="40" as="geometry"/></mxCell><mxCell id="edge" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell><mxCell id="edge-label" value="通过" style="edgeLabel;html=1;" vertex="1" connectable="0" parent="edge"><mxGeometry x="0" y="0" width="0" height="0" relative="1" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>'
    expect(validateDrawioXml(xml)).toBeNull()
  })

  it('accepts a real compressed diagrams.net template from the bundled runtime', () => {
    expect(validateDrawioXml(swimlanesTemplate)).toBeNull()
  })
})
