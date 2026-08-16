import { Modal } from './Modal'

interface ShortcutDialogProps {
  open: boolean
  onClose: () => void
}

const shortcuts = [
  ['新建图表', 'N'],
  ['打开模板中心', 'Ctrl / ⌘ + K'],
  ['保存版本快照', 'Ctrl / ⌘ + S'],
  ['导出成果', 'Ctrl / ⌘ + Shift + E'],
  ['编辑器内搜索', 'Ctrl / ⌘ + F'],
  ['适应画布', 'F'],
  ['预览缩放', 'Ctrl / ⌘ + 滚轮'],
  ['关闭弹窗', 'Esc'],
]

export function ShortcutDialog({ open, onClose }: ShortcutDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title="快捷键" description="熟练后，可以像使用专业桌面工具一样快速。">
      <div className="shortcut-list">
        {shortcuts.map(([label, keys]) => <div key={label}><span>{label}</span><kbd>{keys}</kbd></div>)}
      </div>
    </Modal>
  )
}
