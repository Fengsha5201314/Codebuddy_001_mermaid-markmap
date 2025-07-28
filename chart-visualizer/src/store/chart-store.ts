import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ChartType = 'mermaid' | 'markmap'
export type LayoutType = 'horizontal' | 'vertical'
export type ThemeType = 'default' | 'dark' | 'forest' | 'neutral'

export interface ChartSettings {
  theme: ThemeType
  fontSize: number
  fontFamily: string
  primaryColor: string
}

export interface HistoryItem {
  id: string
  title: string
  code: string
  type: ChartType
  createdAt: Date
  updatedAt: Date
}

interface ChartState {
  currentCode: string
  currentType: ChartType
  history: HistoryItem[]
  isHistoryOpen: boolean
  isSettingsOpen: boolean
  layout: LayoutType
  zoomLevel: number
  settings: ChartSettings
  
  // Actions
  setCode: (code: string) => void
  setType: (type: ChartType) => void
  saveToHistory: (title?: string) => void
  loadFromHistory: (item: HistoryItem) => void
  deleteFromHistory: (id: string) => void
  toggleHistory: () => void
  toggleSettings: () => void
  clearCode: () => void
  setLayout: (layout: LayoutType) => void
  setZoomLevel: (level: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  updateSettings: (settings: Partial<ChartSettings>) => void
}

export const useChartStore = create<ChartState>()(
  persist(
    (set, get) => ({
      currentCode: `graph TD
    A[开始] --> B{是否登录?}
    B -->|是| C[显示主页]
    B -->|否| D[显示登录页]
    C --> E[结束]
    D --> E`,
      currentType: 'mermaid',
      history: [],
      isHistoryOpen: false,
      isSettingsOpen: false,
      layout: 'horizontal',
  zoomLevel: 100,
      settings: {
        theme: 'default',
        fontSize: 14,
        fontFamily: 'Inter',
        primaryColor: '#3B82F6'
      },

      setCode: (code) => set({ currentCode: code }),
      
      setType: (type) => {
        const defaultCodes = {
          mermaid: `graph TD
    A[开始] --> B{是否登录?}
    B -->|是| C[显示主页]
    B -->|否| D[显示登录页]
    C --> E[结束]
    D --> E`,
          markmap: `# 软件开发项目规划

## 前端开发
### 技术栈
- React 18
- TypeScript
- Tailwind CSS
- Zustand 状态管理

### 功能模块
- 用户认证
- 数据可视化
- 响应式设计
- 国际化支持

## 后端开发
### 技术选型
- Node.js + Express
- MongoDB 数据库
- Redis 缓存
- JWT 认证

### API 设计
- RESTful API
- GraphQL 接口
- 实时通信 WebSocket
- 文件上传处理

## 开发流程
### 版本控制
- Git 工作流
- 代码审查
- 分支管理策略

### 测试策略
- 单元测试 Jest
- 集成测试
- E2E 测试 Playwright
- 性能测试

## 部署运维
### 容器化
- Docker 镜像
- Docker Compose
- Kubernetes 编排

### 云服务
- AWS/阿里云
- CI/CD 流水线
- 监控告警
- 日志收集

## 项目管理
### 敏捷开发
- Scrum 框架
- 迭代规划
- 每日站会
- 回顾总结

### 协作工具
- Jira 任务管理
- Confluence 文档
- Slack 沟通
- Figma 设计`
        }
        set({ 
          currentType: type,
          currentCode: defaultCodes[type]
        })
      },

      saveToHistory: (title) => {
        const { currentCode, currentType } = get()
        if (!currentCode.trim()) return

        const newItem: HistoryItem = {
          id: Date.now().toString(),
          title: title || `${currentType === 'mermaid' ? '流程图' : '思维导图'} - ${new Date().toLocaleString()}`,
          code: currentCode,
          type: currentType,
          createdAt: new Date(),
          updatedAt: new Date()
        }

        set(state => ({
          history: [newItem, ...state.history.slice(0, 49)] // 保留最近50条记录
        }))
      },

      loadFromHistory: (item) => {
        set({
          currentCode: item.code,
          currentType: item.type,
          isHistoryOpen: false
        })
      },

      deleteFromHistory: (id) => {
        set(state => ({
          history: state.history.filter(item => item.id !== id)
        }))
      },

      toggleHistory: () => set(state => ({ isHistoryOpen: !state.isHistoryOpen })),
      
      toggleSettings: () => set(state => ({ isSettingsOpen: !state.isSettingsOpen })),

      clearCode: () => set({ currentCode: '' }),

      setLayout: (layout) => set({ layout }),

      setZoomLevel: (level) => set({ zoomLevel: Math.max(10, Math.min(500, level)) }),

      zoomIn: () => {
        const { zoomLevel } = get()
        set({ zoomLevel: Math.min(500, zoomLevel + 25) })
      },

      zoomOut: () => {
        const { zoomLevel } = get()
        set({ zoomLevel: Math.max(10, zoomLevel - 25) })
      },

      resetZoom: () => set({ zoomLevel: 100 }),

      updateSettings: (newSettings) => {
        set(state => ({
          settings: { ...state.settings, ...newSettings }
        }))
      }
    }),
    {
      name: 'chart-store',
      partialize: (state) => ({ 
        history: state.history,
        currentType: state.currentType,
        layout: state.layout,
        settings: state.settings
      })
    }
  )
)
