export type AiPromptTemplateId = string

export type AiPromptTemplateCategory = '整理' | '流程' | '分析' | '创作'

export interface AiPromptTemplate {
  id: AiPromptTemplateId
  label: string
  hint: string
  prompt: string
  category: AiPromptTemplateCategory
}

export const AI_PROMPT_TEMPLATES: readonly AiPromptTemplate[] = [
  {
    id: 'optimize',
    label: '优化结构',
    hint: '精简路径，改善阅读顺序',
    category: '分析',
    prompt: '请先分析当前图的业务目标、主路径、分支和职责边界。在不改变现有业务含义的前提下，消除重复节点与不必要的交叉回路，优化层级、连线和阅读顺序；只修改确有必要的部分，并列出关键调整。',
  },
  {
    id: 'complete',
    label: '补全流程',
    hint: '补齐异常、交接与闭环',
    category: '流程',
    prompt: '请检查当前图是否缺少开始与结束、异常回退、审批结果、责任主体或必要交接。结合现有上下文补全缺失环节；不要虚构无法推断的业务规则，对不确定内容使用“待确认”节点标注。',
  },
  {
    id: 'diagnose',
    label: '排查问题',
    hint: '检查语法、断链和死循环',
    category: '分析',
    prompt: '请检查当前图的语法、断链、死循环、孤立节点、条件不闭合和命名不一致。优先修复会影响渲染或理解的问题，并尽量保持现有节点 ID、布局与样式。',
  },
  {
    id: 'transform',
    label: '转换图种',
    hint: '选择更合适的表达方式',
    category: '创作',
    prompt: '请根据当前内容选择更适合表达的图形结构（普通流程图、泳道图、时序图或架构图），先说明选择理由，再在保留业务信息的前提下完成转换。',
  },
  {
    id: 'review',
    label: '解释与评审',
    hint: '梳理路径、角色与风险',
    category: '分析',
    prompt: '请从目标、主路径、关键分支、参与角色、风险点和可优化项六个方面解释并评审当前图；本次只给出分析建议，不改动图表。',
  },
  {
    id: 'create',
    label: '从描述创建',
    hint: '把业务描述变成完整图表',
    category: '创作',
    prompt: '请根据我补充的业务描述创建一张结构清晰、可直接使用的图。先识别参与角色、开始与结束、主路径、异常路径和关键决策；信息不足时使用“待确认”标注，不要臆造业务规则。\n\n业务描述：',
  },
  {
    id: 'meeting-to-process',
    label: '纪要转流程',
    hint: '从会议纪要提取行动闭环',
    category: '整理',
    prompt: '请把我提供的会议纪要或沟通记录整理为可执行流程。识别目标、参与角色、输入材料、关键决定、行动项、负责人、时间顺序和验收结果；将讨论内容与已确认事项区分，不确定信息标为“待确认”，避免把发言顺序直接当作业务顺序。',
  },
  {
    id: 'sop',
    label: 'SOP 标准化',
    hint: '整理岗位步骤与检查点',
    category: '流程',
    prompt: '请将当前材料整理为可执行的标准作业流程（SOP）。明确每一步的责任角色、前置条件、操作动作、输出结果、检查标准、异常处理与升级路径；保持步骤可验证、命名一致，并指出仍缺少的制度或业务信息。',
  },
  {
    id: 'approval',
    label: '审批流程',
    hint: '补全权限、条件和退回路径',
    category: '流程',
    prompt: '请把当前内容整理为专业审批流程。识别申请人、审核人、批准人及知会角色，补充金额或风险等分级条件、资料不全退回、拒绝、超时、撤回和最终归档路径；无法从上下文确认的审批阈值必须标为“待确认”。',
  },
  {
    id: 'mindmap-summary',
    label: '归纳思维导图',
    hint: '把长内容整理成主题层级',
    category: '整理',
    prompt: '请把当前材料归纳为 Mermaid 思维导图。先确定一个清晰中心主题，再按互不重叠的一级主题组织背景、目标、关键事实、行动项、风险与待确认事项；合并重复观点，控制层级深度，节点使用短语而不是长句。',
  },
] as const

export function appendAiPrompt(current: string, addition: string, maximumLength = 4000): string {
  const existing = current.trimEnd()
  const next = existing ? `${existing}\n\n${addition.trimStart()}` : addition
  return next.slice(0, maximumLength)
}
