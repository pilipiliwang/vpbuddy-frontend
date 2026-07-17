# VPBuddy Releases

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
