# VPBuddy

VPBuddy 是一个 AI 会议协同与交付生成客户端。当前仓库包含前端界面和 Electron 桌面壳，后端服务、Hermes、ASR、知识库和 AI 能力全部通过 HTTP API 调用，不内置到客户端安装包。

## 下载安装包

当前版本：`v0.1.0`

- Windows 安装版：[VPBuddy-Setup-0.1.0-x64.exe](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.0/VPBuddy-Setup-0.1.0-x64.exe)
- Windows 便携版：[VPBuddy-Portable-0.1.0-x64.exe](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.0/VPBuddy-Portable-0.1.0-x64.exe)
- macOS Apple Silicon：[VPBuddy-0.1.0-mac-arm64.dmg](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.0/VPBuddy-0.1.0-mac-arm64.dmg)
- macOS Intel：[VPBuddy-0.1.0-mac-x64.dmg](https://github.com/pilipiliwang/vpbuddy-frontend/releases/download/v0.1.0/VPBuddy-0.1.0-mac-x64.dmg)

完整产物见：[GitHub Releases](https://github.com/pilipiliwang/vpbuddy-frontend/releases/tag/v0.1.0)

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
