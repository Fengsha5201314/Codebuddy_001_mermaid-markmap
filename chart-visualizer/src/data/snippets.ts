export interface Snippet {
  id: string
  label: string
  hint: string
  code: string
  group: '节点' | '连线' | '结构' | '说明'
}

export const snippets: Snippet[] = [
  { id: 'task', label: '任务节点', hint: '普通处理步骤', code: '\n    taskId[任务名称]' , group: '节点' },
  { id: 'decision', label: '决策节点', hint: '条件判断与分支', code: '\n    decisionId{判断条件?}', group: '节点' },
  { id: 'terminal', label: '开始/结束', hint: '流程起点或终点', code: '\n    terminalId([开始或结束])', group: '节点' },
  { id: 'database', label: '数据存储', hint: '数据库或数据集', code: '\n    databaseId[(数据存储)]', group: '节点' },
  { id: 'arrow', label: '带标签箭头', hint: '表达条件或交接', code: '\n    source -->|条件| target', group: '连线' },
  { id: 'dotted', label: '虚线依赖', hint: '弱依赖或异步关系', code: '\n    source -.-> target', group: '连线' },
  { id: 'subgraph', label: '分组/子系统', hint: '划分部门或系统边界', code: '\n    subgraph groupId [分组名称]\n      nodeId[节点]\n    end', group: '结构' },
  { id: 'swimlane', label: '泳道', hint: '新增责任主体', code: '\n    subgraph laneId [责任主体]\n      taskId[处理步骤]\n    end', group: '结构' },
  { id: 'classdef', label: '强调样式', hint: '定义高亮节点样式', code: '\n    classDef emphasis fill:#fff5d6,stroke:#b7791f,color:#5f4308;\n    class nodeId emphasis;', group: '说明' },
  { id: 'accessibility', label: '无障碍说明', hint: '为图表添加标题与描述', code: '\n    accTitle: 图表标题\n    accDescr: 用一句话说明图表内容', group: '说明' },
]
