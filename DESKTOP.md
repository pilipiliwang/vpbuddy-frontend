# VPBuddy Desktop

当前桌面壳使用 Electron 封装现有前端页面，目标是让用户双击 `VPBuddy.exe` 使用。

## 开发运行

```bash
npm run desktop
```

默认后端地址：

```text
http://127.0.0.1:8765
```

如需连接远程后端，可以启动前设置环境变量：

```powershell
$env:VPBUDDY_API_BASE_URL="https://your-vpbuddy-api.example.com"
npm run desktop
```

## 打包 Windows 客户端

```bash
npm run desktop:build
```

产物目录：

```text
release/
```

会生成 Windows 安装包和便携版。后端、Hermes、ASR、知识库仍部署在服务器，桌面客户端只负责界面、本地文件选择、截屏、录音入口和 API 调用。

## 实现说明

- `desktop/main.cjs`：Electron 主进程，启动本地静态服务器并打开 VPBuddy 页面。
- `desktop-config.js`：浏览器/桌面共用的默认后端地址配置。
- `package.json`：包含 `desktop`、`desktop:dir`、`desktop:build` 脚本。
