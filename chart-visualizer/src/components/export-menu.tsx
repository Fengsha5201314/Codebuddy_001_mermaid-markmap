import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, FileImage, FileText } from 'lucide-react'
import html2canvas from 'html2canvas'
import { saveAs } from 'file-saver'
import { useChartStore } from '@/store/chart-store'

export function ExportMenu() {
  const [isExporting, setIsExporting] = useState(false)
  const { currentType } = useChartStore()

  const exportAsSVG = async () => {
    setIsExporting(true)
    try {
      const chartContainer = document.querySelector('[data-chart-container]')
      if (!chartContainer) {
        throw new Error('找不到图表容器')
      }

      const svgElement = chartContainer.querySelector('svg')
      if (!svgElement) {
        throw new Error('找不到SVG元素')
      }

      const svgData = new XMLSerializer().serializeToString(svgElement)
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
      saveAs(blob, `chart-${currentType}-${Date.now()}.svg`)
    } catch (error) {
      console.error('SVG导出失败:', error)
      alert('SVG导出失败，请重试')
    } finally {
      setIsExporting(false)
    }
  }

  const exportAsImage = async (format: 'png' | 'jpeg') => {
    setIsExporting(true)
    try {
      const chartContainer = document.querySelector('[data-chart-container]')
      if (!chartContainer) {
        throw new Error('找不到图表容器')
      }

      const canvas = await html2canvas(chartContainer as HTMLElement, {
        backgroundColor: '#ffffff',
        scale: 2, // 提高清晰度
        useCORS: true,
        allowTaint: true
      })

      canvas.toBlob((blob) => {
        if (blob) {
          saveAs(blob, `chart-${currentType}-${Date.now()}.${format}`)
        }
      }, `image/${format}`, format === 'jpeg' ? 0.9 : undefined)
    } catch (error) {
      console.error(`${format.toUpperCase()}导出失败:`, error)
      alert(`${format.toUpperCase()}导出失败，请重试`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting}>
          <Download className="w-4 h-4 mr-2" />
          {isExporting ? '导出中...' : '导出'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportAsSVG}>
          <FileText className="w-4 h-4 mr-2" />
          导出为 SVG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportAsImage('png')}>
          <FileImage className="w-4 h-4 mr-2" />
          导出为 PNG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportAsImage('jpeg')}>
          <FileImage className="w-4 h-4 mr-2" />
          导出为 JPEG
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}