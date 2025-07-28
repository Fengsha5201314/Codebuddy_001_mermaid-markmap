import { Button } from '@/components/ui/button'
import { PanelLeftOpen, PanelTopOpen } from 'lucide-react'
import { useChartStore } from '@/store/chart-store'

export function LayoutToggle() {
  const { layout, setLayout } = useChartStore()

  return (
    <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
      <Button
        variant={layout === 'horizontal' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setLayout('horizontal')}
        className="h-8 px-3"
        title="左右布局"
      >
        <PanelLeftOpen className="w-4 h-4 mr-1" />
        左右
      </Button>
      <Button
        variant={layout === 'vertical' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setLayout('vertical')}
        className="h-8 px-3"
        title="上下布局"
      >
        <PanelTopOpen className="w-4 h-4 mr-1" />
        上下
      </Button>
    </div>
  )
}