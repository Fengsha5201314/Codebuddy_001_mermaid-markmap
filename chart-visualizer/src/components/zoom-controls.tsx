import { Button } from '@/components/ui/button'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { useChartStore } from '@/store/chart-store'

export function ZoomControls() {
  const { zoomLevel, zoomIn, zoomOut, resetZoom } = useChartStore()

  return (
    <div className="absolute bottom-4 right-4 flex flex-col space-y-2 bg-white rounded-lg shadow-lg border p-2 z-10">
      <div className="text-xs text-center text-gray-600 px-2 font-medium">
        {zoomLevel}%
      </div>
      
      <Button
        variant="outline"
        size="sm"
        onClick={zoomIn}
        className="h-8 w-8 p-0 hover:bg-blue-50"
        title="放大 (+25%)"
        disabled={zoomLevel >= 500}
      >
        <ZoomIn className="w-4 h-4" />
      </Button>
      
      <Button
        variant="outline"
        size="sm"
        onClick={zoomOut}
        className="h-8 w-8 p-0 hover:bg-blue-50"
        title="缩小 (-25%)"
        disabled={zoomLevel <= 10}
      >
        <ZoomOut className="w-4 h-4" />
      </Button>
      
      <Button
        variant="outline"
        size="sm"
        onClick={resetZoom}
        className="h-8 w-8 p-0 hover:bg-blue-50"
        title="重置缩放 (100%)"
      >
        <RotateCcw className="w-4 h-4" />
      </Button>
    </div>
  )
}