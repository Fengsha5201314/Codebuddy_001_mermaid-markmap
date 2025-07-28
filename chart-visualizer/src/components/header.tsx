import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  BarChart3, 
  History, 
  Save, 
  Trash2, 
  FileText,
  GitBranch,
  Settings
} from 'lucide-react'
import { useChartStore } from '@/store/chart-store'
import { ExportMenu } from './export-menu'
import { LayoutToggle } from './layout-toggle'

export function Header() {
  const { 
    currentType, 
    setType, 
    saveToHistory, 
    clearCode, 
    toggleHistory,
    toggleSettings,
    history 
  } = useChartStore()

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* 左侧 Logo 和标题 */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-8 h-8 text-blue-500" />
          <h1 className="text-xl font-bold text-gray-900">图表生成器</h1>
        </div>
        
        {/* 图表类型切换 */}
        <div className="flex items-center space-x-2 ml-8">
          <Button
            variant={currentType === 'mermaid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setType('mermaid')}
            className="flex items-center space-x-2"
          >
            <GitBranch className="w-4 h-4" />
            <span>Mermaid流程图</span>
          </Button>
          <Button
            variant={currentType === 'markmap' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setType('markmap')}
            className="flex items-center space-x-2"
          >
            <FileText className="w-4 h-4" />
            <span>Markmap思维导图</span>
          </Button>
        </div>
      </div>

      {/* 右侧操作按钮 */}
      <div className="flex items-center space-x-3">
        <LayoutToggle />

        <Button
          variant="outline"
          size="sm"
          onClick={() => saveToHistory()}
          className="flex items-center space-x-2"
        >
          <Save className="w-4 h-4" />
          <span>保存</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={clearCode}
          className="flex items-center space-x-2 text-red-600 hover:text-red-700"
        >
          <Trash2 className="w-4 h-4" />
          <span>清空</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleSettings}
          className="flex items-center space-x-2"
        >
          <Settings className="w-4 h-4" />
          <span>设置</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleHistory}
          className="flex items-center space-x-2 relative"
        >
          <History className="w-4 h-4" />
          <span>历史记录</span>
          {history.length > 0 && (
            <Badge 
              variant="secondary" 
              className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700"
            >
              {history.length}
            </Badge>
          )}
        </Button>

        <ExportMenu />
      </div>
    </header>
  )
}