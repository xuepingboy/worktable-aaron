# 桌面版构建指南（Tauri 2 · 云端编译）

本项目已预置 Tauri 2 桌面壳（`src-tauri/`），**不需要在本地安装 Rust 工具链**，
编译在云端完成（GitHub Actions 或腾讯云 Cloud Studio）。

## 一、目录结构

```
src-tauri/
├── Cargo.toml           Rust 依赖（dialog/opener/notification/autostart + updater 可选）
├── build.rs
├── tauri.conf.json      窗口/打包配置（前端产物指向 ../dist）
├── capabilities/        权限（默认 core:default，插件调用全走 Rust 命令）
├── src/
│   ├── main.rs          入口（发布版隐藏控制台）
│   └── lib.rs           Rust 命令 + 托盘 + 关闭到托盘
└── icons/               应用图标（32/128/256/ico；icns 由 CI 生成）

.github/workflows/release.yml   云端构建 Windows/macOS 安装包
src/lib/tauri.ts                 前端 Tauri 桥（isTauri + invoke，零依赖）
```

## 二、云端构建：方式 A（推荐）GitHub Actions

1. 把项目推到 GitHub 仓库（需先 `git init` + 新建远程仓库）
2. 推送版本标签触发构建：
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   或到仓库 Actions 页手动运行「构建桌面版」
3. 构建完成后，GitHub Release 附件即安装包：
   - Windows：`工作计划管理工作台_1.0.0_x64-setup.exe`（NSIS 安装包）、`.msi`
   - macOS：`.app`、`.dmg`
4. 首次运行前建议先本地跑一次：
   ```bash
   pnpm install
   pnpm tauri icon assets/icons/工作计划管理工作台.png   # 生成全套图标（含 icns）
   ```
   生成图标文件后提交到仓库，CI 会自动跳过/重新生成。

## 三、云端构建：方式 B 腾讯云 Cloud Studio（无需 git）

1. 打开腾讯云 Cloud Studio（cloudstudio.net）→ 新建工作空间（Node 环境）
2. 上传项目文件夹（或从仓库导入）
3. 终端依次执行：
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # 装 Rust
   source "$HOME/.cargo/env"
   pnpm install
   pnpm tauri icon assets/icons/工作计划管理工作台.png
   pnpm tauri build        # 产物在 src-tauri/target/release/bundle/
   ```
4. 下载安装包（Windows 在 `bundle/nsis/`，macOS 在 `bundle/macos/`）

## 四、桌面端已实现的能力

| 能力 | 说明 |
|------|------|
| 附件链接模式（P1） | 添加附件时选「本地文件」→ 只存路径不复制；双击用系统默认程序打开原文件 |
| 原生通知（P2） | 提醒引擎在桌面端走系统 Toast |
| 开机自启（P2） | 「更多 → 桌面端 → 开机自启」开关（Windows 注册表 Run） |
| 托盘（P2） | 关闭窗口最小化到托盘；左键单击/托盘菜单「打开主界面」，菜单「退出」 |
| 检查更新（P2，可选） | 「更多 → 桌面端 → 检查更新」；需先启用 updater（见下） |

## 五、启用自动更新（updater，可选）

自动更新需要发布签名密钥（Rust 代码已就绪，默认关闭）：

1. 生成密钥对（**在任意一台机器执行一次**，无需 Rust，需安装 `@tauri-apps/cli`）：
   ```bash
   pnpm dlx @tauri-apps/cli signer generate -w src-tauri/updater.key
   ```
   记下输出的 **public key**（公钥）。
2. 把公钥填入 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`，
   并配置更新地址（GitHub Releases）：
   ```json
   "plugins": { "updater": { "pubkey": "你的公钥", "endpoints": ["https://github.com/你的账号/你的仓库/releases/latest/download/latest.json"] } }
   ```
3. 开启特性：`src-tauri/Cargo.toml` 默认特性加入 `"updater"`：
   ```toml
   [features]
   default = ["updater"]
   updater = ["dep:tauri-plugin-updater"]
   ```
4. GitHub 仓库 Settings → Secrets 添加：
   - `TAURI_SIGNING_PRIVATE_KEY` = 私钥内容（`src-tauri/updater.key`）
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = 密钥口令（如空则留空）
5. `release.yml` 中取消 `TAURI_SIGNING_PRIVATE_KEY` 那行的注释。
6. 私钥文件 `src-tauri/updater.key` 已被 `.gitignore` 忽略，**不要提交到仓库**。

## 六、注意事项

- **本机无 MSVC 构建工具时无法本地编译 Rust**：cargo/rustc 装了但缺 `link.exe`（VS Build Tools）会报
  `linking with link.exe failed`。这是环境问题而非代码问题——**GitHub Actions 的 windows-latest 自带 MSVC**，
  云端构建不受影响。本地拉依赖很慢可配国内镜像（本项目已用 `.cargo-home/config.toml` 指向中科大 USTC，
  该文件被 gitignore，不影响 CI）。
- **每次 push 自动检查**：`.github/workflows/check.yml` 会跑 tsc + vitest + `cargo check`，
  推代码即可看到 Rust 编译结果，不必等打 tag。
- **关闭窗口 = 最小化到托盘**：退出请用托盘菜单「退出」（或系统托盘右键）。
- **链接附件**：只在本机有效；原文件被移动/删除/拔盘后打开会提示「文件不存在」。
  导出 Excel/JSON 备份不包含链接文件本体。
- **Web 版不受影响**：浏览器/绿色版仍走 IndexedDB 复制模式，桌面端才有链接模式。
- **productName 为中文**：Windows/macOS 打包正常；如 Linux 打包遇到命名问题，
  可把 `tauri.conf.json` 的 `productName` 改为 ASCII（如 `PlannerWorkbench`），
  窗口标题（中文）不受影响。
