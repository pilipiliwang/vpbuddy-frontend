const app = document.querySelector("#app");

const state = {
  view: "login",
  showCreate: false,
  stageTab: "presentation",
  meetingLeftTab: "materials",
  knowledgeTab: "personal",
  selectedKnowledge: "kb-1",
  selectedMaterial: "mat-1",
  selectedDeliverable: "del-demo",
  selectedFollowup: "fq-1",
  selectedExplanation: "exp-1",
  currentSlide: 1,
  activeTool: "cursor",
  annotationColor: "#2f8cff",
  penSize: 4,
  annotations: [],
  drawingAnnotationId: "",
  textDraft: null,
  composerText: "",
  showComposerHistory: false,
  vpbuddyMessages: [],
  fileUploadContext: "material",
  knowledgeCallable: {},
  zoom: 100,
  toast: "",
  modal: ""
};

let toastTimer = 0;

const assets = {
  slide: "assets/slide-esg-solution.png",
  dashboard: "assets/deliverable-dashboard.png",
  thumbs: [
    "assets/thumb-slide-1.png",
    "assets/thumb-slide-2.png",
    "assets/thumb-slide-3.png",
    "assets/thumb-slide-4.png",
    "assets/thumb-slide-5.png",
    "assets/thumb-slide-6.png"
  ]
};

const user = {
  name: "VP_User",
  organization: "企业版",
  role: "VP"
};

const meetings = [
  {
    id: "m-1",
    title: "XX公司-ESG碳管理系统需求沟通会",
    desc: "产品需求沟通与方案设计讨论",
    time: "今天 10:00 - 11:30",
    status: "进行中",
    cover: "assets/meeting-city.png"
  },
  {
    id: "m-2",
    title: "供应链减排方案评审会",
    desc: "供应链减排路径与实施方案评审",
    time: "今天 14:00 - 15:30",
    status: "进行中",
    cover: "assets/meeting-bulb.png"
  },
  {
    id: "m-3",
    title: "双碳目标数据校验会",
    desc: "双碳目标数据核对与校验",
    time: "昨天 15:30 - 17:00",
    status: "已结束",
    cover: "assets/meeting-globe.png"
  },
  {
    id: "m-4",
    title: "能源系统升级项目启动会",
    desc: "能源系统升级项目启动与分工",
    time: "今天 09:30 - 10:30",
    status: "进行中",
    cover: "assets/meeting-wind.png"
  },
  {
    id: "m-5",
    title: "ESG报告编制工作会",
    desc: "ESG报告编制进度与内容确认",
    time: "05-15 10:00 - 11:30",
    status: "已结束",
    cover: "assets/meeting-wave.png"
  },
  {
    id: "m-6",
    title: "绿色供应商评估标准研讨会",
    desc: "绿色供应商评估标准讨论与优化",
    time: "05-14 14:00 - 15:30",
    status: "已结束",
    cover: "assets/meeting-forest.png"
  }
];

const materials = [
  { id: "mat-1", name: "ESG碳管理系统方案.pptx", type: "ppt", size: "18.6 MB", time: "10:16", version: "V1.2" },
  { id: "mat-2", name: "企业碳排放现状分析.pdf", type: "pdf", size: "5.2 MB", time: "10:16", version: "V1.0" },
  { id: "mat-3", name: "需求调研清单.docx", type: "word", size: "2.1 MB", time: "10:14", version: "V1.1" },
  { id: "mat-4", name: "系统功能清单.xlsx", type: "excel", size: "36.5 KB", time: "10:12", version: "V1.0" },
  { id: "mat-5", name: "项目实施计划.docx", type: "word", size: "1.4 MB", time: "10:05", version: "V1.0" }
];

const timeline = [
  { time: "10:00", title: "会议开始", desc: "主持人发起会议" },
  { time: "10:05", title: "上传材料", desc: "上传了 6 个会议材料" },
  { time: "10:10", title: "AI 提问", desc: "提出了 3 个关键问题" },
  { time: "10:16", title: "解释材料", desc: "AI 生成材料摘要" },
  { time: "10:20", title: "发送给客户", desc: "发送 2 个问题和 1 个材料" }
];

const meetingRecords = [
  { time: "10:00:12", speaker: "主持人 · 刘洋", role: "乙方", tone: "host", text: "各位上午好，我们今天主要确认 ESG 碳管理系统的一期建设范围和数据接入方式。" },
  { time: "10:03:28", speaker: "客户 · 张伟", role: "甲方", tone: "customer", text: "我们希望先把集团、区域、工厂三级的碳排数据统一起来，后续再扩展到供应链。" },
  { time: "10:06:44", speaker: "产品 · 陈晨", role: "乙方", tone: "team", text: "目前方案里首页会展示总排放、范围一二三、同比环比和预警信息，支持按组织树下钻。" },
  { time: "10:10:05", speaker: "客户 · 李明", role: "甲方", tone: "customer", text: "该方案如何实现碳排放数据的自动采集？我们现在有 ERP、能耗系统和部分手工台账。" },
  { time: "10:12:36", speaker: "客户 · 王芳", role: "甲方", tone: "customer", text: "系统如何支持多组织、多层级管理？总部和工厂看到的数据范围需要不一样。" },
  { time: "10:15:18", speaker: "客户 · 张伟", role: "甲方", tone: "customer", text: "减排路径建议基于哪些数据模型？我们需要知道模型依据和可解释性。" },
  { time: "10:16:42", speaker: "AI 助手", role: "系统", tone: "ai", text: "已生成 4 条 AI 反问，并关联会议材料、企业知识与行业知识，正在沉淀解释材料。" },
  { time: "10:20:09", speaker: "主持人 · 刘洋", role: "乙方", tone: "host", text: "我们先把数据采集、组织权限和减排模型作为待确认重点，会后输出需求清单和接口草案。" }
];

const aiFollowupQuestions = [
  {
    id: "fq-1",
    time: "10:11",
    target: "李明",
    question: "ERP、能耗系统和手工台账分别由哪个部门维护，是否已有字段清单和接口方式？",
    reason: "基于客户提到多数据源接入，需确认数据责任人与可连接性。",
    status: "待发送"
  },
  {
    id: "fq-2",
    time: "10:13",
    target: "王芳",
    question: "总部、区域、工厂三级权限是否需要按查看、填报、审批分别配置？",
    reason: "基于多组织多层级诉求，需细化角色权限和数据范围。",
    status: "建议追问"
  },
  {
    id: "fq-3",
    time: "10:15",
    target: "张伟",
    question: "减排路径建议更关注成本、周期还是减排量排序，是否需要多目标对比？",
    reason: "基于模型可解释性要求，需确认优化目标和业务偏好。",
    status: "待确认"
  },
  {
    id: "fq-4",
    time: "10:18",
    target: "全体",
    question: "一期是否纳入 Scope 3 供应链数据，还是先聚焦范围一、范围二？",
    reason: "基于会议范围边界，需避免一期交付范围扩大。",
    status: "可选追问"
  }
];

const deliverables = [
  { id: "del-demo", name: "交互 Demo", subtitle: "ESG碳管理系统", type: "demo", status: "已完成", time: "10:16", version: "V1.2", desc: "根据会议确认的首页概览、碳排总览、范围排放与预警模块生成的可演示交互原型。" },
  { id: "del-req", name: "需求清单", subtitle: "功能范围与确认项", type: "word", status: "已完成", time: "10:16", version: "V1.1", desc: "沉淀客户诉求、待确认事项、已确认范围和业务规则，供会后需求评审使用。" },
  { id: "del-task", name: "任务拆解", subtitle: "研发任务与里程碑", type: "task", status: "已完成", time: "10:14", version: "V1.0", desc: "按产品、数据、接口、前端、后端和测试拆分任务，关联会议结论与负责人。" },
  { id: "del-tech", name: "技术方案", subtitle: "架构与数据链路", type: "code", status: "已完成", time: "10:12", version: "V1.0", desc: "围绕碳数据采集、核算因子库、组织分层和报表服务生成技术实施建议。" },
  { id: "del-api", name: "API设计", subtitle: "接口与数据契约", type: "api", status: "已完成", time: "10:08", version: "V0.9", desc: "定义组织、排放源、采集任务、核算结果、预警和报告导出的接口草案。" },
  { id: "del-summary", name: "会议纪要", subtitle: "结论、待办与引用材料", type: "word", status: "已完成", time: "10:05", version: "V1.0", desc: "记录会议结论、待办事项、材料引用和可追溯的需求演化过程。" }
];

const conceptSources = [
  { title: "ISO 14064-1:2018 核算边界", source: "行业知识", confidence: "92%" },
  { title: "企业能耗系统接口字段清单", source: "企业知识", confidence: "89%" },
  { title: "ESG碳管理系统解决方案.pptx 第 3 页", source: "会议材料", confidence: "86%" }
];

