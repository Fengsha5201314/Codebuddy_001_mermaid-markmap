import { Header } from '@/components/header'
import { CodeEditor } from '@/components/code-editor'
import { ChartPreview } from '@/components/chart-preview'
import { HistoryPanel } from '@/components/history-panel'
import { SettingsPanel } from '@/components/settings-panel'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import { useChartStore } from '@/store/chart-store'

function App() {
  const { layout } = useChartStore()

  return (
    <ThemeProvider defaultTheme="light" storageKey="chart-visualizer-theme">
      <div className="h-screen flex flex-col bg-gray-50">
        <Header />
        
        <main className={`flex-1 overflow-hidden ${
          layout === 'vertical' ? 'flex flex-col' : 'flex'
        }`}>
          {/* 代码编辑器 */}
          <div className={`overflow-hidden ${
            layout === 'vertical' 
              ? 'h-1/2 min-h-[300px] max-h-[70%] resize-y' 
              : 'w-2/5 min-w-[400px] max-w-[60%] resize-x'
          }`}>
            <CodeEditor />
          </div>
          
          {/* 图表预览 */}
          <div className="flex-1 overflow-hidden" data-chart-container>
            <ChartPreview />
          </div>
        </main>

        {/* 侧边面板 */}
        <HistoryPanel />
        <SettingsPanel />
        
        {/* Toast 通知 */}
        <Toaster />
      </div>
    </ThemeProvider>
  )
}

export default App
