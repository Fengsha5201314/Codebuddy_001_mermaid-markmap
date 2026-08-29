import { CheckCircle2, CircleAlert, Eye } from 'lucide-react'
import type { DiagramQualityReceipt } from '@/lib/reliable-diagram-delivery'

export function QualityReceiptSummary({ receipt }: { receipt: DiagramQualityReceipt | null }) {
  if (!receipt) return null
  const passed = receipt.checks.filter((item) => item.status === 'passed').length
  const profile = receipt.quality === 'professional' ? '专业' : '标准'
  return (
    <div className={`quality-receipt-summary ${receipt.ok ? 'passed' : 'failed'}`}>
      <header>
        {receipt.ok ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
        <strong>{receipt.ok ? `${profile}自动检查 ${passed}/${receipt.checks.length} 通过` : `${profile}自动检查未通过`}</strong>
        <span><Eye size={12} />{receipt.ok ? '自动验收为暂定通过，人工视觉审查待确认' : '自动检查未通过，人工审查未开始'}</span>
      </header>
      <ul>
        {receipt.checks.map((item) => (
          <li key={item.id} data-status={item.status}>
            {item.status === 'passed' ? '✓' : item.status === 'warning' ? '!' : '×'} {item.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