const explanationFindings = [
  {
    id: "exp-1",
    time: "10:16",
    title: "自动采集链路说明",
    trigger: "该方案如何实现碳排放数据的自动采集？我们现在有 ERP、能耗系统和部分手工台账。",
    lookupTargets: ["企业知识库", "会议材料", "网络标准"],
    keywords: ["自动采集", "ERP接口", "能耗系统", "数据校验"],
    status: "已完成索引",
    summary: "说明 ERP、能耗系统、IoT 设备和人工台账如何进入采集任务，并在核算前完成字段映射与质量校验。",
    explanation: "该问题需要结合客户现有系统和行业核算要求解释。建议说明为：通过 ERP、能耗系统、IoT 设备与人工台账建立数据连接器，按采集任务配置字段映射、频率和责任人；进入核算前先做单位、缺失值、异常波动和排放源归属校验，再把有效活动数据写入碳排核算模型。",
    evidence: [
      { title: "企业能耗系统接口字段清单", source: "企业知识库", ref: "字段：meter_id、energy_type、reading_time、value", confidence: "89%" },
      { title: "ESG碳管理系统解决方案.pptx", source: "会议材料", ref: "第 3 页：数据采集 / 碳排放核算", confidence: "86%" },
      { title: "ISO 14064-1:2018 数据质量要求", source: "网络标准", ref: "组织层面温室气体清单与边界", confidence: "82%" }
    ]
  },
  {
    id: "exp-2",
    time: "10:17",
    title: "多组织多层级权限说明",
    trigger: "系统如何支持多组织、多层级管理？总部和工厂看到的数据范围需要不一样。",
    lookupTargets: ["会议材料", "企业知识库"],
    keywords: ["组织树", "权限继承", "数据隔离", "工厂分层"],
    status: "已完成索引",
    summary: "解释集团、区域、园区、工厂、车间的组织树建模，以及角色权限和组织范围共同过滤数据的方式。",
    explanation: "该问题需要解释组织模型和权限边界。建议以集团、区域、园区、工厂、车间建立组织树；每条活动数据绑定组织节点和排放源，权限按角色和组织范围共同过滤。总部查看汇总与横向对比，工厂维护本级采集任务和核算结果。",
    evidence: [
      { title: "ESG碳管理系统解决方案.pptx", source: "会议材料", ref: "第 4 页：组织层级与权限", confidence: "91%" },
      { title: "需求调研清单.docx", source: "企业知识库", ref: "权限范围：总部 / 分子公司 / 工厂", confidence: "87%" }
    ]
  },
  {
    id: "exp-3",
    time: "10:18",
    title: "减排路径模型依据",
    trigger: "减排路径建议基于哪些数据模型？我们需要知道模型依据和可解释性。",
    lookupTargets: ["网络资料", "行业知识库", "会议材料"],
    keywords: ["基准年", "排放因子", "情景预测", "边际减排成本"],
    status: "需联网补充",
    summary: "概括基准年、活动数据、排放因子、情景预测和边际减排成本如何支撑减排路径建议。",
    explanation: "该问题需要外部方法论与内部数据共同支撑。建议说明为：先确定基准年和组织边界，基于活动数据、排放因子、历史强度指标建立排放预测；再用情景预测比较不同产量、能源结构和减排措施组合，必要时加入边际减排成本来排序减排路径。",
    evidence: [
      { title: "行业标杆案例集.pdf", source: "行业知识库", ref: "减排路径：情景模拟与措施组合", confidence: "84%" },
      { title: "公开方法论待检索", source: "网络资料", ref: "SBTi / GHG Protocol 相关路径建模", confidence: "待确认" },
      { title: "企业碳排放现状分析.pdf", source: "会议材料", ref: "历史排放与排放源结构", confidence: "80%" }
    ]
  }
];

const knowledgeTabs = [
  ["personal", "个人知识"],
  ["enterprise", "企业知识"],
  ["industry", "行业知识"]
];

const knowledgeDocs = [
  { id: "kb-1", scope: "enterprise", name: "ESG碳管理系统解决方案.pptx", type: "ppt", size: "18.6 MB", updated: "2024-05-15 10:28", source: "企业上传", visible: "企业成员可见", tags: ["ESG", "碳管理", "解决方案", "数字化"] },
  { id: "kb-2", scope: "enterprise", name: "企业碳排放现状分析.pdf", type: "pdf", size: "5.2 MB", updated: "2024-05-14 16:55", source: "企业上传", visible: "企业成员可见", tags: ["盘查", "排放因子"] },
  { id: "kb-3", scope: "personal", name: "需求调研清单.docx", type: "word", size: "2.1 MB", updated: "2024-05-14 11:20", source: "个人上传", visible: "仅我可见", tags: ["需求", "访谈"] },
  { id: "kb-4", scope: "enterprise", name: "系统功能清单.xlsx", type: "excel", size: "36.5 KB", updated: "2024-05-13 09:42", source: "企业上传", visible: "企业成员可见", tags: ["功能", "范围"] },
  { id: "kb-5", scope: "industry", name: "行业标杆案例集.pdf", type: "pdf", size: "12.8 MB", updated: "2024-05-12 18:30", source: "行业资料库", visible: "团队可调用", tags: ["行业", "案例"] },
  { id: "kb-6", scope: "personal", name: "项目实施计划.docx", type: "word", size: "1.4 MB", updated: "2024-05-12 14:08", source: "个人上传", visible: "仅我可见", tags: ["实施", "计划"] }
];

const knowledgePreviewSnippets = {
  "kb-1": ["系统包含数据采集、碳排放核算、报告披露、减排管理与决策支持五个核心模块。", "一期重点接入 ERP、能耗系统和手工台账，先完成范围一、范围二核算闭环。", "数据进入核算模型前需要经过字段映射、单位换算、缺失值校验和异常波动识别。"],
  "kb-2": ["企业当前排放源以外购电力、燃料燃烧和生产过程排放为主。", "历史数据存在口径不统一、手工台账分散和因子版本不一致的问题。", "建议先建立基准年清单，再补齐组织边界和排放源归属。"],
  "kb-3": ["客户关注多组织、多角色权限和多数据源接入的实施路径。", "访谈问题包括数据责任部门、字段清单、接口方式、填报审批流和报告口径。", "需求确认后需要形成可追踪的需求清单和交付范围边界。"],
  "kb-4": ["功能清单覆盖用户权限、组织边界、活动数据、排放因子、核算任务和报告输出。", "每个功能项需要标记优先级、一期范围、依赖数据源和验收标准。", "系统需支持自定义排放因子、字段映射和数据质量校验规则。"],
  "kb-5": ["行业案例普遍采用组织树、数据连接器、核算模型和可视化看板组合建设。", "减排路径通常结合基准年、情景预测、措施库和边际减排成本排序。", "标杆企业会将供应链 Scope 3 数据作为二期扩展重点。"],
  "kb-6": ["项目计划分为需求确认、详细设计、数据接入、核算配置、联调验收和试运行。", "一期建议控制在核心组织边界、核心排放源和关键报表范围内。", "每个阶段需要明确客户责任人、交付物、评审节点和风险项。"]
};

const todoItems = [
  ["提供企业现有碳数据相关系统清单及接口文档", "李明", "05-20"],
  ["确认碳排放核算因子库需求与扩展规则", "王芳", "05-22"],
  ["输出ESG碳管理系统详细需求规格说明书", "陈晨", "05-25"],
  ["评审并确认系统原型设计方案", "张伟", "05-27"],
  ["制定项目实施计划与资源安排", "刘洋", "05-28"]
];

const navItems = [
  ["workspace", "工作台", "grid"],
  ["knowledge", "知识库", "book"],
  ["settings", "设置", "settings"]
];

const iconPaths = {
  arrowLeft: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4v15.5"/><path d="M20 4v18"/><path d="M6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  bot: '<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 14h.01"/><path d="M15 14h.01"/><path d="M9 18h6"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
  camera: '<path d="M14.5 4 13 2H9L7.5 4H5a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3Z"/><circle cx="12" cy="13" r="4"/><path d="M18 8h.01"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><rect x="2" y="2" width="13" height="13" rx="2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  invite: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M12 16v4"/>',
  pen: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.4 5.6L21 8"/><path d="M21 3v5h-5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  settings: '<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.66V21a2 2 0 1 1-4 0v-.09a1.8 1.8 0 0 0-1.1-1.66 1.8 1.8 0 0 0-1.98.36l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.66-1.1H3a2 2 0 1 1 0-4h.09A1.8 1.8 0 0 0 4.75 8.8a1.8 1.8 0 0 0-.36-1.98l-.06-.06A2 2 0 1 1 7.16 3.9l.06.06a1.8 1.8 0 0 0 1.98.36h.01A1.8 1.8 0 0 0 10.3 2.7V3a2 2 0 1 1 4 0v-.09a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 1.98-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.8 1.8 0 0 0-.36 1.98v.01a1.8 1.8 0 0 0 1.66 1.1H21a2 2 0 1 1 0 4h-.09A1.8 1.8 0 0 0 19.4 15Z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/>',
  sparkle: '<path d="M12 3 9.8 8.8 4 11l5.8 2.2L12 19l2.2-5.8L20 11l-5.8-2.2Z"/><path d="M19 3v4"/><path d="M21 5h-4"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  user: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',
  zoom: '<path d="M5 12h14"/><path d="M12 5v14"/>'
};

