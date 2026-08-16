import { useMemo, useState } from 'react'
import { Clock3, CodeXml, Palette, Plus, RotateCcw, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { AiAssistant } from '@/components/AiAssistant'
import { snippets } from '@/data/snippets'
import { diagramThemes } from '@/data/themes'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { RenderError } from '@/types'

interface InspectorProps {
  onInsert: (code: string) => void
  onClose: () => void
  onOpenSettings: () => void
  renderError: RenderError | null
}

type InspectorTab = 'ai' | 'style' | 'snippets' | 'versions'

export function Inspector({ onInsert, onClose, onOpenSettings, renderError }: InspectorProps) {
  const documents = useWorkspaceStore((state) => state.documents)
  const activeId = useWorkspaceStore((state) => state.activeDocumentId)
  const update = useWorkspaceStore((state) => state.updateActiveDocument)
  const setTheme = useWorkspaceStore((state) => state.setTheme)
  const createVersion = useWorkspaceStore((state) => state.createVersion)
  const restoreVersion = useWorkspaceStore((state) => state.restoreVersion)
  const [tab, setTab] = useState<InspectorTab>('ai')
  const active = documents.find((document) => document.id === activeId)

  const groupedSnippets = useMemo(
    () => snippets.reduce<Record<string, typeof snippets>>((groups, snippet) => {
      ;(groups[snippet.group] ??= []).push(snippet)
      return groups
    }, {}),
    [],
  )
  if (!active) return null

  return (
    <aside className="inspector">
      <div className="inspector-tabs" role="tablist">
        <button className={tab === 'ai' ? 'active ai-tab' : 'ai-tab'} onClick={() => setTab('ai')} role="tab" aria-selected={tab === 'ai'}>
          <Sparkles size={15} />AI
        </button>
        <button className={tab === 'style' ? 'active' : ''} onClick={() => setTab('style')} role="tab" aria-selected={tab === 'style'}>
          <SlidersHorizontal size={15} />样式
        </button>
        <button className={tab === 'snippets' ? 'active' : ''} onClick={() => setTab('snippets')} role="tab" aria-selected={tab === 'snippets'}>
          <CodeXml size={15} />组件
        </button>
        <button className={tab === 'versions' ? 'active' : ''} onClick={() => setTab('versions')} role="tab" aria-selected={tab === 'versions'}>
          <Clock3 size={15} />版本
        </button>
        <button className="inspector-close" onClick={onClose} aria-label="关闭工具面板" title="关闭工具面板">
          <X size={16} />
        </button>
      </div>

      <div className="inspector-content">
        {tab === 'ai' && <AiAssistant renderError={renderError} onOpenSettings={onOpenSettings} />}
        {tab === 'style' && (
          <>
            <div className="inspector-heading">
              <div><Palette size={16} /><strong>交付主题</strong></div>
              <span>实时应用</span>
            </div>
            <div className="theme-grid">
              {diagramThemes.map((theme) => (
                <button
                  key={theme.id}
                  className={active.themeId === theme.id ? 'active' : ''}
                  onClick={() => setTheme(theme.id)}
                >
                  <span className="theme-swatch" style={{ background: theme.canvas }}>
                    <i style={{ background: theme.primary }} />
                    <b style={{ background: theme.secondary }} />
                  </span>
                  <span><strong>{theme.name}</strong><small>{theme.description}</small></span>
                </button>
              ))}
            </div>

            <div className="inspector-heading spaced">
              <div><Sparkles size={16} /><strong>图表信息</strong></div>
            </div>
            <label className="field-label">
              <span>标题</span>
              <input value={active.title} onChange={(event) => update({ title: event.target.value })} />
            </label>
            <label className="field-label">
              <span>说明</span>
              <textarea rows={3} value={active.description} onChange={(event) => update({ description: event.target.value })} />
            </label>
            <label className="field-label">
              <span>标签 <small>用逗号分隔</small></span>
              <input
                value={active.tags.join(', ')}
                onChange={(event) => update({ tags: event.target.value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) })}
              />
            </label>
            {(active.kind === 'swimlane' || active.kind === 'architecture' || active.kind === 'c4') && (
              <div className="beta-note">
                <strong>实验语法兼容提示</strong>
                <p>此图种依赖 Mermaid 11.16。导出图片不受影响；复制源码到旧环境时需确认版本。</p>
              </div>
            )}
          </>
        )}

        {tab === 'snippets' && (
          <>
            <div className="inspector-heading">
              <div><CodeXml size={16} /><strong>快速插入</strong></div>
              <span>插入到光标</span>
            </div>
            <p className="inspector-intro">不用背语法。选择常用节点、连线和分组，然后在源码中改名称即可。</p>
            {Object.entries(groupedSnippets).map(([group, items]) => (
              <div className="snippet-group" key={group}>
                <h4>{group}</h4>
                <div className="snippet-list">
                  {items?.map((snippet) => (
                    <button key={snippet.id} onClick={() => onInsert(snippet.code)}>
                      <Plus size={14} />
                      <span><strong>{snippet.label}</strong><small>{snippet.hint}</small></span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'versions' && (
          <>
            <div className="inspector-heading">
              <div><Clock3 size={16} /><strong>本地版本</strong></div>
              <button className="text-button" onClick={() => createVersion()}>存新版本</button>
            </div>
            <p className="inspector-intro">自动保存负责防丢；版本快照用于标记可回退的关键节点，最多保留 30 个。</p>
            <div className="version-list">
              {active.versions.map((version, index) => (
                <article key={version.id}>
                  <span className="version-index">V{active.versions.length - index}</span>
                  <div><strong>{version.label}</strong><small>{new Date(version.createdAt).toLocaleString('zh-CN')}</small></div>
                  <button onClick={() => {
                    if (window.confirm(`恢复“${version.label}”吗？当前内容仍会被自动保存，但建议先存一个版本。`)) restoreVersion(version.id)
                  }} title="恢复此版本"><RotateCcw size={14} /></button>
                </article>
              ))}
              {!active.versions.length && (
                <div className="version-empty"><Clock3 size={26} /><p>还没有手动版本</p><button onClick={() => createVersion()}>保存当前版本</button></div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
