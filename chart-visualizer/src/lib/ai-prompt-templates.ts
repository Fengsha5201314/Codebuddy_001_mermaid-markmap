export type AiPromptTemplateId =
  | 'optimize'
  | 'complete'
  | 'diagnose'
  | 'transform'
  | 'review'
  | 'create'

export interface AiPromptTemplate {
  id: AiPromptTemplateId
  label: string
  hint: string
  prompt: string
}

export const AI_PROMPT_TEMPLATES: readonly AiPromptTemplate[] = [
  {
    id: 'optimize',
    label: '优化结构',
    hint: '精简路径，改善阅读顺序',
    prompt: '请先分析当前图的业务目标、主路径、分支和职责边界。在不改变现有业务含义的前提下，消除重复节点与不必要的交叉回路，优化层级、连线和阅读顺序；只修改确有必要的部分，并列出关键调整。',
  },
  {
    id: 'complete',
    label: '补全流程',
    hint: '补齐异常、交接与闭环',
    prompt: '请检查当前图是否缺少开始与结束、异常回退、审批结果、责任主体或必要交接。结合现有上下文补全缺失环节；不要虚构无法推断的业务规则，对不确定内容使用“待确认”节点标注。',
  },
  {
    id: 'diagnose',
    label: '排查问题',
    hint: '检查语法、断链和死循环',
    prompt: '请检查当前图的语法、断链、死循环、孤立节点、条件不闭合和命名不一致。优先修复会影响渲染或理解的问题，并尽量保持现有节点 ID、布局与样式。',
  },
  {
    id: 'transform',
    label: '转换图种',
    hint: '选择更合适的表达方式',
    prompt: '请根据当前内容选择更适合表达的图形结构（普通流程图、泳道图、时序图或架构图），先说明选择理由，再在保留业务信息的前提下完成转换。',
  },
  {
    id: 'review',
    label: '解释与评审',
    hint: '梳理路径、角色与风险',
    prompt: '请从目标、主路径、关键分支、参与角色、风险点和可优化项六个方面解释并评审当前图；本次只给出分析建议，不改动图表。',
  },
  {
    id: 'create',
    label: '从描述创建',
    hint: '把业务描述变成完整图表',
    prompt: '请根据我补充的业务描述创建一张结构清晰、可直接使用的图。先识别参与角色、开始与结束、主路径、异常路径和关键决策；信息不足时使用“待确认”标注，不要臆造业务规则。\n\n业务描述：',
  },
] as const

export function appendAiPrompt(current: string, addition: string, maximumLength = 4000): string {
  const existing = current.trimEnd()
  const next = existing ? `${existing}\n\n${addition.trimStart()}` : addition
  return next.slice(0, maximumLength)
}