function icon(name, size = 20) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || ""}</svg>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function logo(compact = false) {
  return `
    <div class="brand ${compact ? "brand-compact" : ""}">
      <div class="brand-mark"><span></span></div>
      <strong>VPBuddy</strong>
    </div>
  `;
}

function docBadge(type) {
  const labelMap = { ppt: "P", pdf: "PDF", word: "W", excel: "X", image: "IMG", demo: "D", task: "T", code: "</>", api: "API" };
  return `<span class="doc-badge doc-${type}">${labelMap[type] || "F"}</span>`;
}

function setToast(message, closeModal = true) {
  if (toastTimer) window.clearTimeout(toastTimer);
  state.toast = message;
  if (closeModal) state.modal = "";
  toastTimer = window.setTimeout(() => {
    if (state.toast === message) {
      state.toast = "";
      render();
    }
  }, 2600);
}

function render() {
  const views = {
    login: renderLogin,
    workspace: renderWorkspace,
    meeting: renderMeetingStage,
    summary: renderSummary,
    knowledge: renderKnowledge,
    settings: renderSettings
  };

  app.innerHTML = `${(views[state.view] || renderWorkspace)()}${renderToast()}${renderActionModal()}${renderFilePicker()}`;
  requestAnimationFrame(() => {
    updateAnnotationViewport();
    if (state.textDraft) {
      const input = document.querySelector(".annotation-text-input");
      input?.focus();
    }
  });
}

function renderFilePicker() {
  return `<input class="native-file-input" type="file" multiple accept=".ppt,.pptx,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" />`;
}

function nowTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function pushVpbuddyMessage(text, type = "question") {
  state.vpbuddyMessages.unshift({ id: createAnnotationId(), time: nowTime(), text, type });
  state.showComposerHistory = true;
}

function getKnowledgeDocsForCurrentTab() {
  return knowledgeDocs.filter((item) => item.scope === state.knowledgeTab);
}

function getSelectedKnowledgeDoc() {
  const visibleDocs = getKnowledgeDocsForCurrentTab();
  return visibleDocs.find((item) => item.id === state.selectedKnowledge) || visibleDocs[0] || knowledgeDocs[0];
}

function isKnowledgeCallable(doc) {
  return state.knowledgeCallable[doc.id] !== false;
}

function renderLogin() {
  return `
    <main class="login-page">
      <section class="login-hero">
        <div class="login-copy">
          ${logo()}
          <h1>AI 会议协同与交付生成系统</h1>
          <p>把无数人的项目经验，变成你的交付伙伴</p>
          <div class="feature-pills">
            <span>${icon("mic")}本地录音</span>
            <span>${icon("book")}知识索引</span>
            <span>${icon("sparkle")}经验沉淀</span>
            <span>${icon("send")}持续交付</span>
          </div>
        </div>
      </section>
      <section class="login-card panel">
        <header class="login-card-head">
          <span>测试版</span>
          <h2>手机号登录</h2>
          <p>使用手机号、短信验证码和邀请码进入 VPBuddy。</p>
        </header>
        <label class="field with-icon">
          ${icon("user")}
          <input value="" placeholder="请输入手机号" inputmode="tel" autocomplete="tel" />
        </label>
        <div class="login-code-row">
          <label class="field with-icon">
            ${icon("lock")}
            <input value="" placeholder="请输入验证码" inputmode="numeric" autocomplete="one-time-code" />
          </label>
          <button class="ghost" data-action="toast" data-message="验证码已发送到手机">发送验证码</button>
        </div>
        <label class="field with-icon">
          ${icon("invite")}
          <input value="" placeholder="请输入邀请码" autocomplete="off" />
        </label>
        <button class="primary wide" data-action="login">进入测试版</button>
        <p class="login-note">邀请码由 VPBuddy 项目组发放，仅用于当前测试环境。</p>
      </section>
      <footer class="login-status">
        <span><i class="status-dot"></i>客户端已就绪</span>
        <span>${icon("mic", 18)}麦克风已连接</span>
        <span>设备正常 <i class="status-check">${icon("check", 14)}</i></span>
      </footer>
    </main>
  `;
}

function renderShell(content) {
  return `
    <main class="app-shell">
      <aside class="sidebar">
        ${logo(true)}
        <nav class="side-nav">
          ${navItems.map(([view, label, iconName]) => `
            <button class="${state.view === view ? "active" : ""}" data-action="nav" data-view="${view}">
              ${icon(iconName)}<span>${label}</span>
            </button>
          `).join("")}
        </nav>
      </aside>
      <section class="shell-main">${content}</section>
    </main>
  `;
}

function renderWorkspace() {
  const body = `
    <header class="page-header">
      <h1>工作台</h1>
      <button class="primary" data-action="open-create">${icon("plus")}新建会议</button>
    </header>
    <section class="meeting-grid">
      ${meetings.map(renderMeetingCard).join("")}
    </section>
    ${state.showCreate ? renderCreateModal() : ""}
  `;
  return renderShell(body);
}

function renderMeetingCard(meeting) {
  const running = meeting.status === "进行中";
  return `
    <article class="meeting-card panel">
      <div class="meeting-cover" style="background-image:url('${meeting.cover}')">
        <span class="status-chip ${running ? "live" : "done"}"><i></i>${meeting.status}</span>
      </div>
      <div class="meeting-info">
        <h2>${meeting.title}</h2>
        <p>${meeting.desc}</p>
        <div class="meeting-actions">
          <span>${icon("calendar", 18)}${meeting.time}</span>
          <button class="${running ? "primary compact" : "ghost compact"}" data-action="${running ? "open-meeting" : "open-summary"}">
            ${running ? "进入会议" : "查看总结"} ${icon(running ? "arrowRight" : "file", 18)}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderCreateModal() {
  return `
    <div class="modal-backdrop">
      <section class="create-modal">
        <button class="modal-close" data-action="close-create">${icon("close")}</button>
        <div class="modal-main">
          <h2>快速新建会议</h2>
          <label>会议名称 <strong>*</strong><input maxlength="50" placeholder="请输入会议名称" /></label>
          <label>项目/客户（可选）<input maxlength="50" placeholder="请输入项目或客户名称（可选）" /></label>
        </div>
        <div class="device-box">
          <div class="device-item">${icon("mic", 34)}<span><strong>麦克风</strong><em>正常</em></span></div>
          <div class="device-item">${icon("bot", 34)}<span><strong>录音</strong><em>就绪</em></span></div>
        </div>
        <footer class="modal-actions">
          <button class="light" data-action="close-create">取消</button>
          <button class="primary" data-action="start-meeting">${icon("play")}开始会议</button>
        </footer>
      </section>
    </div>
  `;
}

function renderMeetingStage() {
  return `
    <main class="stage-screen">
      <header class="stage-topbar">
        <div class="stage-left">
          ${logo(true)}
          <button class="ghost back" data-action="nav" data-view="workspace">${icon("arrowLeft")}返回工作台</button>
        </div>
        <div class="stage-title">
          <h1>XX公司-ESG碳管理系统需求沟通会</h1>
          <span class="recording"><i></i>录制中</span>
          <span class="timer">00:28:34</span>
        </div>
        <div class="stage-actions">
          <button class="danger" data-action="open-summary">${icon("power")}结束会议</button>
        </div>
      </header>
      <section class="stage-layout">
        ${renderMeetingLeftPanel()}
        <section class="stage-center">
          <div class="center-card panel">
            <div class="center-tabs">
              <button class="${state.stageTab === "presentation" ? "active" : ""}" data-action="stage-tab" data-tab="presentation">投屏内容</button>
              <button class="${state.stageTab === "deliverable" ? "active" : ""}" data-action="stage-tab" data-tab="deliverable">交付物</button>
            </div>
            ${state.stageTab === "presentation" ? renderPresentationCanvas() : renderDeliverableCanvas()}
          </div>
          ${renderVpbuddyComposer()}
        </section>
        ${renderAIPanel()}
      </section>
    </main>
  `;
}

function renderMeetingLeftPanel() {
  if (state.stageTab === "deliverable") return renderDeliverableListPanel();

  const tab = state.meetingLeftTab;
  return `
    <aside class="meeting-left panel">
      <div class="panel-tabs">
        <button class="${tab === "materials" ? "active" : ""}" data-action="left-tab" data-tab="materials">会议资料</button>
        <button class="${tab === "records" ? "active" : ""}" data-action="left-tab" data-tab="records">会议记录</button>
        <button class="${tab === "understanding" ? "active" : ""}" data-action="left-tab" data-tab="understanding">会议理解</button>
      </div>
      ${tab === "records" ? renderMeetingRecords() : tab === "understanding" ? renderUnderstanding() : renderMaterialsList()}
    </aside>
  `;
}

function renderDeliverableListPanel() {
  return `
    <aside class="meeting-left panel">
      <header class="deliverable-list-head">
        <h2>交付物列表</h2>
        <p>会中持续生成，可切换版本并回到会议证据。</p>
      </header>
      <div class="deliverable-stack">
        ${deliverables.map((item) => `
          <button class="deliverable-row ${state.selectedDeliverable === item.id ? "active" : ""}" data-action="select-deliverable" data-id="${item.id}">
            ${docBadge(item.type)}
            <span><strong>${item.name}</strong><em>${item.status} · ${item.time}</em></span>
            <small>${item.version}</small>
          </button>
        `).join("")}
      </div>
    </aside>
  `;
}

function renderMaterialsList() {
  return `
    <button class="primary wide upload-button" data-action="open-upload" data-context="material">${icon("upload")}上传材料</button>
    <div class="material-stack">
      ${materials.map((item, index) => `
        <button class="material-row ${state.selectedMaterial === item.id ? "active" : ""}" data-action="select-material" data-id="${item.id}">
          ${docBadge(item.type)}
          <span><strong>${item.name}</strong><em>${item.size}</em></span>
          <i class="more">⋮</i>
        </button>
      `).join("")}
    </div>
  `;
}

function renderMeetingRecords() {
  return `
    <section class="record-panel">
      <header class="record-head">
        <span><i></i>实时转写中</span>
        <button data-action="toast" data-message="会议记录已同步到最新">${icon("refresh", 16)}同步</button>
      </header>
      <div class="record-stream">
        ${meetingRecords.map((item) => `
          <article class="record-item ${item.tone}">
            <div>
              <header><strong>${item.speaker}</strong><em>${item.role}</em><time>${item.time}</time></header>
              <p>${item.text}</p>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderUnderstanding() {
  const groups = [
    ["用户核心诉求", "blue", ["碳排放数据统一管理", "多组织多层级统计", "可视化看板与报告"]],
    ["待确认事项", "yellow", ["数据采集频率", "是否支持多国/欧盟Scope 3", "减排路径模型选型"]],
    ["已确认事项", "green", ["支持集团/区域/工厂分层", "支持PC端", "核心模块包含碳核算/数据管理/报表分析"]]
  ];
  return groups.map(([title, tone, items]) => `
    <section class="understand-card ${tone}">
      <h3><i></i>${title}</h3>
      ${items.map((item) => `<p><span>•</span>${item}</p>`).join("")}
    </section>
  `).join("");
}

function renderAnnotationLayer() {
  const svg = state.annotations.map((item) => {
    if (item.type === "pen") {
      const points = item.points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
      return `<path data-action="annotation-hit" data-annotation-id="${item.id}" d="${points}" stroke="${item.color}" stroke-width="${item.size}" fill="none" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />`;
    }
    if (item.type === "rect") {
      const x = Math.min(item.x, item.x2);
      const y = Math.min(item.y, item.y2);
      const width = Math.abs(item.x2 - item.x);
      const height = Math.abs(item.y2 - item.y);
      return `<rect data-action="annotation-hit" data-annotation-id="${item.id}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="0.8" stroke="${item.color}" stroke-width="${item.size}" fill="rgba(47, 140, 255, 0.08)" vector-effect="non-scaling-stroke" />`;
    }
    return "";
  }).join("");

  const textNotes = state.annotations.filter((item) => item.type === "text").map((item) => `
    <button class="annotation-text-note" data-action="annotation-hit" data-annotation-id="${item.id}" style="left:${item.x}%;top:${item.y}%;color:${item.color}">
      ${escapeHtml(item.text)}
    </button>
  `).join("");

  return { svg, textNotes };
}

