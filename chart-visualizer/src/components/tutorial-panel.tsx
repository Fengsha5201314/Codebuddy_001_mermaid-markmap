import { useState, useMemo } from 'react';
import { Search, Book, Copy, ExternalLink, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { useToast } from '../hooks/use-toast';
import { useChartStore } from '../store/chart-store';
import { 
  mermaidTutorialData, 
  searchTutorials, 
  type TutorialSection 
} from '../data/mermaid-tutorial';

interface TutorialPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TutorialPanel({ isOpen, onClose }: TutorialPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['flowchart']));
  const [selectedSection, setSelectedSection] = useState<TutorialSection | null>(null);
  const { toast } = useToast();
  const { setCode, setType } = useChartStore();

  // 搜索结果
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return searchTutorials(searchTerm);
  }, [searchTerm]);

  // 切换分类展开状态
  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  // 选择教程章节
  const selectSection = (section: TutorialSection) => {
    setSelectedSection(section);
  };

  // 复制代码到剪贴板
  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({
        title: "复制成功",
        description: "代码已复制到剪贴板",
      });
    } catch (error) {
      toast({
        title: "复制失败",
        description: "请手动复制代码",
        variant: "destructive",
      });
    }
  };

  // 插入代码到编辑器
  const insertCode = (code: string) => {
    setCode(code);
    setType('mermaid');
    toast({
      title: "代码已插入",
      description: "代码已插入到编辑器中",
    });
  };

  // 打开原始文档
  const openOriginalDoc = () => {
    window.open('https://docs.min2k.com/zh/mermaid/intro/', '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex">
      {/* 侧边栏 */}
      <div className="w-80 bg-white border-r flex flex-col">
        {/* 头部 */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Book className="w-5 h-5 text-blue-600" />
              <h2 className="font-semibold text-gray-900">Mermaid 教程</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="搜索教程内容..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* 内容区域 */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            {searchTerm ? (
              // 搜索结果
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  搜索结果 ({searchResults.length})
                </h3>
                {searchResults.length === 0 ? (
                  <p className="text-sm text-gray-500">未找到相关内容</p>
                ) : (
                  searchResults.map((section) => (
                    <div
                      key={`${section.category}-${section.id}`}
                      className="p-3 rounded-lg border hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => selectSection(section)}
                    >
                      <h4 className="font-medium text-sm">{section.title}</h4>
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {section.explanation}
                      </p>
                      <Badge variant="secondary" className="mt-2 text-xs">
                        {mermaidTutorialData.find(cat => cat.id === section.category)?.title}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            ) : (
              // 分类列表
              <div className="space-y-2">
                {mermaidTutorialData.map((category) => (
                  <div key={category.id} className="border rounded-lg">
                    <button
                      className="w-full p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      onClick={() => toggleCategory(category.id)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{category.icon}</span>
                        <div className="text-left">
                          <h3 className="font-medium text-sm">{category.title}</h3>
                          <p className="text-xs text-gray-600">{category.description}</p>
                        </div>
                      </div>
                      {expandedCategories.has(category.id) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    
                    {expandedCategories.has(category.id) && (
                      <div className="border-t bg-gray-50/50">
                        {category.sections.map((section) => (
                          <button
                            key={section.id}
                            className="w-full p-3 text-left hover:bg-white transition-colors border-b last:border-b-0"
                            onClick={() => selectSection(section)}
                          >
                            <h4 className="font-medium text-sm">{section.title}</h4>
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                              {section.explanation}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* 底部操作 */}
        <div className="p-4 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={openOriginalDoc}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            查看完整文档
          </Button>
        </div>
      </div>

      {/* 内容展示区域 */}
      <div className="flex-1 bg-white flex flex-col">
        {selectedSection ? (
          <>
            {/* 内容头部 */}
            <div className="p-6 border-b">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    {selectedSection.title}
                  </h1>
                  <p className="text-gray-600">
                    {selectedSection.explanation}
                  </p>
                  <Badge variant="secondary" className="mt-3">
                    {mermaidTutorialData.find(cat => cat.id === selectedSection.category)?.title}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyCode(selectedSection.code)}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    复制代码
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => insertCode(selectedSection.code)}
                  >
                    插入编辑器
                  </Button>
                </div>
              </div>
            </div>

            {/* 代码展示 */}
            <div className="flex-1 p-6">
              <div className="bg-gray-900 rounded-lg p-4 mb-6">
                <pre className="text-green-400 text-sm overflow-x-auto">
                  <code>{selectedSection.code}</code>
                </pre>
              </div>
              
              {/* 效果预览提示 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">💡 使用提示</h3>
                <p className="text-blue-800 text-sm">
                  点击"插入编辑器"按钮将代码插入到左侧编辑器中，即可看到图表效果。
                  你也可以基于这个示例进行修改和扩展。
                </p>
              </div>
            </div>
          </>
        ) : (
          // 欢迎页面
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <Book className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                欢迎使用 Mermaid 教程
              </h2>
              <p className="text-gray-600 mb-6">
                选择左侧的教程分类，学习如何使用 Mermaid 创建各种类型的图表。
                从流程图到时序图，从甘特图到类图，这里有你需要的所有语法示例。
              </p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium text-gray-900">🔄 流程图</div>
                  <div className="text-gray-600">业务流程可视化</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium text-gray-900">⏱️ 时序图</div>
                  <div className="text-gray-600">交互过程展示</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium text-gray-900">📊 甘特图</div>
                  <div className="text-gray-600">项目进度管理</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium text-gray-900">🏗️ 类图</div>
                  <div className="text-gray-600">系统架构设计</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}