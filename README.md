# VPBuddy

VPBuddy 是一个 AI 会议协同与交付生成客户端。当前仓库包含前端界面和 Electron 桌面壳，后端服务、Hermes、ASR、知识库和 AI 能力全部通过 HTTP API 调用，不内置到客户端安装包。

## 下载安装包

当前代码版本：`v0.1.4`

发布日期（北京时间）：`2026-07-21`

最新已发布版本、安装包与更新说明见：[GitHub Releases](https://github.com/pilipiliwang/vpbuddy-frontend/releases/latest)

### Windows

- [Windows 安装版（x64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.4/VPBuddy-Setup-0.1.4-x64.exe)：标准安装程序，可创建桌面和开始菜单快捷方式。
- [Windows 便携版（x64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.4/VPBuddy-Portable-0.1.4-x64.exe)：无需安装，直接运行。

### macOS

- [macOS Apple Silicon 版（arm64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.4/VPBuddy-0.1.4-mac-arm64.dmg)：适用于 Apple M 系列芯片，要求 macOS 12 或更高版本。
- [macOS Intel 版（x64）](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.4/VPBuddy-0.1.4-mac-x64.dmg)：适用于 Intel 芯片 Mac，要求 macOS 12 或更高版本。

每个正式版本只上传上述 4 个带版本号的用户安装文件。GitHub 另行自动提供源码 zip 和 tar.gz。

## v0.1.4 更新摘要

- 修复退出登录后，旧会话请求继续触发登录页重绘，导致邮箱和密码输入被清空或无法连续输入的问题。
- 登录草稿仅保存在当前页面内存中，正常重绘不会丢失；登录成功或退出会话后立即清除密码草稿。
- macOS 公开包改为 Developer ID 签名、Hardened Runtime 与 Apple 公证，并在发布前执行签名、Gatekeeper 和公证票据校验。
- macOS 安装包明确区分 Apple Silicon 与 Intel 架构；Electron 43 客户端最低支持 macOS 12。
- Release 继续只公开 Windows 安装版、Windows 便携版和两种 macOS DMG，共 4 个版本化安装文件。

## v0.1.1 更新摘要

- VPBuddy 文本发送立即显示用户消息、发送中状态和失败重试，真实回复仍完全来自后端。
- 投屏内容与交付物 Tab 共用稳定的发送入口，材料与截屏上传使用一致的进度反馈。
- 优化 Demo 版本选择、交付物 Markdown、AI 协同 Markdown、实时转录与多处窄屏排版。
- 增强异步请求的会议隔离，避免旧请求结果写入后来切换的会议。
- 会议转录按登录账号和会议 ID 保存到本机，刷新、重启客户端或同账号重新登录后可恢复；多设备同步和服务端权威记录仍以服务端持久化数据为准。
- 知识库列表只展示个人知识文档，过滤会议材料来源和旧版自动生成的 `vision_desc` 条目；会议材料仍由会议材料 API 保存与返回。
- AI 协同卡片和内容详情统一使用安全 Markdown 渲染，并适配长文本和窄窗口。
- 投屏材料增加加载状态，修复全屏工具操作退出和截屏 PNG 无法再次预览的问题。
- Release 下载区收敛为 4 个版本化安装文件，并通过完整性契约阻止 latest 别名、`.blockmap` 和重复的 macOS zip 进入公开附件。

## 发布约定

- Release 正文按 `## v版本号 · 北京时间发布日期` 归类，并在版本标题下用 `### Windows`、`### macOS` 提供下载链接和架构说明。
- CI 只构建 Windows Setup/Portable 与 macOS arm64/x64 DMG，并关闭差分更新文件；随后将这 4 个文件放入独立白名单目录，再逐项上传到 GitHub Release。GitHub 自动生成的源码归档不计入这 4 个文件。
- 当前客户端没有自动更新功能，不依赖 `.blockmap`、latest 更新元数据或 macOS zip。将来引入自动更新前，需要先调整发布资产契约。

## 后端 API

默认 API 地址：

```text
http://47.100.182.3:28765
```

桌面客户端只加载本地 UI。会议、材料、知识库、AI 反问、解释材料、交付物等能力均通过后端 API 获取或提交。

## 本地开发

```bash
npm install
npm run dev
```

桌面壳开发：

```bash
npm run desktop
```

## 打包

Windows：

```bash
npm run desktop:build:win
```

macOS 需要在 macOS runner 或 macOS 设备上构建：

```bash
npm run desktop:build:mac
```

GitHub Actions 会自动生成 Windows 和 macOS 安装包。

正式 macOS Release 必须在仓库 Actions secrets 中配置 `MAC_CSC_LINK`、`MAC_CSC_KEY_PASSWORD`、`APPLE_API_KEY_BASE64`、`APPLE_API_KEY_ID` 和 `APPLE_API_ISSUER`。其中 `APPLE_API_KEY_BASE64` 是 App Store Connect API Key `.p8` 文件的 Base64 内容；CI 会把它还原为临时文件供公证使用。缺少任一凭证时构建会明确失败，避免再次发布无法通过 Gatekeeper 的未签名安装包。
