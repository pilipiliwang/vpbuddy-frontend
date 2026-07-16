# VPBuddy

VPBuddy 是一个 AI 会议协同与交付生成客户端。当前仓库包含前端界面和 Electron 桌面壳，后端服务、Hermes、ASR、知识库和 AI 能力全部通过 HTTP API 调用，不内置到客户端安装包。

## 下载安装包

当前版本：`v0.1.1`

更新时间：`2026-07-16 22:55 (UTC+8)`

- Windows 安装版：[VPBuddy-Setup-0.1.1-x64.exe](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.1/VPBuddy-Setup-0.1.1-x64.exe)
- Windows 便携版：[VPBuddy-Portable-0.1.1-x64.exe](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.1/VPBuddy-Portable-0.1.1-x64.exe)
- macOS Apple Silicon：[VPBuddy-0.1.1-mac-arm64.dmg](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.1/VPBuddy-0.1.1-mac-arm64.dmg)
- macOS Intel：[VPBuddy-0.1.1-mac-x64.dmg](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.1/VPBuddy-0.1.1-mac-x64.dmg)

完整产物与更新说明见：[GitHub Releases](https://github.com/pilipiliwang/vpbuddy-frontend/releases/tag/v0.1.1)

## v0.1.1 更新摘要

- VPBuddy 文本发送立即显示用户消息、发送中状态和失败重试，真实回复仍完全来自后端。
- 投屏内容与交付物 Tab 共用稳定的发送入口，材料与截屏上传使用一致的进度反馈。
- 优化 Demo 版本选择、交付物 Markdown、AI 协同 Markdown、实时转录与多处窄屏排版。
- 增强异步请求的会议隔离，避免旧请求结果写入后来切换的会议。
- 会议转录按登录账号和会议 ID 保存到本机，刷新、重启客户端或同账号重新登录后可恢复；多设备同步和服务端权威记录仍以服务端持久化数据为准。

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
