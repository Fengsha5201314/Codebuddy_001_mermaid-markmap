import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { useChartStore } from '@/store/chart-store'

const fontOptions = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Microsoft YaHei', label: '微软雅黑' },
  { value: 'SimSun', label: '宋体' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Georgia', label: 'Georgia' },
]

const themeOptions = [
  { value: 'default', label: '默认' },
  { value: 'dark', label: '深色' },
  { value: 'forest', label: '森林' },
  { value: 'neutral', label: '中性' },
]

export function SettingsPanel() {
  const { isSettingsOpen, toggleSettings, settings, updateSettings } = useChartStore()

  const handleSettingChange = (key: keyof typeof settings, value: any) => {
    updateSettings({ [key]: value })
  }

  return (
    <Sheet open={isSettingsOpen} onOpenChange={toggleSettings}>
      <SheetContent side="right" className="w-80 sm:w-96">
        <SheetHeader>
          <SheetTitle>图表设置</SheetTitle>
        </SheetHeader>
        
        <div className="space-y-6 mt-6">
          {/* 主题风格 */}
          <div className="space-y-2">
            <Label htmlFor="theme">主题风格</Label>
            <Select
              value={settings.theme}
              onValueChange={(value) => handleSettingChange('theme', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择主题" />
              </SelectTrigger>
              <SelectContent>
                {themeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 主题色调 */}
          <div className="space-y-2">
            <Label htmlFor="primaryColor">主题色调</Label>
            <div className="flex items-center space-x-2">
              <Input
                type="color"
                value={settings.primaryColor}
                onChange={(e) => handleSettingChange('primaryColor', e.target.value)}
                className="w-12 h-8 p-1 border rounded"
              />
              <Input
                type="text"
                value={settings.primaryColor}
                onChange={(e) => handleSettingChange('primaryColor', e.target.value)}
                className="flex-1"
                placeholder="#3B82F6"
              />
            </div>
          </div>

          {/* 字体名称 */}
          <div className="space-y-2">
            <Label htmlFor="fontFamily">字体名称</Label>
            <Select
              value={settings.fontFamily}
              onValueChange={(value) => handleSettingChange('fontFamily', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择字体" />
              </SelectTrigger>
              <SelectContent>
                {fontOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span style={{ fontFamily: option.value }}>{option.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 字体大小 */}
          <div className="space-y-2">
            <Label htmlFor="fontSize">字体大小: {settings.fontSize}px</Label>
            <Slider
              value={[settings.fontSize]}
              onValueChange={(value) => handleSettingChange('fontSize', value[0])}
              min={12}
              max={24}
              step={1}
              className="w-full"
            />
          </div>

          {/* 重置按钮 */}
          <div className="pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                updateSettings({
                  theme: 'default',
                  fontSize: 14,
                  fontFamily: 'Inter',
                  primaryColor: '#3B82F6'
                })
              }}
              className="w-full"
            >
              重置为默认设置
            </Button>
          </div>

          {/* 使用说明 */}
          <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
            <p className="font-medium mb-1">使用提示：</p>
            <ul className="space-y-1">
              <li>• 设置会实时应用到图表</li>
              <li>• 支持Ctrl+滚轮缩放图表</li>
              <li>• 设置会自动保存</li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}