function renderPresentationCanvas() {
  const annotations = renderAnnotationLayer();
  const colors = ["#2f8cff", "#09dba1", "#ffc94c", "#ff4f64"];
  const tools = [
    ["cursor", "指针", "arrowRight"],
    ["pen", "画笔", "pen"],
    ["text", "文字", ""],
    ["rect", "矩形", ""],
    ["eraser", "橡皮", "close"]
  ];
  return `
    <div class="canvas-toolbar">
      <div class="tool-group">
        ${tools.map(([tool, label, iconName]) => `
          <button class="tool-button ${state.activeTool === tool ? "active" : ""}" title="${label}" aria-label="${label}" data-action="tool" data-tool="${tool}">
            ${tool === "text" ? "<strong>T</strong>" : tool === "rect" ? "<i class=\"rect-symbol\"></i>" : icon(iconName)}
          </button>
        `).join("")}
      </div>
      <div class="tool-group">
        ${colors.map((color) => `<button class="color-swatch ${state.annotationColor === color ? "active" : ""}" title="批注颜色" data-action="annotation-color" data-color="${color}" style="--swatch:${color}"></button>`).join("")}
        <button class="size-step" data-action="annotation-size" data-size="-1">-</button>
        <strong class="pen-size">${state.penSize}px</strong>
        <button class="size-step" data-action="annotation-size" data-size="1">+</button>
      </div>
      <div class="tool-group">
        <button title="撤销批注" data-action="annotation-undo">${icon("refresh")}</button>
        <button title="清空批注" data-action="annotation-clear">${icon("close")}</button>
      </div>
      <div class="tool-group slide-tools">
        <button title="上一页" data-action="slide-step" data-step="-1">${icon("arrowLeft")}</button>
        <button title="下一页" data-action="slide-step" data-step="1">${icon("arrowRight")}</button>
      </div>
      <div class="zoom-control"><button data-action="zoom" data-step="-10">-</button><strong>${state.zoom}%</strong><button data-action="zoom" data-step="10">+</button></div>
      <button class="fullscreen-corners" data-action="modal" data-modal="fullscreen">⛶</button>
    </div>
    <div class="slide-frame annotation-canvas tool-${state.activeTool}">
      <img src="${assets.slide}" alt="ESG碳管理系统解决方案演示页" />
      <svg class="annotation-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="会议批注层">${annotations.svg}</svg>
      <div class="annotation-text-layer">
        ${annotations.textNotes}
        ${state.textDraft ? `<input class="annotation-text-input" value="${escapeHtml(state.textDraft.value)}" style="left:${state.textDraft.x}%;top:${state.textDraft.y}%" placeholder="输入批注" />` : ""}
      </div>
      <button class="stage-capture-button" data-action="capture-screenshot" title="截屏上传" aria-label="截屏上传">
        ${icon("camera", 30)}
        <span>截屏</span>
      </button>
    </div>
    <div class="thumb-strip">
      <button class="thumb-arrow" data-action="slide-step" data-step="-1">${icon("arrowLeft", 16)}</button>
      ${assets.thumbs.map((src, index) => `<button class="slide-thumb ${state.currentSlide === index + 1 ? "active" : ""}" data-action="select-slide" data-slide="${index + 1}"><img src="${src}" alt="第 ${index + 1} 页缩略图" /><span>${index + 1}</span></button>`).join("")}
      <button class="thumb-arrow" data-action="slide-step" data-step="1">${icon("arrowRight", 16)}</button>
    </div>
  `;
}

function renderDeliverableCanvas() {
  const current = deliverables.find((item) => item.id === state.selectedDeliverable) || deliverables[0];
  if (current.id !== "del-demo") {
    return `
      <div class="deliverable-head">
        <h2>${current.name}（${current.subtitle}）</h2>
        <div>
          <button class="ghost small" data-action="modal" data-modal="deliverable-open">${icon("monitor", 16)}打开</button>
        </div>
      </div>
      <section class="deliverable-doc">
        <header>
          ${docBadge(current.type)}
          <div><h3>${current.name}</h3><p>${current.desc}</p></div>
          <span>${current.version}</span>
        </header>
        <div class="deliverable-evidence">
          <article><strong>来源会议片段</strong><p>10:10 会议问答、10:16 AI 解释材料、10:20 发送给客户。</p></article>
          <article><strong>关联材料</strong><p>ESG碳管理系统方案.pptx、需求调研清单.docx、系统功能清单.xlsx。</p></article>
          <article><strong>处理状态</strong><p>${current.status}，等待 VP 确认后进入会后归档。</p></article>
        </div>
        <div class="deliverable-preview-list">
          <p><span>01</span> 业务目标、项目范围与核心约束</p>
          <p><span>02</span> 数据采集、核算、报表与权限管理</p>
          <p><span>03</span> 待确认问题、风险项和下一步任务</p>
        </div>
      </section>
    `;
  }

  return `
    <div class="deliverable-head">
      <h2>交互 Demo（ESG碳管理系统）</h2>
      <div><button class="ghost small" data-action="toast" data-message="已进入交付物全屏预览">${icon("monitor", 16)}全屏</button><button class="ghost small" data-action="toast" data-message="交互 Demo 已刷新">${icon("refresh", 16)}刷新</button></div>
    </div>
    <div class="demo-frame">
      <img src="${assets.dashboard}" alt="ESG碳管理系统交互 Demo 仪表盘" />
    </div>
  `;
}

