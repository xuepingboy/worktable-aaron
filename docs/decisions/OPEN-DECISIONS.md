# OPEN-DECISIONS 悬而未决登记册

> 专家团规范：只追加 + 就地关闭（OPEN → RESOLVED，补 Resolution 字段）。
> 每次 Phase 开始复现未决项到工作上下文最前面。

## 未决项

| Date | Source | Open Item | Related Constraints | Current Leaning | Blocked By | Resolves When | Status |
|------|--------|-----------|---------------------|-----------------|------------|---------------|--------|
| 2026-08-20 | QA A3 | 挂件尺寸恢复只保底不封顶（width.max(260) 无上限），外接大屏拖大后回小屏可能超出工作区 | widget-pos.txt 存绝对尺寸；minWidth 260/minHeight 320 | 按 current_monitor 工作区封顶 | 需评估多显示器场景 | 下一迭代 | OPEN |
| 2026-08-20 | QA A4 | 800ms 节流尾事件丢失：拖动/缩放停止后 <800ms 的最后一次 Moved/Resized 未落盘，重启恢复有偏差 | 既有 Moved 行为，本次扩展至尺寸 | 尾事件强制写（节流过期后补写一次） | 需评估写盘频率影响 | 下一迭代 | OPEN |
| 2026-08-20 | QA A5 | 10s 兜底线程与用户主动关闭冲突：启动后 10s 内用户显示又隐藏主窗口，兜底线程可能强制弹出 | 兜底 is_visible()==false 即 show | 记录「用户已主动操作过」标志，兜底前检查 | 低概率 P2 | 有反馈再处理 | OPEN |
| 2026-08-20 | QA A6 | 150ms 防抖保存丢尾：改设置后 150ms 内退出应用，最后一次改动不落盘 | 原同步写改为防抖异步 | beforeunload 兜底写盘 | 需评估退出路径 | 下一迭代 | OPEN |
| 2026-08-20 | QA A7 | main.tsx 动态 import tauri.ts 不会拆 chunk（已被静态引用），build 有 warning 无 error | 无功能影响 | 忽略 | - | 不处理 | OPEN |
| 2026-08-20 | QA A8 | save_widget_settings 直接 fs::write 非原子，中断可能损坏 JSON | load 时 JSON.parse 失败兜底 DEFAULT | 写临时文件+rename（原子替换） | 低风险 | 下一迭代 | OPEN |
| 2026-08-20 | 架构师 A2 | 环境级 AppData 清空来源未定位：%LOCALAPPDATA%/%APPDATA%\com.planner.workbench 两次启动间被清空 | 仓库内无删除代码（已 grep） | 测试工作流清数据/卸载重装/环境重置 | 待用户排查 | 用户确认后 | OPEN |

## 已决项（RESOLVED）

| Date | Source | Item | Resolution |
|------|--------|------|------------|
| 2026-08-20 | QA A1 | 升级迁移：v1.1.5→v1.1.6 旧 localStorage 设置丢失 | 已修复：load 空时读 localStorage→写 Rust 文件→removeItem（commit cda0593） |
| 2026-08-20 | QA A2 | 贴桌面重启后首次显示不生效 | 已修复：toggle_widget 显示时按已存 stick 应用置顶/贴桌面（commit cda0593） |
