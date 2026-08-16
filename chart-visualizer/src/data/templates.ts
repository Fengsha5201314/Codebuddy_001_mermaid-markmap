import type { DiagramTemplate } from '@/types'

export const diagramTemplates: DiagramTemplate[] = [
  {
    id: 'approval-flow',
    title: '通用审批流程',
    description: '适合费用、合同、用印等多级审批',
    category: '业务流程',
    kind: 'flowchart',
    accent: '#2864dc',
    featured: true,
    code: `flowchart LR
    start([提交申请]) --> check{资料完整?}
    check -->|否| revise[退回补充]
    revise --> start
    check -->|是| manager{直属负责人审批}
    manager -->|拒绝| rejected([已拒绝])
    manager -->|通过| finance{财务复核}
    finance -->|需调整| revise
    finance -->|通过| approved([审批完成])

    classDef terminal fill:#172033,color:#fff,stroke:#172033;
    classDef decision fill:#fff5d6,stroke:#b7791f,color:#5f4308;
    class start,approved,rejected terminal;
    class check,manager,finance decision;`,
  },
  {
    id: 'order-swimlane',
    title: '订单履约泳道图',
    description: '展示客户、销售、仓库和物流的责任交接',
    category: '业务流程',
    kind: 'swimlane',
    accent: '#d97706',
    featured: true,
    beta: true,
    code: `swimlane-beta LR
    accTitle: 订单履约流程
    accDescr: 从客户下单到签收的跨部门协作流程

    subgraph customer [客户]
      submit([提交订单])
      pay[完成付款]
      receive([确认收货])
    end

    subgraph sales [销售]
      verify{核对订单}
      confirm[确认交期]
    end

    subgraph warehouse [仓库]
      reserve[锁定库存]
      pack[拣货与包装]
    end

    subgraph logistics [物流]
      pickup[揽收]
      deliver[配送]
    end

    submit --> verify
    verify -->|信息有误| submit
    verify -->|通过| pay --> reserve --> confirm --> pack
    pack -->|出库交接| pickup --> deliver --> receive`,
  },
  {
    id: 'incident-swimlane',
    title: '故障响应泳道图',
    description: '适合 IT 运维、客服升级和重大事故复盘',
    category: '业务流程',
    kind: 'swimlane',
    accent: '#dc2626',
    beta: true,
    code: `swimlane-beta LR
    subgraph monitor [监控系统]
      alert([触发告警])
      recover([恢复确认])
    end
    subgraph oncall [值班工程师]
      triage{快速分级}
      mitigate[临时止损]
      verify[验证恢复]
    end
    subgraph expert [领域专家]
      diagnose[根因定位]
      fix[实施修复]
    end
    subgraph owner [业务负责人]
      notify[影响通报]
      review[事故复盘]
    end
    alert --> triage
    triage -->|P1 / P2| notify
    triage --> mitigate --> diagnose --> fix --> verify --> recover --> review`,
  },
  {
    id: 'system-architecture',
    title: '互联网应用架构',
    description: '分组展示入口、应用服务与数据层',
    category: '系统架构',
    kind: 'architecture',
    accent: '#0b6e99',
    featured: true,
    beta: true,
    code: `architecture-beta
    group edge(cloud)["接入层"]
    group app(server)["应用服务"]
    group data(database)["数据层"]

    service internet(internet)["互联网"]
    service gateway(server)["API 网关"] in edge
    service web(server)["Web 服务"] in app
    service worker(server)["任务服务"] in app
    service cache(database)["缓存"] in data
    service db(database)["业务数据库"] in data
    service files(disk)["对象存储"] in data

    internet:R --> L:gateway
    gateway:R --> L:web
    web:B --> T:cache
    web:B --> T:db
    web:R --> L:worker
    worker:B --> T:files`,
  },
  {
    id: 'integration-architecture',
    title: '企业系统集成架构',
    description: '适合 SAP、CRM、WMS 与中台集成方案',
    category: '系统架构',
    kind: 'flowchart',
    accent: '#7c3aed',
    code: `flowchart LR
    subgraph channel[业务触点]
      mall[电商平台]
      portal[经销商门户]
      mobile[移动应用]
    end
    subgraph integration[集成与治理层]
      api[API 网关]
      bus[消息总线]
      master[主数据服务]
      monitor[接口监控]
    end
    subgraph core[核心业务系统]
      crm[CRM]
      sap[SAP ERP]
      wms[WMS]
      bi[数据平台]
    end
    mall & portal & mobile --> api
    api --> crm & sap
    sap <--> bus
    bus <--> wms
    master --> crm & sap & wms
    crm & sap & wms --> bi
    api & bus --> monitor`,
  },
  {
    id: 'c4-context',
    title: 'C4 系统上下文',
    description: '快速说明系统、用户和外部依赖关系',
    category: '系统架构',
    kind: 'c4',
    accent: '#2563eb',
    code: `C4Context
    title 电商订单平台 - 系统上下文
    Person(customer, "客户", "浏览商品、下单并查询物流")
    Person(operator, "运营人员", "配置商品与处理异常订单")
    System(order, "订单平台", "管理商品、订单、支付和履约")
    System_Ext(payment, "支付平台", "完成收款与退款")
    System_Ext(erp, "ERP", "库存、发货和财务记账")
    System_Ext(logistics, "物流平台", "承运与轨迹回传")
    Rel(customer, order, "使用", "HTTPS")
    Rel(operator, order, "管理")
    Rel(order, payment, "支付/退款", "API")
    Rel(order, erp, "同步订单", "消息")
    Rel(order, logistics, "创建运单", "API")`,
  },
  {
    id: 'api-sequence',
    title: 'API 调用时序',
    description: '展示鉴权、缓存、服务和数据库的调用链',
    category: '研发设计',
    kind: 'sequence',
    accent: '#0891b2',
    featured: true,
    code: `sequenceDiagram
    autonumber
    actor U as 用户
    participant W as Web 应用
    participant G as API 网关
    participant C as 缓存
    participant S as 业务服务
    participant D as 数据库

    U->>W: 提交查询
    W->>G: GET /api/orders
    G->>G: 校验令牌与权限
    G->>C: 查询缓存
    alt 缓存命中
      C-->>G: 返回订单数据
    else 缓存未命中
      G->>S: 查询订单
      S->>D: SELECT orders
      D-->>S: 结果集
      S-->>G: 订单数据
      G->>C: 写入缓存
    end
    G-->>W: 200 OK
    W-->>U: 展示结果`,
  },
  {
    id: 'data-model',
    title: '业务数据模型',
    description: '用于需求评审和数据库设计',
    category: '研发设计',
    kind: 'er',
    accent: '#059669',
    code: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : referenced_by
    ORDER ||--o| PAYMENT : paid_by
    ORDER ||--o{ SHIPMENT : fulfilled_by

    CUSTOMER {
      string id PK
      string name
      string email UK
    }
    ORDER {
      string id PK
      string customer_id FK
      string status
      decimal total_amount
      datetime created_at
    }
    PRODUCT {
      string id PK
      string sku UK
      string name
      decimal price
    }
    ORDER_ITEM {
      string order_id FK
      string product_id FK
      int quantity
      decimal unit_price
    }`,
  },
  {
    id: 'domain-class',
    title: '领域类图',
    description: '梳理核心对象、职责和关系',
    category: '研发设计',
    kind: 'class',
    accent: '#4f46e5',
    code: `classDiagram
    class Order {
      +String id
      +OrderStatus status
      +Money total
      +confirm()
      +cancel(reason)
    }
    class OrderLine {
      +String sku
      +int quantity
      +Money unitPrice
      +subtotal() Money
    }
    class Payment {
      +String transactionId
      +Money amount
      +capture()
      +refund()
    }
    class Shipment {
      +String trackingNo
      +ship()
      +markDelivered()
    }
    Order "1" *-- "1..*" OrderLine
    Order "1" --> "0..1" Payment
    Order "1" --> "0..*" Shipment`,
  },
  {
    id: 'lifecycle-state',
    title: '订单状态机',
    description: '定义状态、事件和异常回退路径',
    category: '研发设计',
    kind: 'state',
    accent: '#9333ea',
    code: `stateDiagram-v2
    [*] --> Draft
    Draft --> Submitted: 提交
    Submitted --> Paid: 支付成功
    Submitted --> Cancelled: 超时/取消
    Paid --> Fulfilling: 库存锁定
    Fulfilling --> Shipped: 出库
    Fulfilling --> RefundPending: 缺货
    Shipped --> Delivered: 签收
    Delivered --> Completed: 售后期结束
    Paid --> RefundPending: 申请退款
    RefundPending --> Refunded: 退款完成
    Completed --> [*]
    Cancelled --> [*]
    Refunded --> [*]`,
  },
  {
    id: 'project-gantt',
    title: '项目实施计划',
    description: '里程碑、依赖关系与关键交付物',
    category: '项目管理',
    kind: 'gantt',
    accent: '#b45309',
    code: `gantt
    title 核心系统升级计划
    dateFormat YYYY-MM-DD
    axisFormat %m/%d
    excludes weekends
    section 方案阶段
    需求澄清           :done, req, 2026-08-17, 5d
    方案评审           :milestone, review, after req, 0d
    section 开发阶段
    核心模块开发       :active, dev, after review, 12d
    接口联调           :integration, after dev, 6d
    section 上线阶段
    用户验收测试       :uat, after integration, 5d
    上线评审           :milestone, gate, after uat, 0d
    生产切换           :deploy, after gate, 2d`,
  },
  {
    id: 'customer-journey',
    title: '客户旅程图',
    description: '识别触点体验和改进机会',
    category: '项目管理',
    kind: 'journey',
    accent: '#db2777',
    code: `journey
    title 企业客户采购旅程
    section 发现
      搜索解决方案: 4: 客户
      阅读案例: 4: 客户
      预约演示: 3: 客户,销售
    section 评估
      产品演示: 5: 客户,销售
      技术验证: 3: 客户,售前
      商务谈判: 2: 客户,销售,法务
    section 采购
      合同审批: 2: 客户,法务
      付款开通: 4: 客户,财务
    section 使用
      团队培训: 4: 客户,成功经理
      首次交付: 5: 客户,成功经理`,
  },
  {
    id: 'product-mindmap',
    title: '产品需求脑图',
    description: '从目标、用户到功能和指标的全景梳理',
    category: '项目管理',
    kind: 'mindmap',
    accent: '#0d9488',
    code: `mindmap
  root((流程图工作台))
    用户
      业务分析师
      产品经理
      架构师
      项目经理
    场景
      业务流程
      系统架构
      泳道协作
      技术设计
    核心能力
      模板创建
      实时预览
      版本管理
      专业导出
    质量
      安全渲染
      本地优先
      可访问性
      响应式`,
  },
  {
    id: 'blank-flowchart',
    title: '空白流程图',
    description: '从最小骨架自由开始',
    category: '业务流程',
    kind: 'flowchart',
    accent: '#64748b',
    code: `flowchart LR
    start([开始]) --> step[处理步骤]
    step --> decision{是否通过?}
    decision -->|是| done([完成])
    decision -->|否| step`,
  },
]

export const defaultTemplate = diagramTemplates.find((template) => template.id === 'order-swimlane')!

export function getTemplate(id: string): DiagramTemplate | undefined {
  return diagramTemplates.find((template) => template.id === id)
}