function renderVpbuddyComposer() {
  const messageCount = state.vpbuddyMessages.length;
  return `
    <section class="send-box center-send-box panel">
      <header>
        <h3>${icon("send")}发送给 VPBuddy</h3>
        <button class="composer-toggle ${state.showComposerHistory ? "open" : ""}" data-action="toggle-composer-history">
          ${state.showComposerHistory ? "收起记录" : `展开记录${messageCount ? ` · ${messageCount}` : ""}`}
        </button>
      </header>
      ${state.showComposerHistory ? `
        <div class="composer-history">
          ${messageCount ? state.vpbuddyMessages.map((item) => `
            <article class="${item.type}">
              <time>${item.time}</time>
              <p>${escapeHtml(item.text)}</p>
            </article>
          `).join("") : `<p class="empty-history">暂无发送记录</p>`}
        </div>
      ` : ""}
      <div class="composer-row">
        <textarea class="vpbuddy-input" maxlength="500" placeholder="输入你的问题、补充说明或交付要求...">${escapeHtml(state.composerText)}</textarea>
        <div class="composer-actions">
          <span class="composer-count">${state.composerText.length}/500</span>
          <button class="primary" data-action="send-vpbuddy-message">${icon("send", 16)}发送问题</button>
          <button class="secondary" data-action="send-vpbuddy-material">${icon("upload", 16)}发送材料</button>
        </div>
      </div>
    </section>
  `;
}

function renderAIPanel() {
  return `
    <aside class="ai-panel panel">
      <h2>AI 协同</h2>
      <section class="ai-box">
        <div class="box-title">${icon("sparkle")}<strong>AI反问</strong><button data-action="toast" data-message="已根据会议记录重新生成反问建议">${icon("refresh", 16)}刷新</button></div>
        <div class="followup-list">
          ${aiFollowupQuestions.slice(0, 3).map((item) => `
            <button class="question-row followup-row ${state.selectedFollowup === item.id ? "active" : ""}" data-action="open-followup" data-id="${item.id}">
              ${icon("bot", 16)}
              <span>
                <strong>${item.question}</strong>
                <em>${item.time} · 面向 ${item.target} · ${item.status}</em>
                <i>${item.reason}</i>
              </span>
            </button>
          `).join("")}
        </div>
        <button class="link-more" data-action="modal" data-modal="all-followups">查看全部 AI 反问 ${icon("arrowRight", 16)}</button>
      </section>
      <section class="explain-box">
        <div class="box-title">${icon("file")}<strong>解释材料</strong><button data-action="toast" data-message="解释材料列表已复制">${icon("copy", 16)}复制</button></div>
        <div class="explanation-list">
          ${explanationFindings.map((item) => `
            <button class="explanation-row ${state.selectedExplanation === item.id ? "active" : ""}" data-action="open-explanation" data-id="${item.id}">
              <time>${item.time}</time>
              <span class="${item.status.includes("需") ? "pending" : "done"}">${item.status}</span>
              <strong>${item.title}</strong>
              <p>${item.summary}</p>
              <em>${item.lookupTargets.join(" / ")}</em>
            </button>
          `).join("")}
        </div>
        <button class="link-more" data-action="modal" data-modal="all-explanations">查看全部解释材料 ${icon("arrowRight", 16)}</button>
      </section>
    </aside>
  `;
}

