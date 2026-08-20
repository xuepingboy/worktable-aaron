# 工作计划管理工作台 — 桌面端打包发布流程

本文档说明如何将本项目推送到 GitHub，并通过 GitHub Actions 自动打包生成 Windows 桌面安装包（NSIS）。

## 一、推送前准备

### 1. 确认版本号一致
打包版本号以 `src-tauri/tauri.conf.json` 的 `version` 为准，需与 `src-tauri/Cargo.toml` 保持一致。

```bash
# 查看当前版本
cat src-tauri/tauri.conf.json | grep version
cat src-tauri/Cargo.toml | grep version
```

> 注意：`tauri-action` 会用 `tauri.conf.json` 的版本号生成安装包文件名和 release 标题。

### 2. 确认工作流文件存在
`.github/workflows/release.yml` 已配置好，触发方式：
- 推送 `v*` 标签（如 `v1.1.4`）
- 手动触发（GitHub Actions 页面点 `Run workflow`）

### 3. 本地验证（可选但推荐）
推送前先在本地跑一遍，确保能通过：
```bash
pnpm install
pnpm build        # 严格验证：tsc --noEmit 类型检查 + vite build 编译
cd src-tauri && cargo check   # Rust 代码检查
```

> 说明：`build` 脚本已配置为 `tsc --noEmit && vite build`，会先做完整 TypeScript 类型检查再编译，类型错误会提前暴露。

## 二、关联远程仓库并推送

### 1. 关联 GitHub 远程仓库
```bash
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
```

### 2. 推送代码
```bash
git add .
git commit -m "feat: 更新桌面端打包配置"
git push -u origin main
```

### 3. 打标签触发打包
```bash
git tag v1.1.4
git push origin v1.1.4
```

> 推送标签后，GitHub Actions 会自动开始打包。

### 4. 一键发布脚本（Windows）
项目根目录提供 `release.bat`，在 Windows 上双击或命令行运行即可自动完成：安装依赖 → 前端构建验证 → cargo check → 提交代码 → 打标签 → 推送代码和标签。

```bat
release.bat
```

脚本会自动从 `src-tauri/tauri.conf.json` 读取版本号，生成 `vX.Y.Z` 标签，并提示确认后执行。运行前需确保已安装 Git 和 pnpm，且已配置 `origin` 远程仓库。

**版本号自动递增**：发布成功后，脚本会自动将 patch 版本号 +1（如 `1.1.4` → `1.1.5`），并同步更新 `src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 两个文件，最后提示你提交这次版本号变更。这样下次发布时无需手动改版本号。

## 三、查看打包进度

1. 打开 GitHub 仓库 → **Actions** 标签页
2. 找到正在运行的 `Release Tauri Desktop` 工作流
3. 点击进入可查看每个步骤的日志：
   - `Install frontend dependencies` — 安装前端依赖
   - `Cargo check (verify Rust code)` — 验证 Rust 代码
   - `Build frontend (verify TypeScript)` — 验证前端编译
   - `Build and release Tauri app` — 完整打包并创建 release

## 四、下载安装包

1. 打包成功后，GitHub 会自动创建一个 **Draft（草稿）Release**
2. 进入仓库 **Releases** 页面，找到草稿 release
3. 点击 **Edit** 完善发布说明，然后点 **Publish release** 正式发布
4. 安装包为 `.exe` 文件（NSIS 安装程序），在 release 的 Assets 中下载

## 五、注意事项

### 版本号一致性
- 每次发版前，确保 `tauri.conf.json` 和 `Cargo.toml` 版本号一致
- 标签版本号建议与配置版本号一致（如都设为 `v1.1.4`）

### 草稿 Release
- 工作流默认生成 **草稿** release，不会自动公开
- 需要手动编辑并发布，避免误发不完整版本

### Windows 代码签名
- 当前未配置代码签名，Windows 会提示"未知发布者"
- 如需消除提示，需购买代码签名证书并配置到工作流（`TAURI_SIGNING_PRIVATE_KEY` 等）

### 首次打包较慢
- 首次运行需下载 Rust 工具链和编译全部依赖，可能耗时 10-20 分钟
- 后续打包会命中 `swatinem/rust-cache` 缓存，明显加快

### 沙箱限制
- 沙箱环境无 cargo/rustc，无法本地编译 Tauri
- 沙箱无 GitHub 凭据，无法直接推送，需在本地执行 git 命令

### 常见失败排查
| 现象 | 原因 | 处理 |
|------|------|------|
| `cargo check` 失败 | Rust 代码编译错误 | 查看日志定位，修复后重新推送 |
| `pnpm build` 失败 | 前端 TS 类型错误或编译错误 | 查看日志定位，修复后重新推送 |
| 打包失败但验证通过 | 缺少 Windows 构建依赖 | 查看 `tauri-action` 日志 |
| release 未生成 | 标签未推送或工作流未触发 | 确认 `git push origin v*` 成功 |

## 六、本地提交自动检查（pre-commit 钩子）

项目已配置 `husky` + `lint-staged`，在本地 `git commit` 时会自动对暂存的 `*.{ts,tsx}` 文件执行 `tsc --noEmit` 类型检查：

- **有类型错误** → 提交被阻止，需修复后重新 `git add` + `git commit`
- **无类型错误** → 正常提交

> 注意：首次在本地提交前需确保依赖已安装（`pnpm install`），否则钩子无法运行。若想临时跳过钩子，可用 `git commit --no-verify`（不推荐）。

## 七、完整流程速览

```
本地修改代码
  → git commit（自动触发 pre-commit 钩子：tsc --noEmit 类型检查）
  → 本地验证 (pnpm build + cargo check)
  → git push 代码
  → git tag vX.Y.Z + push tag
  → GitHub Actions 自动打包（cargo check → pnpm build → tauri-action）
  → 生成草稿 Release
  → 编辑并发布 Release
  → 用户下载 .exe 安装包
```