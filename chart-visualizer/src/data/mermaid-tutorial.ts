// Mermaid教程数据结构
export interface TutorialSection {
  id: string;
  title: string;
  description?: string;
  code: string;
  explanation: string;
  category: string;
}

export interface TutorialCategory {
  id: string;
  title: string;
  icon: string;
  description: string;
  sections: TutorialSection[];
}

export const mermaidTutorialData: TutorialCategory[] = [
  {
    id: 'flowchart',
    title: '流程图',
    icon: '🔄',
    description: '使用流程图展示程序逻辑、业务流程或决策过程',
    sections: [
      {
        id: 'basic-flowchart',
        title: '基础流程图',
        code: `graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;`,
        explanation: '基本的流程图语法，使用 graph TD 定义从上到下的流程图，箭头表示流向',
        category: 'flowchart'
      },
      {
        id: 'flowchart-shapes',
        title: '节点形状',
        code: `graph TD;
    A[方形节点]
    B(圆角矩形)
    C((圆形))
    D{菱形决策}
    E>右向旗帜]
    F[[子程序]]`,
        explanation: '不同的节点形状表示不同的含义：方形表示过程，菱形表示决策，圆形表示开始/结束',
        category: 'flowchart'
      },
      {
        id: 'flowchart-directions',
        title: '流程图方向',
        code: `graph LR;
    A-->B-->C-->D;`,
        explanation: 'graph LR 表示从左到右，TD表示从上到下，BT表示从下到上，RL表示从右到左',
        category: 'flowchart'
      },
      {
        id: 'complex-flowchart',
        title: '复杂流程图',
        code: `graph TD;
    Start([开始])
    Input[/输入数据/]
    Process[处理数据]
    Decision{是否正确?}
    Output[/输出结果/]
    End([结束])
    
    Start-->Input
    Input-->Process
    Process-->Decision
    Decision-->|是|Output
    Decision-->|否|Input
    Output-->End`,
        explanation: '完整的业务流程图示例，包含开始、输入、处理、决策、输出和结束节点',
        category: 'flowchart'
      }
    ]
  },
  {
    id: 'sequence',
    title: '时序图',
    icon: '⏱️',
    description: '展示对象之间的交互过程和消息传递时序',
    sections: [
      {
        id: 'basic-sequence',
        title: '基础时序图',
        code: `sequenceDiagram
    participant Alice
    participant Bob
    Alice->>John: Hello John, how are you?
    loop Healthcheck
        John->>John: Fight against hypochondria
    end
    Note right of John: Rational thoughts <br/>prevail!
    John-->>Alice: Great!
    John->>Bob: How about you?
    Bob-->>John: Jolly good!`,
        explanation: '基本时序图语法，participant定义参与者，->>表示同步消息，-->>表示异步消息',
        category: 'sequence'
      },
      {
        id: 'sequence-activations',
        title: '激活框',
        code: `sequenceDiagram
    participant A as 客户端
    participant B as 服务器
    A->>+B: 发送请求
    B->>+B: 处理请求
    B-->>-A: 返回响应
    B->>-B: 清理资源`,
        explanation: '使用+和-来表示激活框的开始和结束，显示对象的生命周期',
        category: 'sequence'
      },
      {
        id: 'sequence-notes',
        title: '注释和循环',
        code: `sequenceDiagram
    participant U as 用户
    participant S as 系统
    
    Note over U,S: 用户登录流程
    
    U->>S: 输入用户名密码
    alt 验证成功
        S-->>U: 登录成功
    else 验证失败
        S-->>U: 登录失败
        loop 重试机制
            U->>S: 重新输入
            S-->>U: 验证结果
        end
    end`,
        explanation: '使用Note添加注释，alt/else表示条件分支，loop表示循环',
        category: 'sequence'
      }
    ]
  },
  {
    id: 'gantt',
    title: '甘特图',
    icon: '📊',
    description: '项目管理中展示任务时间安排和进度的图表',
    sections: [
      {
        id: 'basic-gantt',
        title: '基础甘特图',
        code: `gantt
    title 项目开发计划
    dateFormat  YYYY-MM-DD
    section 需求分析
    需求收集           :done,    des1, 2024-01-01,2024-01-05
    需求分析           :active,  des2, 2024-01-06, 3d
    section 设计阶段
    UI设计             :         des3, after des2, 5d
    数据库设计         :         des4, after des2, 3d
    section 开发阶段
    前端开发           :         des5, after des3, 10d
    后端开发           :         des6, after des4, 8d`,
        explanation: '甘特图用于项目管理，显示任务的开始时间、持续时间和依赖关系',
        category: 'gantt'
      },
      {
        id: 'gantt-milestones',
        title: '里程碑甘特图',
        code: `gantt
    title 产品发布计划
    dateFormat  YYYY-MM-DD
    section 开发阶段
    功能开发    :dev1, 2024-01-01, 30d
    测试阶段    :test1, after dev1, 10d
    发布准备    :prep1, after test1, 5d
    section 里程碑
    Alpha版本   :milestone, alpha, after dev1, 0d
    Beta版本    :milestone, beta, after test1, 0d
    正式发布    :milestone, release, after prep1, 0d`,
        explanation: '使用milestone关键字标记重要的项目节点和发布时间',
        category: 'gantt'
      }
    ]
  },
  {
    id: 'class',
    title: '类图',
    icon: '🏗️',
    description: '面向对象设计中展示类的结构和关系',
    sections: [
      {
        id: 'basic-class',
        title: '基础类图',
        code: `classDiagram
    class Animal{
        +String name
        +int age
        +makeSound()
        +move()
    }
    class Dog{
        +String breed
        +bark()
        +wagTail()
    }
    class Cat{
        +String color
        +meow()
        +purr()
    }
    Animal <|-- Dog
    Animal <|-- Cat`,
        explanation: '类图显示类的属性和方法，+表示public，-表示private，<|--表示继承关系',
        category: 'class'
      },
      {
        id: 'class-relationships',
        title: '类关系图',
        code: `classDiagram
    class Order{
        +int orderId
        +Date orderDate
        +calculateTotal()
    }
    class Customer{
        +String name
        +String email
        +placeOrder()
    }
    class Product{
        +String name
        +double price
        +int stock
    }
    class OrderItem{
        +int quantity
        +double price
    }
    
    Customer ||--o{ Order : places
    Order ||--o{ OrderItem : contains
    Product ||--o{ OrderItem : includes`,
        explanation: '展示类之间的关联关系：||--o{表示一对多关系，||--||表示一对一关系',
        category: 'class'
      }
    ]
  },
  {
    id: 'git',
    title: 'Git图表',
    icon: '🌿',
    description: '可视化Git分支和提交历史',
    sections: [
      {
        id: 'basic-git',
        title: '基础Git图',
        code: `gitgraph
    commit
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit`,
        explanation: 'Git图表显示分支创建、提交和合并的历史，帮助理解版本控制流程',
        category: 'git'
      },
      {
        id: 'git-workflow',
        title: 'Git工作流',
        code: `gitgraph
    commit id: "初始提交"
    commit id: "添加基础功能"
    branch feature/login
    checkout feature/login
    commit id: "实现登录页面"
    commit id: "添加验证逻辑"
    checkout main
    merge feature/login
    commit id: "发布v1.0"
    branch hotfix/bug-fix
    checkout hotfix/bug-fix
    commit id: "修复登录bug"
    checkout main
    merge hotfix/bug-fix
    commit id: "发布v1.0.1"`,
        explanation: '完整的Git工作流示例，包含功能分支、热修复分支的创建和合并',
        category: 'git'
      }
    ]
  },
  {
    id: 'er',
    title: '实体关系图',
    icon: '🗄️',
    description: '数据库设计中展示实体和关系',
    sections: [
      {
        id: 'basic-er',
        title: '基础ER图',
        code: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses
    
    CUSTOMER {
        string name
        string custNumber
        string sector
    }
    ORDER {
        int orderNumber
        string deliveryAddress
    }
    LINE-ITEM {
        string productCode
        int quantity
        float pricePerUnit
    }`,
        explanation: 'ER图显示数据库实体和关系，||--o{表示一对多，}|..|{表示多对多关系',
        category: 'er'
      }
    ]
  },
  {
    id: 'journey',
    title: '用户旅程图',
    icon: '🚶',
    description: '展示用户与产品交互的完整流程',
    sections: [
      {
        id: 'basic-journey',
        title: '基础用户旅程',
        code: `journey
    title 用户购物旅程
    section 发现产品
      浏览网站: 5: 用户
      搜索产品: 3: 用户
      查看详情: 4: 用户
    section 购买决策
      比较价格: 2: 用户
      阅读评价: 4: 用户
      添加购物车: 5: 用户
    section 完成购买
      填写信息: 3: 用户
      选择支付: 4: 用户
      确认订单: 5: 用户`,
        explanation: '用户旅程图展示用户完成某个目标的完整过程，数字表示满意度评分',
        category: 'journey'
      }
    ]
  },
  {
    id: 'quadrant',
    title: '象限图',
    icon: '📈',
    description: '四象限分析图，用于优先级分析',
    sections: [
      {
        id: 'basic-quadrant',
        title: '基础象限图',
        code: `quadrantChart
    title 任务优先级矩阵
    x-axis 低紧急度 --> 高紧急度
    y-axis 低重要度 --> 高重要度
    quadrant-1 立即执行
    quadrant-2 计划执行
    quadrant-3 委托执行
    quadrant-4 删除任务
    
    项目A: [0.8, 0.9]
    项目B: [0.3, 0.7]
    项目C: [0.7, 0.2]
    项目D: [0.2, 0.3]`,
        explanation: '象限图用于分析和分类，常用于优先级管理、风险评估等场景',
        category: 'quadrant'
      }
    ]
  },
  {
    id: 'xy',
    title: 'XY图',
    icon: '📊',
    description: '散点图和折线图，展示数据分布和趋势',
    sections: [
      {
        id: 'basic-xy',
        title: '基础XY图',
        code: `xychart-beta
    title "销售趋势图"
    x-axis [一月, 二月, 三月, 四月, 五月, 六月]
    y-axis "销售额(万元)" 0 --> 100
    bar [20, 35, 45, 60, 55, 70]
    line [15, 30, 40, 55, 50, 65]`,
        explanation: 'XY图可以显示柱状图和折线图，用于展示数据趋势和对比分析',
        category: 'xy'
      }
    ]
  }
];

// 获取所有教程分类
export const getTutorialCategories = (): TutorialCategory[] => {
  return mermaidTutorialData;
};

// 根据分类ID获取教程内容
export const getTutorialByCategory = (categoryId: string): TutorialCategory | undefined => {
  return mermaidTutorialData.find(category => category.id === categoryId);
};

// 根据章节ID获取具体教程
export const getTutorialSection = (categoryId: string, sectionId: string): TutorialSection | undefined => {
  const category = getTutorialByCategory(categoryId);
  return category?.sections.find(section => section.id === sectionId);
};

// 搜索教程内容
export const searchTutorials = (keyword: string): TutorialSection[] => {
  const results: TutorialSection[] = [];
  
  mermaidTutorialData.forEach(category => {
    category.sections.forEach(section => {
      if (
        section.title.toLowerCase().includes(keyword.toLowerCase()) ||
        section.explanation.toLowerCase().includes(keyword.toLowerCase()) ||
        section.code.toLowerCase().includes(keyword.toLowerCase())
      ) {
        results.push(section);
      }
    });
  });
  
  return results;
};