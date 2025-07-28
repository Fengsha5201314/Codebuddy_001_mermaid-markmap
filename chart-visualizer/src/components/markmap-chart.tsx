import { useEffect, useRef, useState } from 'react'
import { Markmap } from 'markmap-view'
import { Transformer } from 'markmap-lib'
import { ChartSettings } from '@/store/chart-store'

interface MarkmapChartProps {
  code: string
  settings?: ChartSettings
}

export function MarkmapChart({ code, settings }: MarkmapChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const markmapRef = useRef<Markmap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!code.trim() || !svgRef.current) return

    const renderMarkmap = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const transformer = new Transformer()
        
        // 转换Markdown为markmap数据
        const { root, features } = transformer.transform(code)
        
        // 创建或更新markmap实例
        if (!markmapRef.current) {
        markmapRef.current = Markmap.create(svgRef.current as SVGSVGElement, {
            // 基础配置
            duration: 500,
            maxWidth: 300,
            spacingVertical: 8,
            spacingHorizontal: 80,
            autoFit: true,
            pan: true,
            zoom: true,
            
            // 样式配置
            color: (node: any) => {
              const colors = [
                settings?.primaryColor || '#3B82F6',
                '#10B981',
                '#F59E0B', 
                '#EF4444',
                '#8B5CF6',
                '#06B6D4',
                '#84CC16',
                '#F97316'
              ]
              return colors[node.depth % colors.length]
            },
            
            // 字体配置
            style: (id: string) => `
              .${id} {
                font-family: ${settings?.fontFamily || 'Inter, system-ui, sans-serif'};
                font-size: ${settings?.fontSize || 14}px;
              }
              .${id} .markmap-node > circle {
                cursor: pointer;
              }
              .${id} .markmap-node-text {
                cursor: pointer;
                fill: #374151;
                font-weight: 500;
              }
              .${id} .markmap-link {
                stroke-width: 2px;
              }
            `
          })
        }

        // 渲染数据
        markmapRef.current.setData(root)
        markmapRef.current.fit()

        // 加载额外的资源（如果需要）
        if (features.styles || features.scripts) {
          // 这里可以加载额外的CSS和JS资源
          console.log('Markmap features:', features)
        }

      } catch (err) {
        console.error('Markmap渲染错误:', err)
        setError(err instanceof Error ? err.message : '思维导图渲染失败')
      } finally {
        setIsLoading(false)
      }
    }

    const timeoutId = setTimeout(renderMarkmap, 300) // 防抖
    return () => clearTimeout(timeoutId)
  }, [code, settings])

  // 清理资源
  useEffect(() => {
    return () => {
      if (markmapRef.current) {
        markmapRef.current.destroy?.()
        markmapRef.current = null
      }
    }
  }, [])

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="text-center p-6">
          <div className="text-red-500 text-lg mb-2">⚠️ 渲染错误</div>
          <div className="text-sm text-gray-600 max-w-md">
            {error}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            请检查Markdown格式是否正确
          </div>
        </div>
      </div>
    )
  }

  if (!code.trim()) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-4">🧠</div>
          <div className="text-lg mb-2">输入Markdown格式的思维导图内容</div>
          <div className="text-sm text-gray-400">
            使用 # ## ### 等标题层级来构建思维导图结构
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full bg-white">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="text-sm text-gray-600">渲染思维导图中...</span>
          </div>
        </div>
      )}
      
      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ 
          minHeight: '100%',
          cursor: 'grab'
        }}
      />
      
      <div className="absolute bottom-4 right-4 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs">
        交互式思维导图 - 可拖拽缩放
      </div>
    </div>
  )
}
