# VPBuddy

VPBuddy 是一个 AI 会议协同与交付生成客户端。当前仓库包含前端界面和 Electron 桌面壳，后端服务、Hermes、ASR、知识库和 AI 能力全部通过 HTTP API 调用，不内置到客户端安装包。

## 下载安装包

当前代码版本：`v0.1.1`

更新时间：`2026-07-17 01:37 (UTC+8)`

最新已发布版本、安装包与更新说明见：[GitHub Releases](https://github.com/pilipiliwang/vpbuddy-frontend/releases/latest)

请在 Release 的 Assets 中选择 Windows 安装版、Windows 便携版、macOS Apple Silicon 或 macOS Intel 产物。当前发布流程会同时保留带版本号的产物，并上传以下稳定别名：

- `VPBuddy-Setup-latest-x64.exe`
- `VPBuddy-Portable-latest-x64.exe`
- `VPBuddy-latest-mac-arm64.dmg`
- `VPBuddy-latest-mac-x64.dmg`

## v0.1.1 更新摘要

- VPBuddy 文本发送立即显示用户消息、发送中状态和失败重试，真实回复仍完全来自后端。
- 投屏内容与交付物 Tab 共用稳定的发送入口，材料与截屏上传使用一致的进度反馈。
- 优化 Demo 版本选择、交付物 Markdown、AI 协同 Markdown、实时转录与多处窄屏排版。
- 增强异步请求的会议隔离，避免旧请求结果写入后来切换的会议。
- 会议转录按登录账号和会议 ID 保存到本机，刷新、重启客户端或同账号重新登录后可恢复；多设备同步和服务端权威记录仍以服务端持久化数据为准。
- 知识库列表只展示个人知识文档，过滤会议材料来源和旧版自动生成的 `vision_desc` 条目；会议材料仍由会议材料 API 保存与返回。
- AI 协同卡片和内容详情统一使用安全 Markdown 渲染，并适配长文本和窄窗口。
- 投屏材料增加加载状态，修复全屏工具操作退出和截屏 PNG 无法再次预览的问题。
- Release 页面改用稳定的 `releases/latest` 地址，构建流程同时发布版本化安装包与稳定别名并执行完整性校验。

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
