import { describe, expect, it } from 'vitest'
import { validateDrawioXml } from '@/lib/drawio-xml'

describe('draw.io XML validation', () => {
  it('accepts a normal mxGraph document', () => {
    expect(validateDrawioXml('<mxfile><diagram><mxGraphModel><root /></mxGraphModel></diagram></mxfile>')).toBeNull()
  })

  it('rejects malformed or unsafe XML', () => {
    expect(validateDrawioXml('<mxfile><diagram></mxfile>')).toContain('格式')
    expect(validateDrawioXml('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><mxfile />')).toContain('外部实体')
    expect(validateDrawioXml('<mxfile><diagram><mxGraphModel><script /></mxGraphModel></diagram></mxfile>')).toContain('脚本')
  })
})
