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
          markmap: `# 项目规划

## 前端开发
- React
- TypeScript
- Tailwind CSS

## 后端开发
- Node.js
- Express
- MongoDB

## 部署
- Docker
- AWS
- CI/CD`
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