function renderTimeline() {
  return `
    <section class="timeline panel">
      <h2>${icon("calendar")}会议时间线</h2>
      <div class="timeline-track">
        ${timeline.map((item) => `
          <article>
            <span></span>
            <time>${item.time}</time>
            <strong>${item.title}</strong>
            <p>${item.desc}</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSummary() {
  return `
    <main class="summary-page">
      <header class="summary-header">
        <button class="ghost back" data-action="nav" data-view="workspace">${icon("arrowLeft")}返回工作台</button>
        <h1>XX公司-ESG碳管理系统需求沟通会</h1>
        <span class="ended-chip">已结束</span>
        <p>2024年5月15日（周三）10:00 - 11:30</p>
        <div>
          <button class="primary" data-action="modal" data-modal="export-summary">${icon("download")}导出纪要</button>
          <button class="secondary" data-action="modal" data-modal="share-summary">${icon("share")}分享</button>
        </div>
      </header>
      <section class="summary-grid">
        <article class="panel conclusions">
          <h2>${icon("sparkle")}会议结论</h2>
          ${[
            ["01", "明确项目目标与范围", "本次会议明确了ESG碳管理系统的建设目标、核心功能模块及一期交付范围，聚焦碳数据管理、碳排放核算与可视化。"],
            ["02", "确定数据来源与集成方案", "确定企业内部数据系统对接清单及对接优先级，采用API对接与定时同步方案，保障数据准确性与时效性。"],
            ["03", "碳排放核算方法与标准", "采用ISO 14064-1:2018及企业自有核算方法，系统内置行业通用因子库，支持自定义因子扩展。"],
            ["04", "项目计划与下一步行动", "确认项目实施计划与里程碑，需求评审后进入详细设计阶段，双方明确下一步任务与负责人。"]
          ].map(([no, title, text]) => `<section><span>${no}</span><div><h3>${title}</h3><p>${text}</p></div></section>`).join("")}
        </article>
        <article class="panel minute">
          <h2>${icon("file")}会议纪要摘要</h2>
          <h3>会议概况</h3>
          <p>会议时间：2024年5月15日（周三）10:00 - 11:30</p>
          <p>会议时长：1小时30分钟</p>
          <p>会议地点：线上会议（VPBuddy）</p>
          <h3>参会人员</h3>
          <p>甲方：张伟、李明、王芳等；乙方：刘洋、陈晨、周航等。</p>
          <h3>议题回顾</h3>
          <p>ESG碳管理系统建设目标与范围、核心功能需求与业务流程、数据对接与核算方法、项目计划与下一步工作安排。</p>
        </article>
        <article class="panel todo-panel">
          <h2>${icon("check")}待办事项</h2>
          ${todoItems.map(([text, owner, date]) => `<label><span class="empty-check"></span><strong>${text}</strong><em>${icon("user", 15)}${owner}</em><time>${date}</time></label>`).join("")}
        </article>
        <article class="panel refs-panel">
          <h2>${icon("book")}引用材料</h2>
          ${materials.slice(1).map((item) => `<button data-action="toast" data-message="${item.name} 已加入下载队列">${docBadge(item.type)}<strong>${item.name}</strong><span>${item.size}</span><time>2024-05-08</time>${icon("download", 16)}</button>`).join("")}
        </article>
      </section>
      <section class="panel delivery-strip">
        <h2>${icon("grid")}交付物</h2>
        <div>
          ${materials.map((item) => `
            <article data-action="toast" data-message="${item.name} 已切换版本">
              ${docBadge(item.type)}
              <strong>${item.name}</strong>
              <p>${item.type === "ppt" ? "系统整体解决方案与架构设计，包含功能模块与实施路径。" : "系统对接、需求说明与项目实施相关交付材料。"}</p>
              <label>版本：<select><option>${item.version}</option></select></label>
            </article>
          `).join("")}
        </div>
      </section>
    </main>
  `;
}

function renderKnowledge() {
  const visibleDocs = getKnowledgeDocsForCurrentTab();
  const selected = getSelectedKnowledgeDoc();
  const callable = isKnowledgeCallable(selected);
  const body = `
    <header class="page-header knowledge-head">
      <h1>知识库</h1>
    </header>
    <section class="kb-tabs">
      ${knowledgeTabs.map(([id, label]) => `
        <button class="${state.knowledgeTab === id ? "active" : ""}" data-action="knowledge-tab" data-tab="${id}">
          ${label}<em>${knowledgeDocs.filter((item) => item.scope === id).length}</em>
        </button>
      `).join("")}
    </section>
    <section class="knowledge-layout">
      <div class="knowledge-main">
        <div class="kb-toolbar">
          <label class="field search-field"><input placeholder="搜索文档名称或关键词" />${icon("search")}</label>
          <button class="primary" data-action="open-upload" data-context="knowledge">${icon("upload")}上传文档</button>
        </div>
        <div class="kb-table panel">
          <div class="kb-row kb-head"><span>名称</span><span>类型</span><span>更新时间</span><span>状态</span></div>
          ${visibleDocs.map((doc) => `<button class="kb-row ${doc.id === selected.id ? "active" : ""}" data-action="knowledge-select" data-id="${doc.id}">
            <span>${docBadge(doc.type)}${doc.name}</span><span>${doc.type.toUpperCase()}</span><span>${doc.updated}</span><span><i class="status-dot"></i>可用</span>
          </button>`).join("")}
          <footer>共 ${visibleDocs.length} 条 <button data-action="toast" data-message="已经是第一页">‹</button><button data-action="toast" data-message="当前第 1 页">1</button><button data-action="toast" data-message="没有更多页">›</button></footer>
        </div>
      </div>
      <aside class="knowledge-detail panel">
        <header>${docBadge(selected.type)}<div><h2>${selected.name}</h2><p>${selected.type.toUpperCase()} · ${selected.size}</p></div></header>
        <h3>标签</h3>
        <div class="tag-list">${selected.tags.map((tag) => `<button data-action="toast" data-message="已按 ${tag} 筛选">${tag}</button>`).join("")}<button data-action="modal" data-modal="add-tag">${icon("plus", 15)}添加标签</button></div>
        <h3>来源</h3>
        <p>${icon("upload", 16)}${selected.source}</p>
        <h3>可见范围</h3>
        <p>${icon("lock", 16)}${selected.visible}</p>
        <h3>本次会议可调用</h3>
        <p>开启后，AI 在本次会议中可引用该文档内容。</p>
        <div class="knowledge-callable">
          <button class="switch ${callable ? "on" : "off"}" data-action="toggle-knowledge-callable" data-id="${selected.id}" aria-pressed="${callable}"><i></i></button>
          <span>${callable ? "已开启，AI 可在本次会议引用" : "未开启，AI 不会在本次会议引用"}</span>
        </div>
        <footer>
          <button class="ghost" data-action="modal" data-modal="knowledge-preview" data-id="${selected.id}">${icon("monitor")}预览</button>
          <button class="primary" data-action="modal" data-modal="knowledge-more" data-id="${selected.id}">更多操作</button>
        </footer>
      </aside>
    </section>
  `;
  return renderShell(body);
}

function renderSettings() {
  const body = `
    <header class="page-header"><h1>设置</h1></header>
    <section class="settings-card panel">
      <header>${icon("sparkle", 34)}<div><h2>AI 配置</h2><p>配置 AI 模型与接口，驱动智能问答与内容生成</p></div></header>
      <label>API Key <strong>*</strong><textarea placeholder="请输入您的 API Key"></textarea></label>
      <label>AI 模型 <strong>*</strong><select><option>GPT-4.1</option><option>GPT-4o</option><option>o3</option></select></label>
      <label>接口地址（可选）<input placeholder="https://api.openai.com/v1" /></label>
      <footer>
        <div><i class="status-dot"></i><strong>已连接</strong><p>连接正常，可正常使用 AI 服务</p></div>
        <button class="ghost" data-action="toast" data-message="连接测试通过，延迟 86ms">${icon("refresh")}测试连接</button>
        <button class="primary" data-action="toast" data-message="AI 设置已保存">${icon("file")}保存设置</button>
      </footer>
    </section>
  `;
  return renderShell(body);
}

function renderToast() {
  if (!state.toast) return "";
  return `<div class="toast">${icon("check", 16)}${state.toast}<button data-action="clear-toast">${icon("close", 14)}</button></div>`;
}

function renderActionModal() {
  if (!state.modal) return "";
  const selectedExplanation = explanationFindings.find((item) => item.id === state.selectedExplanation) || explanationFindings[0];
  const selectedFollowup = aiFollowupQuestions.find((item) => item.id === state.selectedFollowup) || aiFollowupQuestions[0];
  const selectedDeliverable = deliverables.find((item) => item.id === state.selectedDeliverable) || deliverables[0];
  const selectedKnowledge = getSelectedKnowledgeDoc();
  const selectedKnowledgeCallable = isKnowledgeCallable(selectedKnowledge);
  const selectedKnowledgeTab = knowledgeTabs.find(([id]) => id === selectedKnowledge.scope) || knowledgeTabs[0];

  if (state.modal === "all-followups") {
    return `
      <div class="modal-backdrop action-backdrop">
        <section class="action-modal panel list-modal">
          <button class="modal-close" data-action="close-modal">${icon("close")}</button>
          <header>
            <h2>全部 AI 反问</h2>
            <p>基于实时会议记录生成的追问建议。</p>
          </header>
          <div class="modal-list">
            ${aiFollowupQuestions.map((item) => `
              <button class="question-row followup-row" data-action="open-followup" data-id="${item.id}">
                ${icon("bot", 16)}
                <span>
                  <strong>${item.question}</strong>
                  <em>${item.time} · 面向 ${item.target} · ${item.status}</em>
                  <i>${item.reason}</i>
                </span>
              </button>
            `).join("")}
          </div>
        </section>
      </div>
    `;
  }

  if (state.modal === "followup-detail") {
    return `
      <div class="modal-backdrop action-backdrop">
        <section class="action-modal panel followup-detail-modal">
          <button class="modal-close" data-action="close-modal">${icon("close")}</button>
          <header>
            <span>${selectedFollowup.time}</span>
            <h2>AI 反问详情</h2>
            <em>${selectedFollowup.status}</em>
          </header>
          <article class="detail-question">
            <strong>建议反问</strong>
            <p>${selectedFollowup.question}</p>
          </article>
          <div class="lookup-meta">
            <em>面向 ${selectedFollowup.target}</em>
            <em>会议对话分析</em>
            <em>待主持人确认</em>
          </div>
          <article class="explain-summary">
            <strong>生成原因</strong>
            <p>${selectedFollowup.reason}</p>
          </article>
          <footer>
            <button class="ghost" data-action="close-modal">关闭</button>
            <button class="primary" data-action="send-followup-question">发送给客户</button>
          </footer>
        </section>
      </div>
    `;
  }

  if (state.modal === "all-explanations") {
    return `
      <div class="modal-backdrop action-backdrop">
        <section class="action-modal panel list-modal">
          <button class="modal-close" data-action="close-modal">${icon("close")}</button>
          <header>
            <h2>全部解释材料</h2>
            <p>根据会议对话触发检索后生成的解释材料列表。</p>
          </header>
          <div class="modal-list">
            ${explanationFindings.map((item) => `
              <button class="explanation-row" data-action="open-explanation" data-id="${item.id}">
                <time>${item.time}</time>
                <span class="${item.status.includes("需") ? "pending" : "done"}">${item.status}</span>
                <strong>${item.title}</strong>
                <p>${item.summary}</p>
                <em>${item.lookupTargets.join(" / ")}</em>
              </button>
            `).join("")}
          </div>
        </section>
      </div>
    `;
  }

  if (state.modal === "explanation-detail") {
    return `
      <div class="modal-backdrop action-backdrop">
        <section class="action-modal panel explanation-detail-modal">
          <button class="modal-close" data-action="close-modal">${icon("close")}</button>
          <header>
            <span>${selectedExplanation.time}</span>
            <h2>${selectedExplanation.title}</h2>
            <em class="${selectedExplanation.status.includes("需") ? "pending" : "done"}">${selectedExplanation.status}</em>
          </header>
          <p class="question-context"><strong>触发原话</strong>${selectedExplanation.trigger}</p>
          <div class="lookup-meta">
            ${selectedExplanation.lookupTargets.map((target) => `<em>${target}</em>`).join("")}
          </div>
          <div class="concept-list">
            ${selectedExplanation.keywords.map((keyword) => `<button data-action="concept-search" data-concept="${keyword}">${keyword}</button>`).join("")}
          </div>
          <article class="explain-summary">
            <strong>解释建议</strong>
            <p>${selectedExplanation.explanation}</p>
          </article>
          <div class="evidence-list">
            ${selectedExplanation.evidence.map((source, index) => `
              <article class="evidence-row">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${source.title}</strong>
                <em>${source.source} · ${source.confidence}</em>
                <small>${source.ref}</small>
              </article>
            `).join("")}
          </div>
          <footer>
            <button class="ghost" data-action="close-modal">关闭</button>
            <button class="primary" data-action="submit-explanation">生成解释稿</button>
          </footer>
        </section>
      </div>
    `;
  }

  if (state.modal === "knowledge-preview") {
    const snippets = knowledgePreviewSnippets[selectedKnowledge.id] || [];
    return `
      <div class="modal-backdrop action-backdrop">
        <section class="action-modal panel knowledge-preview-modal">
          <button class="modal-close" data-action="close-modal">${icon("close")}</button>
          <header>
            ${docBadge(selectedKnowledge.type)}
            <div>
              <span>${selectedKnowledgeTab[1]} · ${selectedKnowledge.updated}</span>
              <h2>知识预览</h2>
              <p>${selectedKnowledge.name}</p>
            </div>
          </header>
          <div class="knowledge-preview-meta">
            <em>${selectedKnowledge.type.toUpperCase()}</em>
            <em>${selectedKnowledge.size}</em>
            <em>${selectedKnowledge.visible}</em>
            <em>${selectedKnowledgeCallable ? "本次会议可调用" : "本次会议不可调用"}</em>
          </div>
          <div class="tag-list preview-tags">
            ${selectedKnowledge.tags.map((tag) => `<button data-action="toast" data-message="已按 ${tag} 筛选">${tag}</button>`).join("")}
          </div>
          <div class="preview-snippets">
            ${snippets.map((text, index) => `
              <article>
                <span>${String(index + 1).padStart(2, "0")}</span>
                <p>${text}</p>
              </article>
            `).join("")}
          </div>
          <footer>
            <button class="ghost" data-action="close-modal">关闭</button>
            <button class="primary" data-action="toggle-knowledge-callable" data-id="${selectedKnowledge.id}">
              ${selectedKnowledgeCallable ? "关闭本次调用" : "开启本次调用"}
            </button>
          </footer>
        </section>
      </div>
    `;
  }

  if (state.modal === "knowledge-more") {
    return `
      <div class="modal-backdrop action-backdrop">
        <section class="action-modal panel knowledge-more-modal">
          <button class="modal-close" data-action="close-modal">${icon("close")}</button>
          <header>
            <h2>更多操作</h2>
            <p>${selectedKnowledge.name}</p>
          </header>
          <div class="knowledge-op-list">
            <button data-action="knowledge-op" data-op="rename" data-id="${selectedKnowledge.id}">${icon("file", 18)}<span><strong>重命名</strong><em>调整知识文档名称</em></span></button>
            <button data-action="knowledge-op" data-op="preview" data-id="${selectedKnowledge.id}">${icon("monitor", 18)}<span><strong>打开预览</strong><em>查看解析内容和索引切片</em></span></button>
            <button data-action="toggle-knowledge-callable" data-id="${selectedKnowledge.id}">${icon("sparkle", 18)}<span><strong>${selectedKnowledgeCallable ? "关闭本次会议调用" : "开启本次会议调用"}</strong><em>${selectedKnowledgeCallable ? "AI 将不再引用该文档" : "AI 可在本次会议引用该文档"}</em></span></button>
            <button data-action="knowledge-op" data-op="visibility" data-id="${selectedKnowledge.id}">${icon("lock", 18)}<span><strong>调整可见范围</strong><em>当前：${selectedKnowledge.visible}</em></span></button>
            <button data-action="knowledge-op" data-op="download" data-id="${selectedKnowledge.id}">${icon("download", 18)}<span><strong>下载原文件</strong><em>${selectedKnowledge.type.toUpperCase()} · ${selectedKnowledge.size}</em></span></button>
          </div>
          <footer>
            <button class="ghost" data-action="close-modal">关闭</button>
          </footer>
        </section>
      </div>
    `;
  }

  const map = {
    "profile": ["当前账号", `${user.name} · ${user.organization} · ${user.role}。后端可扩展 GET /auth/me 返回组织、角色和权限范围。`],
    "upload-material": ["上传会议材料", "选择 PPT、PDF、Word、Excel 或图片后，调用 POST /meetings/:id/materials 上传，并进入解析队列。"],
    "storage": ["会议空间", "展示本组织空间用量、材料解析状态和清理策略。接口建议 GET /workspace/storage。"],
    "fullscreen": ["会议室全屏展示", "进入全屏展示时隐藏复杂控制区，仅保留翻页、批注和临时呼出 AI 的浮动工具。"],
    "deliverable-open": ["打开交付物", `${selectedDeliverable.name} 会在会议交互空间中打开，并把本次打开事件写入会议时间线。`],
    "concept-search": ["索引依据", `基于会议原话“${selectedExplanation.trigger}”检索：${selectedExplanation.keywords.join("、")}。当前索引来源包括：${selectedExplanation.lookupTargets.join("、")}。`],
    "ai-more": ["更多 AI 反问", "这里展示 AI 根据会议转写、材料上下文和客户诉求生成的反问队列，支持按对象、状态和触发片段筛选。"],
    "send-material": ["发送材料", "将当前解释材料或交付物发送给客户确认，调用 POST /meetings/:id/customer-messages。"],
    "export-summary": ["导出纪要", "支持导出 DOCX/PDF，并附带会议结论、待办、引用材料和交付物版本。"],
    "share-summary": ["分享归档", "生成只读分享链接，可设置有效期、访问密码和可下载范围。"],
    "upload-knowledge": ["上传知识文档", "上传后调用 POST /knowledge/documents，后端解析、切片、向量化并返回可用状态。"],
    "add-tag": ["添加标签", "为当前知识文档追加标签，调用 POST /knowledge/documents/:id/tags。"],
    "knowledge-preview": ["知识预览", "预览当前文档的解析文本、切片、标签和可被本次会议调用的范围。"],
    "knowledge-more": ["知识更多操作", "包含重命名、移动范围、删除、权限设置、设为本次会议可调用等操作。"]
  };
  const [title, body] = map[state.modal] || ["操作", "该操作已接入前端反馈，后续可替换为真实接口调用。"];
  return `
    <div class="modal-backdrop action-backdrop">
      <section class="action-modal panel">
        <button class="modal-close" data-action="close-modal">${icon("close")}</button>
        <h2>${title}</h2>
        <p>${body}</p>
        <footer>
          <button class="ghost" data-action="close-modal">取消</button>
          <button class="primary" data-action="confirm-modal">确认</button>
        </footer>
      </section>
    </div>
  `;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createAnnotationId() {
  return `ann-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getAnnotationImageRect() {
  const canvas = document.querySelector(".annotation-canvas");
  const image = canvas?.querySelector("img");
  if (!canvas || !image) return null;
  const frame = canvas.getBoundingClientRect();
  const imageRatio = image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 16 / 9;
  const frameRatio = frame.width / frame.height;
  let width = frame.width;
  let height = frame.height;
  let left = frame.left;
  let top = frame.top;
  if (frameRatio > imageRatio) {
    width = frame.height * imageRatio;
    left = frame.left + (frame.width - width) / 2;
  } else {
    height = frame.width / imageRatio;
    top = frame.top + (frame.height - height) / 2;
  }
  return { left, top, width, height, frameLeft: frame.left, frameTop: frame.top };
}

function updateAnnotationViewport() {
  const rect = getAnnotationImageRect();
  const layer = document.querySelector(".annotation-layer");
  const textLayer = document.querySelector(".annotation-text-layer");
  if (!rect || !layer || !textLayer) return;
  [layer, textLayer].forEach((element) => {
    element.style.left = `${rect.left - rect.frameLeft}px`;
    element.style.top = `${rect.top - rect.frameTop}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
  });
}

