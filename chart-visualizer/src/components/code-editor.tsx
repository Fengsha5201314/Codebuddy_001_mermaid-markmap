import { Editor } from '@monaco-editor/react'
import { useChartStore } from '@/store/chart-store'

export function CodeEditor() {
  const { currentCode, currentType, setCode } = useChartStore()

  const getLanguage = () => {
    switch (currentType) {
      case 'mermaid':
        return 'mermaid'
      case 'markmap':
        return 'markdown'
      default:
        return 'text'
    }
  }

  return (
    <div className="h-full border-r border-gray-200">
      <div className="h-12 bg-gray-50 border-b border-gray-200 flex items-center px-4">
        <h3 className="text-sm font-medium text-gray-700">
          代码编辑器 ({currentType === 'mermaid' ? 'Mermaid' : 'Markmap'})
        </h3>
      </div>
      <div className="h-[calc(100%-3rem)]">
        <Editor
          height="100%"
          language={getLanguage()}
          value={currentCode}
          onChange={(value) => setCode(value || '')}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            tabSize: 2,
            insertSpaces: true,
            folding: true,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 3,
          }}
        />
      </div>
    </div>
  )
}