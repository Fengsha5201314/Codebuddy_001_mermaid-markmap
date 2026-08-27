import { describe, expect, it } from 'vitest'
import { validateDrawioXml } from '@/lib/drawio-xml'

describe('draw.io XML validation', () => {
  it('accepts a normal mxGraph document', () => {
    expect(validateDrawioXml('<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>')).toBeNull()
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
})
