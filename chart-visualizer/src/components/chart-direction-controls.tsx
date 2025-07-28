import { Button } from '@/components/ui/button'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { useChartStore } from '@/store/chart-store'

export function ChartDirectionControls() {
  const { currentCode, setCode, currentType } = useChartStore()

  // 只在 mermaid 类型时显示
  if (currentType !== 'mermaid') return null

  const changeDirection = (direction: 'TD' | 'LR') => {
    // 检测当前代码中的方向
    const lines = currentCode.split('\n')
    const graphLineIndex = lines.findIndex(line => line.trim().startsWith('graph'))
    
    if (graphLineIndex !== -1) {
      // 替换现有的方向
      const graphLine = lines[graphLineIndex]
      const newGraphLine = graphLine.replace(/graph\s+(TD|LR|TB|RL|BT)\b/, `graph ${direction}`)
      lines[graphLineIndex] = newGraphLine
      setCode(lines.join('\n'))
    } else {
      // 如果没有找到 graph 行，在开头添加
      const newCode = `graph ${direction}\n${currentCode}`
      setCode(newCode)
    }
  }

  // 检测当前方向
  const getCurrentDirection = () => {
    const graphMatch = currentCode.match(/graph\s+(TD|LR|TB|RL|BT)\b/)
    return graphMatch ? graphMatch[1] : 'TD'
  }

  const currentDirection = getCurrentDirection()

  return (
    <div className="absolute top-4 right-4 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
      <div className="flex items-center space-x-1">
        <span className="text-xs text-gray-600 mr-2">流程方向:</span>
        <Button
          variant={currentDirection === 'TD' ? 'default' : 'outline'}
          size="sm"
          onClick={() => changeDirection('TD')}
          className="h-8 px-2"
          title="上下布局"
        >
          <ArrowDown className="h-3 w-3 mr-1" />
          <span className="text-xs">上下</span>
        </Button>
        <Button
          variant={currentDirection === 'LR' ? 'default' : 'outline'}
          size="sm"
          onClick={() => changeDirection('LR')}
          className="h-8 px-2"
          title="左右布局"
        >
          <ArrowRight className="h-3 w-3 mr-1" />
          <span className="text-xs">左右</span>
        </Button>
      </div>
    </div>
  )
}