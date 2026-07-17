# VPBuddy Releases

## v0.1.3 · 2026-07-17

### Windows

- [Windows 安装版（x64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.3/VPBuddy-Setup-0.1.3-x64.exe)：标准安装程序，可创建桌面和开始菜单快捷方式。
- [Windows 便携版（x64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.3/VPBuddy-Portable-0.1.3-x64.exe)：无需安装，直接运行。

### macOS

- [Apple Silicon 版（arm64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.3/VPBuddy-0.1.3-mac-arm64.dmg)：适用于 Apple M 系列芯片。
- [Intel 版（x64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.3/VPBuddy-0.1.3-mac-x64.dmg)：适用于 Intel 芯片 Mac。

### 主要更新

- PDF 投屏改用稳定的 PDF.js 画布渲染，保留当前页与滚动位置，避免后台刷新导致内容反复闪烁或回到开头。
- 图片、PDF 和其他可预览材料共享统一投屏画布；画笔、文字和图形批注不再依赖底层材料格式。
- 截屏操作捕获完整投屏画布，包含当前材料画面与批注，并沿用会议材料上传和 VPBuddy 发送流程。
- 发送材料使用稳定的文件选择入口，支持重复选择同一文件，并区分上传中、已上传待解析、解析完成和解析失败状态。
- 材料上传成功后立即进入会议资料和对话记录，后端解析结果随后异步更新，不再让用户等待完整解析才看到上传成功。
- 交付物页左侧新增“会议记录”和“交付物列表”切换，查看交付物时仍可随时核对真实会议转录。
- AI 协同列表与详情统一解析后端 Markdown，兼容 `content`、`text`、`question` 和 `suggestion` 等真实返回字段。
- 开始录制按钮保持原位置和尺寸，同时增强默认、录制中、暂停、请求中及错误状态的视觉反馈。
- 桌面客户端增加窗口加载兜底显示逻辑，修复安装包启动后进程存在但窗口未出现的问题。

### 数据与接口边界

- 会议材料、聊天、AI 协同和交付物仍使用现有后端接口，不新增业务 mock 数据。
- 当前后端没有独立的材料解析进度或解析重试接口；客户端依据材料状态、聊天消息和实时事件展示解析阶段，失败后的重试仍通过重新上传执行。

### 校验

- JavaScript 语法检查通过，全部 Node 自动化测试通过。
- Windows 解包客户端完成实际构建和窗口启动烟雾测试。
- GitHub Actions 根据 `v0.1.3` tag 构建，并在发布前严格校验版本号和 4 个公开资产。

## v0.1.2 · 2026-07-17

### Windows

- [Windows 安装版（x64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.2/VPBuddy-Setup-0.1.2-x64.exe)：标准安装程序，可创建桌面和开始菜单快捷方式。
- [Windows 便携版（x64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.2/VPBuddy-Portable-0.1.2-x64.exe)：无需安装，直接运行。

### macOS

- [Apple Silicon 版（arm64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.2/VPBuddy-0.1.2-mac-arm64.dmg)：适用于 Apple M 系列芯片。
- [Intel 版（x64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.2/VPBuddy-0.1.2-mac-x64.dmg)：适用于 Intel 芯片 Mac。

### 主要更新

- 优化登录输入框焦点样式，去掉输入框内部突兀的蓝色矩形，同时保留清晰的键盘焦点提示。
- Windows 客户端、安装器、便携版、快捷方式和 macOS 应用统一使用蓝紫色抽象 V 品牌图标。
- Electron 客户端按 Windows DPI、可用工作区和有效 CSS 视口动态适配桌面专用缩放，改善高分屏下文字及控件过大的问题。
- 桌面缩放支持窗口移动、换屏、尺寸变化和 DPI 变化，并提供有边界的环境变量覆盖；浏览器开发模式不受影响。
- Release 下载区按版本号、发布日期和平台整理，只保留 4 个面向用户的版本化安装文件。

### 校验

- 登录焦点、桌面图标、显示缩放与 Release 资产均新增自动化契约测试。
- Windows 安装版和便携版完成实际构建及图标资源核对。
- GitHub Actions 根据 `v0.1.2` tag 构建，并在发布前严格校验版本号和 4 个公开资产。

## v0.1.1 · 2026-07-17

### Windows

- [Windows 安装版（x64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.1/VPBuddy-Setup-0.1.1-x64.exe)：标准安装程序，可创建桌面和开始菜单快捷方式。
- [Windows 便携版（x64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.1/VPBuddy-Portable-0.1.1-x64.exe)：无需安装，直接运行。

### macOS

- [Apple Silicon 版（arm64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.1/VPBuddy-0.1.1-mac-arm64.dmg)：适用于 Apple M 系列芯片。
- [Intel 版（x64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.1/VPBuddy-0.1.1-mac-x64.dmg)：适用于 Intel 芯片 Mac。

### 主要更新

- VPBuddy 文本消息在点击发送后立即进入对话区，并显示真实的发送中、失败和重试状态。
- 后端响应只用于确认用户消息和追加真实 VPBuddy 回复，客户端不生成伪回复。
- 投屏内容与交付物 Tab 切换后，发送文本、发送材料仍保持可用。
- 截屏与手动发送材料共用一致的进度反馈、会议材料刷新和对话记录刷新流程。
- Demo 版本名称完整展示，修复下拉菜单与相邻操作重叠。
- 交付物文档与 AI 协同内容按 Markdown 层级排版，改善长内容与窄屏显示。
- 实时转录采用增量合并与会议隔离，避免空快照、旧快照和跨会议异步回调覆盖当前记录。
- 知识库列表过滤会议材料来源和旧版 `vision_desc` 自动条目，页面计数与实际展示保持一致。
- AI 协同列表和内容详情统一使用安全 Markdown 渲染，保留标题、强调和列表层级。
- 投屏材料增加即时加载反馈，修复全屏工具操作退出和截屏 PNG 再次预览失败。
- 知识库状态列、分页和窄窗口布局重新对齐，避免文字重叠与裁切。
- Release 下载区只保留 4 个版本化安装文件，移除重复别名、更新差分文件和同平台重复压缩包。

### 数据边界

- 所有会议、聊天、材料、交付物和知识库数据均来自后端 API，本版本未引入业务 mock 数据。
- 会议转录按登录账号和会议 ID 保存到本机，刷新、同账号重新登录和客户端重启后可恢复；多设备同步、服务端恢复和权威 transcript segments 仍依赖后端持久化。

### 校验

- JavaScript 语法检查通过。
- 全部 Node 测试通过。
- 桌面安装包由 GitHub Actions 根据 `v0.1.1` tag 构建，发布前严格校验 4 个公开资产。
