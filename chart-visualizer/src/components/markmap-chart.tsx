import { useState } from 'react'
import { ChartSettings } from '@/store/chart-store'

interface MarkmapChartProps {
  code: string
  settings?: ChartSettings
}

export function MarkmapChart({ code, settings }: MarkmapChartProps) {
  const [isLoading] = useState(false)

  // 简单的Markdown渲染预览
  const renderMarkdown = (markdown: string) => {
    const lines = markdown.split('\n').filter(line => line.trim())
    
    return (
      <div className="p-6 space-y-4">
        {lines.map((line, index) => {
          const level = (line.match(/^#+/) || [''])[0].length
          const text = line.replace(/^#+\s*/, '')
          
          if (level === 0) return null
          
          const marginLeft = (level - 1) * 20
          const fontSize = Math.max(24 - level * 2, 14)
          const color = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'][level - 1] || '#666'
          
          return (
            <div
              key={index}
              style={{ 
                marginLeft: `${marginLeft}px`,
                fontSize: `${fontSize}px`,
                color: color,
                fontWeight: level <= 2 ? 'bold' : 'normal'
              }}
              className="flex items-center space-x-2"
            >
              <div 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span>{text}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="relative h-full bg-white">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="text-sm text-gray-600">渲染中...</span>
          </div>
        </div>
      )}
      
      <div className="h-full overflow-auto">
        {code.trim() ? (
          renderMarkdown(code)
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-4">🧠</div>
              <div>输入Markdown格式的思维导图内容</div>
            </div>
          </div>
        )}
      </div>
      
      <div className="absolute bottom-4 right-4 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs">
        简化版思维导图预览
      </div>
    </div>
  )
}
