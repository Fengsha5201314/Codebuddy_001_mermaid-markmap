import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle 
} from '@/components/ui/sheet'
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { History, Search, Trash2, FileText, GitBranch } from 'lucide-react'
import { useChartStore, type HistoryItem } from '@/store/chart-store'

export function HistoryPanel() {
  const { 
    history, 
    isHistoryOpen, 
    toggleHistory, 
    loadFromHistory, 
    deleteFromHistory 
  } = useChartStore()
  
  const [searchTerm, setSearchTerm] = useState('')
  const [deleteItem, setDeleteItem] = useState<HistoryItem | null>(null)

  const filteredHistory = history.filter(item =>
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.code.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatDate = (date: Date) => {
    const d = new Date(date)
    return d.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTypeIcon = (type: string) => {
    return type === 'mermaid' ? <GitBranch className="w-4 h-4" /> : <FileText className="w-4 h-4" />
  }

  const getTypeLabel = (type: string) => {
    return type === 'mermaid' ? '流程图' : '思维导图'
  }

  return (
    <>
      <Sheet open={isHistoryOpen} onOpenChange={toggleHistory}>
        <SheetContent className="w-96">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              历史记录
            </SheetTitle>
          </SheetHeader>
          
          <div className="mt-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="搜索历史记录..."
                value={searchTerm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-3">
                {filteredHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>{searchTerm ? '未找到匹配的记录' : '暂无历史记录'}</p>
                  </div>
                ) : (
                  filteredHistory.map((item) => (
                    <div
                      key={item.id}
                      className="border rounded-lg p-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {getTypeIcon(item.type)}
                          <span className="text-sm font-medium truncate">
                            {item.title}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteItem(item)}
                          className="text-red-500 hover:text-red-700 p-1 h-auto"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      
                      <div className="text-xs text-gray-500 mb-2">
                        {getTypeLabel(item.type)} • {formatDate(item.createdAt)}
                      </div>
                      
                      <div className="text-xs text-gray-600 bg-gray-100 rounded p-2 mb-3 font-mono max-h-20 overflow-hidden">
                        {item.code.slice(0, 100)}
                        {item.code.length > 100 && '...'}
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadFromHistory(item)}
                        className="w-full"
                      >
                        加载此记录
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除历史记录 "{deleteItem?.title}" 吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteItem) {
                  deleteFromHistory(deleteItem.id)
                  setDeleteItem(null)
                }
              }}
              className="bg-red-500 hover:bg-red-600"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}