function getCanvasPoint(event) {
  const rect = getAnnotationImageRect();
  if (!rect) return null;
  if (event.clientX < rect.left || event.clientX > rect.left + rect.width || event.clientY < rect.top || event.clientY > rect.top + rect.height) {
    return null;
  }
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
  };
}

function commitTextDraft() {
  if (!state.textDraft) return;
  const text = state.textDraft.value.trim();
  if (text) {
    state.annotations.push({
      id: createAnnotationId(),
      type: "text",
      x: state.textDraft.x,
      y: state.textDraft.y,
      color: state.annotationColor,
      text
    });
  }
  state.textDraft = null;
}

function removeAnnotation(id) {
  state.annotations = state.annotations.filter((item) => item.id !== id);
}

function getMaterialTypeFromFileName(name) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["xls", "xlsx"].includes(ext)) return "excel";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";
  return "demo";
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function addMeetingMaterialFromFile(file, options = {}) {
  const item = {
    id: `mat-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: file.name,
    type: getMaterialTypeFromFileName(file.name),
    size: formatFileSize(file.size),
    time: nowTime(),
    version: "V1.0"
  };
  materials.unshift(item);
  if (options.select) state.selectedMaterial = item.id;
  return item;
}

function drawStageAnnotations(ctx, width, height) {
  state.annotations.forEach((item) => {
    ctx.save();
    ctx.strokeStyle = item.color;
    ctx.fillStyle = item.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, item.size * (width / 1200));

    if (item.type === "pen" && item.points?.length) {
      ctx.beginPath();
      item.points.forEach((point, index) => {
        const x = (point.x / 100) * width;
        const y = (point.y / 100) * height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    if (item.type === "rect") {
      const x = (Math.min(item.x, item.x2) / 100) * width;
      const y = (Math.min(item.y, item.y2) / 100) * height;
      const rectWidth = (Math.abs(item.x2 - item.x) / 100) * width;
      const rectHeight = (Math.abs(item.y2 - item.y) / 100) * height;
      ctx.fillStyle = "rgba(47, 140, 255, 0.10)";
      ctx.fillRect(x, y, rectWidth, rectHeight);
      ctx.strokeRect(x, y, rectWidth, rectHeight);
    }

    if (item.type === "text") {
      const x = (item.x / 100) * width;
      const y = (item.y / 100) * height;
      const fontSize = Math.max(22, Math.round(width * 0.022));
      ctx.font = `700 ${fontSize}px "Microsoft YaHei", Arial, sans-serif`;
      ctx.lineWidth = Math.max(3, fontSize * 0.12);
      ctx.strokeStyle = "rgba(2, 11, 29, 0.82)";
      ctx.strokeText(item.text, x, y);
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, x, y);
    }

    ctx.restore();
  });
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
}

async function captureStageScreenshot() {
  const image = document.querySelector(".annotation-canvas img");
  if (!image) {
    setToast("暂无可截屏的投屏内容");
    render();
    return;
  }

  if (!image.complete) {
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", reject, { once: true });
    });
  }

  const width = image.naturalWidth || 1600;
  const height = image.naturalHeight || 900;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);
  drawStageAnnotations(ctx, width, height);

  const blob = await canvasToPngBlob(canvas);
  if (!blob) {
    setToast("截屏生成失败，请重试");
    render();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = new File([blob], `投屏截图-${stamp}.png`, { type: "image/png" });
  const material = addMeetingMaterialFromFile(file, { select: true });
  state.meetingLeftTab = "materials";
  setToast(`截屏已上传为会议材料：${material.name}，等待后端解析`);
  render();
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action !== "tool" && action !== "annotation-hit") commitTextDraft();

  if (action === "login") state.view = "workspace";
  if (action === "nav") state.view = target.dataset.view;
  if (action === "modal") {
    if (target.dataset.id) state.selectedKnowledge = target.dataset.id;
    state.modal = target.dataset.modal;
  }
  if (action === "close-modal") state.modal = "";
  if (action === "confirm-modal") setToast("操作已确认，等待后端接口接入");
  if (action === "toast") setToast(target.dataset.message || "操作已触发");
  if (action === "clear-toast") state.toast = "";
  if (action === "open-create") state.showCreate = true;
  if (action === "close-create") state.showCreate = false;
  if (action === "start-meeting") {
    state.showCreate = false;
    state.view = "meeting";
  }
  if (action === "open-meeting") state.view = "meeting";
  if (action === "open-summary") state.view = "summary";
  if (action === "stage-tab") state.stageTab = target.dataset.tab;
  if (action === "left-tab") state.meetingLeftTab = target.dataset.tab;
  if (action === "knowledge-tab") {
    state.knowledgeTab = target.dataset.tab;
    const firstDoc = knowledgeDocs.find((item) => item.scope === state.knowledgeTab);
    if (firstDoc) state.selectedKnowledge = firstDoc.id;
  }
  if (action === "knowledge-select") state.selectedKnowledge = target.dataset.id;
  if (action === "toggle-knowledge-callable") {
    const doc = knowledgeDocs.find((item) => item.id === target.dataset.id) || getSelectedKnowledgeDoc();
    state.selectedKnowledge = doc.id;
    const next = !isKnowledgeCallable(doc);
    state.knowledgeCallable[doc.id] = next;
    setToast(next ? "已开启本次会议可调用" : "已关闭本次会议可调用", false);
  }
  if (action === "knowledge-op") {
    const doc = knowledgeDocs.find((item) => item.id === target.dataset.id) || getSelectedKnowledgeDoc();
    state.selectedKnowledge = doc.id;
    const op = target.dataset.op;
    if (op === "preview") {
      state.modal = "knowledge-preview";
    } else {
      const labelMap = {
        rename: "已进入重命名流程",
        visibility: "已打开可见范围设置",
        download: "原文件已加入下载队列"
      };
      setToast(`${doc.name}：${labelMap[op] || "操作已触发"}`, false);
    }
  }
  if (action === "open-upload") {
    state.fileUploadContext = target.dataset.context || "material";
    document.querySelector(".native-file-input")?.click();
    return;
  }
  if (action === "capture-screenshot") {
    await captureStageScreenshot();
    return;
  }
  if (action === "select-material") {
    state.selectedMaterial = target.dataset.id;
    setToast("材料已在会议空间打开");
  }
  if (action === "select-deliverable") state.selectedDeliverable = target.dataset.id;
  if (action === "select-followup") state.selectedFollowup = target.dataset.id;
  if (action === "toggle-composer-history") state.showComposerHistory = !state.showComposerHistory;
  if (action === "send-vpbuddy-message") {
    const text = state.composerText.trim();
    pushVpbuddyMessage(text || "请根据当前会议内容继续分析并给出建议。");
    state.composerText = "";
    setToast("问题已发送给 VPBuddy");
  }
  if (action === "send-vpbuddy-material") {
    state.fileUploadContext = "vpbuddy-material";
    document.querySelector(".native-file-input")?.click();
    return;
  }
  if (action === "send-followup-question") {
    pushVpbuddyMessage(`发送 AI 反问：${(aiFollowupQuestions.find((item) => item.id === state.selectedFollowup) || aiFollowupQuestions[0]).question}`, "followup");
    setToast("AI 反问已发送给客户");
  }
  if (action === "open-followup") {
    state.selectedFollowup = target.dataset.id;
    state.modal = "followup-detail";
  }
  if (action === "open-explanation") {
    state.selectedExplanation = target.dataset.id;
    state.modal = "explanation-detail";
  }
  if (action === "tool") {
    state.activeTool = target.dataset.tool;
    const labelMap = { cursor: "指针", pen: "画笔", text: "文字", rect: "矩形", eraser: "橡皮" };
    setToast(`已切换到${labelMap[target.dataset.tool] || "批注"}工具`);
  }
  if (action === "annotation-color") state.annotationColor = target.dataset.color;
  if (action === "annotation-size") state.penSize = clamp(state.penSize + Number(target.dataset.size), 2, 10);
  if (action === "annotation-undo") {
    state.annotations.pop();
    setToast("已撤销上一处批注");
  }
  if (action === "annotation-clear") {
    state.annotations = [];
    state.textDraft = null;
    setToast("已清空当前页批注");
  }
  if (action === "annotation-hit" && state.activeTool === "eraser") {
    removeAnnotation(target.dataset.annotationId);
    setToast("已擦除批注");
  }
  if (action === "zoom") {
    state.zoom = Math.max(60, Math.min(160, state.zoom + Number(target.dataset.step)));
  }
  if (action === "select-slide") state.currentSlide = Number(target.dataset.slide);
  if (action === "slide-step") {
    const next = state.currentSlide + Number(target.dataset.step);
    state.currentSlide = Math.max(1, Math.min(assets.thumbs.length, next));
  }
  if (action === "concept-search") {
    state.modal = "concept-search";
  }
  if (action === "submit-explanation") {
    const selected = explanationFindings.find((item) => item.id === state.selectedExplanation);
    if (selected) selected.status = "已生成解释稿";
    setToast("解释稿已基于会议记录和索引依据生成");
  }

  render();
});

document.addEventListener("input", (event) => {
  if (event.target.matches(".vpbuddy-input")) {
    state.composerText = event.target.value;
    const counter = document.querySelector(".composer-count");
    if (counter) counter.textContent = `${state.composerText.length}/500`;
    return;
  }
  if (!event.target.matches(".annotation-text-input") || !state.textDraft) return;
  state.textDraft.value = event.target.value;
});

document.addEventListener("change", (event) => {
  if (!event.target.matches(".native-file-input")) return;
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const names = files.map((file) => file.name).join("、");
  if (state.fileUploadContext === "vpbuddy-material") {
    pushVpbuddyMessage(`发送材料：${names}`, "material");
    setToast("材料已选择并发送给 VPBuddy");
  } else if (state.fileUploadContext === "knowledge") {
    setToast(`已选择知识文档：${names}`);
  } else {
    const uploaded = files.map((file) => addMeetingMaterialFromFile(file, { select: true }));
    setToast(`会议材料已上传：${uploaded.map((item) => item.name).join("、")}，等待后端解析`);
  }
  event.target.value = "";
  render();
});

document.addEventListener("keydown", (event) => {
  if (!event.target.matches(".annotation-text-input")) return;
  if (event.key === "Enter") {
    event.preventDefault();
    commitTextDraft();
    render();
  }
  if (event.key === "Escape") {
    state.textDraft = null;
    render();
  }
});

document.addEventListener("pointerdown", (event) => {
  const canvas = event.target.closest(".annotation-canvas");
  if (!canvas || event.target.closest(".annotation-text-input, .stage-capture-button")) return;
  if (state.stageTab !== "presentation") return;

  const point = getCanvasPoint(event);
  if (!point) return;

  if (state.activeTool === "cursor") return;

  if (state.activeTool === "eraser") {
    const hit = event.target.closest("[data-annotation-id]");
    if (hit) {
      removeAnnotation(hit.dataset.annotationId);
      render();
    }
    return;
  }

  event.preventDefault();
  commitTextDraft();

  if (state.activeTool === "text") {
    state.textDraft = { x: point.x, y: point.y, value: "" };
    render();
    return;
  }

  const id = createAnnotationId();
  if (state.activeTool === "pen") {
    state.annotations.push({
      id,
      type: "pen",
      color: state.annotationColor,
      size: state.penSize,
      points: [point]
    });
  }
  if (state.activeTool === "rect") {
    state.annotations.push({
      id,
      type: "rect",
      color: state.annotationColor,
      size: state.penSize,
      x: point.x,
      y: point.y,
      x2: point.x,
      y2: point.y
    });
  }
  state.drawingAnnotationId = id;
  render();
});

document.addEventListener("pointermove", (event) => {
  if (!state.drawingAnnotationId) return;
  const point = getCanvasPoint(event);
  const annotation = state.annotations.find((item) => item.id === state.drawingAnnotationId);
  if (!point || !annotation) return;

  event.preventDefault();
  if (annotation.type === "pen") {
    const last = annotation.points.at(-1);
    if (!last || Math.abs(last.x - point.x) + Math.abs(last.y - point.y) > 0.35) {
      annotation.points.push(point);
    }
  }
  if (annotation.type === "rect") {
    annotation.x2 = point.x;
    annotation.y2 = point.y;
  }
  render();
});

document.addEventListener("pointerup", () => {
  state.drawingAnnotationId = "";
});

window.addEventListener("resize", updateAnnotationViewport);

render();
