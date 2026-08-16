import { describe, expect, it } from 'vitest'
import { parseImportFile } from '@/lib/file-io'

function importFile(name: string, text: string): File {
  return { name, size: new Blob([text]).size, text: async () => text } as File
}

describe('diagram file import', () => {
  it('imports an exported .drawio file as a visual document source', async () => {
    const xml = '<mxfile><diagram name="Page-1"><mxGraphModel><root /></mxGraphModel></diagram></mxfile>'
    await expect(parseImportFile(importFile('采购流程.drawio', xml))).resolves.toEqual({
      type: 'visual',
      title: '采购流程',
      drawioXml: xml,
    })
  })

  it('rejects malformed or unsafe .drawio content with a useful message', async () => {
    const file = importFile('损坏.drawio', '<mxfile><diagram><script /></diagram></mxfile>')
    await expect(parseImportFile(file)).rejects.toThrow('无法导入 draw.io 文件')
  })
})
