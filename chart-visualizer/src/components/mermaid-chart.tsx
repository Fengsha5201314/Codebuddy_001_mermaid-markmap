import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { ChartSettings } from '@/store/chart-store'

interface MermaidChartProps {
  code: string
  settings?: ChartSettings
}

export function MermaidChart({ code, settings }: MermaidChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const themeMap: Record<string, 'default' | 'dark' | 'forest' | 'neutral'> = {
      'default': 'default',
      'dark': 'dark',
      'forest': 'forest',
      'neutral': 'neutral'
    }

    const config = {
      startOnLoad: false,
      theme: settings ? themeMap[settings.theme] || 'default' : 'default',
      securityLevel: 'loose' as const,
      fontFamily: settings?.fontFamily || 'Inter, system-ui, sans-serif',
      fontSize: settings?.fontSize || 16,
      themeVariables: settings ? {
        primaryColor: settings.primaryColor,
        primaryTextColor: '#ffffff',
        primaryBorderColor: settings.primaryColor,
        lineColor: settings.primaryColor,
        sectionBkgColor: settings.primaryColor,
        altSectionBkgColor: settings.primaryColor,
        gridColor: settings.primaryColor,
        secondaryColor: settings.primaryColor,
        background: '#ffffff',
        mainBkg: '#ffffff',
        secondBkg: settings.primaryColor + '20',
      } : {}
    }

    mermaid.initialize(config)
  }, [settings])

  useEffect(() => {
    if (!code.trim() || !containerRef.current) return

    const renderChart = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const container = containerRef.current!
        container.innerHTML = ''

        const { svg } = await mermaid.render('mermaid-chart', code)
        container.innerHTML = svg

        // 充满容器的样式优化
        const svgElement = container.querySelector('svg')
        if (svgElement) {
          // 设置SVG充满整个容器
          svgElement.style.width = '100%'
          svgElement.style.height = '100%'
          svgElement.style.maxWidth = 'none'
          svgElement.style.maxHeight = 'none'
          svgElement.style.display = 'block'
          
          // 保持宽高比，但允许充满容器
          svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet')
        }
      } catch (err) {
        console.error('Mermaid渲染错误:', err)
        setError(err instanceof Error ? err.message : '图表渲染失败')
      } finally {
        setIsLoading(false)
      }
    }

    const timeoutId = setTimeout(renderChart, 300) // 防抖
    return () => clearTimeout(timeoutId)
  }, [code])

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="text-center p-6">
          <div className="text-red-500 text-lg mb-2">⚠️ 渲染错误</div>
          <div className="text-sm text-gray-600 max-w-md">
            {error}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="text-sm text-gray-600">渲染中...</span>
          </div>
        </div>
      )}
      <div 
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
        style={{ 
          minHeight: '100%',
          overflow: 'visible'
        }}
      />
    </div>
  )
}