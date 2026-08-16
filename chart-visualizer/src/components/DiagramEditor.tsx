import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import Editor, { loader, type Monaco, type OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { Braces, PanelLeftClose, Search, WrapText } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace-store'

loader.config({ monaco })

self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
}

let languageRegistered = false

function registerMermaidLanguage(instance: Monaco) {
  if (languageRegistered) return
  languageRegistered = true
  instance.languages.register({ id: 'mermaid' })
  instance.languages.setMonarchTokensProvider('mermaid', {
    tokenizer: {
      root: [
        [/^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|erDiagram|gantt|journey|mindmap|architecture-beta|swimlane-beta|C4\w*)\b/, 'keyword'],
        [/^\s*(subgraph|section|participant|actor|service|group|junction|classDef|class|style|title|dateFormat|axisFormat|accTitle|accDescr)\b/, 'keyword'],
        [/%%.*$/, 'comment'],
        [/"[^"\\]*(?:\\.[^"\\]*)*"/, 'string'],
        [/\|[^|]+\|/, 'string'],
        [/-->|---|-.->|==>|<-->|--x|--o|\.{2,}/, 'operator'],
        [/[{}()[\]]/, '@brackets'],
        [/#(?:[0-9a-fA-F]{3}){1,2}\b/, 'number.hex'],
        [/\b(done|active|crit|milestone|true|false)\b/, 'constant'],
      ],
    },
  })
  instance.editor.defineTheme('diagram-ink', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '145C8E', fontStyle: 'bold' },
      { token: 'comment', foreground: '8492A6', fontStyle: 'italic' },
      { token: 'string', foreground: 'A14B2E' },
      { token: 'operator', foreground: '7C3AED', fontStyle: 'bold' },
      { token: 'number.hex', foreground: '047857' },
      { token: 'constant', foreground: '9B2C2C' },
    ],
    colors: {
      'editor.background': '#FBFCFE',
      'editor.foreground': '#25344A',
      'editorLineNumber.foreground': '#A3AEBD',
      'editorLineNumber.activeForeground': '#2864DC',
      'editor.lineHighlightBackground': '#F0F4FA',
      'editor.selectionBackground': '#D8E5FF',
      'editorCursor.foreground': '#D15C35',
      'editorIndentGuide.background1': '#E5EAF0',
    },
  })
}

export interface DiagramEditorHandle {
  insert: (text: string) => void
  focusLine: (line?: number) => void
}

interface DiagramEditorProps {
  onHideSource?: () => void
}

export const DiagramEditor = forwardRef<DiagramEditorHandle, DiagramEditorProps>(function DiagramEditor({ onHideSource }, ref) {
  const documents = useWorkspaceStore((state) => state.documents)
  const activeId = useWorkspaceStore((state) => state.activeDocumentId)
  const updateCode = useWorkspaceStore((state) => state.updateCode)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const active = documents.find((document) => document.id === activeId)

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  useImperativeHandle(ref, () => ({
    insert(text) {
      const editor = editorRef.current
      if (!editor) return
      const selection = editor.getSelection()
      if (!selection) return
      editor.executeEdits('snippet-panel', [{ range: selection, text, forceMoveMarkers: true }])
      editor.focus()
    },
    focusLine(line) {
      const editor = editorRef.current
      if (!editor) return
      if (line) {
        editor.revealLineInCenter(line)
        editor.setPosition({ lineNumber: line, column: 1 })
      }
      editor.focus()
    },
  }))

  useEffect(() => () => { editorRef.current = null }, [])

  if (!active) return null

  return (
    <section className="editor-panel" aria-label="Mermaid 源码编辑器">
      <div className="panel-titlebar">
        <div className="panel-title">
          <Braces size={15} />
          <strong>源码</strong>
          <span>{active.kind}</span>
        </div>
        <div className="panel-hints">
          <span><Search size={13} /> Ctrl+F</span>
          <span><WrapText size={13} /> 自动换行</span>
          {onHideSource && <button className="panel-visibility-action" onClick={onHideSource} title="隐藏源码区，只显示画布"><PanelLeftClose size={14} />隐藏源码</button>}
        </div>
      </div>
      <div className="editor-host">
        <Editor
          key={active.id}
          height="100%"
          language="mermaid"
          value={active.code}
          beforeMount={registerMermaidLanguage}
          onMount={handleMount}
          onChange={(value) => updateCode(value ?? '')}
          theme="diagram-ink"
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
            fontSize: 15,
            lineHeight: 24,
            lineNumbersMinChars: 3,
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            wordWrap: 'on',
            wrappingIndent: 'indent',
            tabSize: 2,
            insertSpaces: true,
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true },
            padding: { top: 16, bottom: 16 },
            renderLineHighlight: 'all',
            fixedOverflowWidgets: true,
          }}
        />
      </div>
      <footer className="editor-statusbar">
        <span>Mermaid 11.16</span>
        <span>{active.code.split('\n').length} 行</span>
        <span>{active.code.length.toLocaleString()} 字符</span>
      </footer>
    </section>
  )
})
