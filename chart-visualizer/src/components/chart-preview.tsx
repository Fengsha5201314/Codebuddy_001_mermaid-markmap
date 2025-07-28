import { useChartStore } from '@/store/chart-store'
import { MermaidChart } from './mermaid-chart'
import { MarkmapChart } from './markmap-chart'
import { ZoomControls } from './zoom-controls'
import { ChartDirectionControls } from './chart-direction-controls'
import { useEffect, useRef } from 'react'

export function ChartPreview() {
  const { currentCode, currentType, zoomLevel, settings, setZoomLevel } = useChartStore()
  const containerRef = useRef<HTMLDivElement>(null)

  // 处理鼠标滚轮缩放
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const delta = e.deltaY > 0 ? -10 : 10
        const newZoom = Math.max(10, Math.min(500, zoomLevel + delta))
        setZoomLevel(newZoom)
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [zoomLevel, setZoomLevel])

  const renderChart = () => {
    switch (currentType) {
      case 'mermaid':
        return <MermaidChart code={currentCode} settings={settings} />
      case 'markmap':
        return <MarkmapChart code={currentCode} settings={settings} />
      default:
        return (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-4">📊</div>
              <div>选择图表类型开始创建</div>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="h-full bg-white relative">
      <div className="h-12 bg-gray-50 border-b border-gray-200 flex items-center px-4">
        <h3 className="text-sm font-medium text-gray-700">
          图表预览 ({currentType === 'mermaid' ? 'Mermaid流程图' : 'Markmap思维导图'})
        </h3>
        <div className="ml-auto text-xs text-gray-500">
          {zoomLevel}% (Ctrl+滚轮缩放)
        </div>
      </div>
      <div 
        ref={containerRef}
        className="h-[calc(100%-3rem)] relative overflow-auto bg-gray-50"
        style={{
          backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}
      >
        <div 
          className="w-full h-full origin-center"
          style={{
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: 'center center'
          }}
          data-chart-container
        >
          {renderChart()}
        </div>
        <ZoomControls />
        <ChartDirectionControls />
      </div>
    </div>
  )
}
