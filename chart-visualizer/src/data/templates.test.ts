import mermaid from 'mermaid'
import { beforeAll, describe, expect, it } from 'vitest'
import { diagramTemplates } from '@/data/templates'

describe('diagram templates', () => {
  beforeAll(() => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
  })

  it.each(diagramTemplates.map((template) => [template.title, template.code] as const))(
    '%s 使用当前 Mermaid 版本可解析',
    async (_title, code) => {
      await expect(mermaid.parse(code)).resolves.toBeTruthy()
    },
  )
})
