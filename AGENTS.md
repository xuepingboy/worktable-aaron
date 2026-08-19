# AGENTS.md

## Dependencies
- `zustand`：全局状态管理（plannerStore），分 key 持久化 + 防抖写入
- `idb-keyval`：附件 Blob 存储（IndexedDB），避免 localStorage 体积限制
- `xlsx` (SheetJS)：任务明细导出 Excel
- `date-fns`：日期周期计算（本地时区安全）
- `vitest`：单元测试（`pnpm test`，2026-08-18 引入；测试文件 `src/**/*.test.ts`，配置 `vitest.config.ts` 对齐 @ 别名）

## Architecture
- 数据模型：`src/types.ts`（Task/Goal/SubTask/Attachment），含 `overrideDate`、`lastNotifiedAt`、`endDate`（截止日期）、`completedAt`（完成时间戳）字段；`SubTask` 含 `completedAt`（子任务完成时间戳）
- 日期范围任务：`src/lib/date.ts` 的 `taskVisibleOnDate` 统一可见性——未完成+有 endDate 在 [date,endDate] 显示；已完成只在完成当天显示；逾期继续显示。各视图/组件（today/week/month/SidePanel/ProgressSection）一律经此函数过滤，禁止再用 `t.date === x` 直判；**周/月范围过滤用 `taskOverlapsRange`（区间交集），禁止 `t.date >= start && t.date <= end` 直判**（跨周/跨月范围任务会漏）；视图排序用 `sortTasksForView`（顺延置顶 + order）
- 虚拟实例编辑：`src/lib/repeat.ts` 的 `resolveEditTarget(task, tasks)` 统一四视图「虚拟实例 → 模板任务」定位，禁止各视图重复实现
- 持久化：`src/lib/storage.ts`，分 key 存储 + schemaVersion 迁移 + 附件 IndexedDB；`memos`（`Record<YYYY-MM-DD, string>`）按日期存每日备忘便签，store 经 `setMemo(date, text)` 写入
- 重复任务：`src/lib/repeat.ts`，「模板落库 + 查询时展开」模型，`overrideDate` 记录单次改期；`RepeatRule` 6 种（none/daily/weekly/monthly/yearly/custom）+ `repeatConfig`（RepeatConfig）承载详细规则（工作日/星期几/每月第N日或第N个星期几/每年月日/自定义间隔/按日期结束 endDate）；`expandDates` 逐日扫描 + `matchesRule` 匹配，兼容旧数据（无 config 按旧逻辑展开）；`expandRecurringTasks` 合并 `recurringInstances` 实例独立状态
- 重复任务「仅本次修改」：独立实体方案——`createOverrideTask` 复制模板为独立覆盖任务（`isRecurringOverride`+`overrideDate`+`overrideTemplateId`，`repeatRule:"none"`），`expandRecurringTasks` 用 `overridesByTemplate` Map 跳过已覆盖日期的虚拟实例；`taskVisibleOnDate` 对覆盖任务正常显示
- 自然语言快速添加：`src/lib/quickAdd.ts` 的 `parseQuickAdd(input, baseDate)` 解析日期/时间/优先级/标签，今日视图顶部快速添加框接入
- 智能清单筛选：`FilterState.dateRange`（all/today/week/month），明细视图筛选栏 Select 接入，`filterTasks` 支持日期范围过滤
- 明细视图（`_layout.tasks.tsx`）：重复任务**分组折叠**——普通任务逐行、重复任务折叠为一行（显示规则摘要 + 展开箭头），点击展开显示未来 90 天实例（`expandRecurringTasks([tpl], today, today+90)`）；禁止用宽区间（如 1900-2100）展开全部实例，否则重复任务平铺成几十上百行
- 提醒引擎：`src/lib/reminder.ts`，每 60s 扫描 + `lastNotifiedAt` 去重；Tauri 下 `notify` 走 `src/lib/tauri.ts` 的 `sendNativeNotification`（原生通知），Web 走浏览器 Notification
- Tauri 桥（2026-08-19）：`src/lib/tauri.ts` 是唯一入口——`isTauri` 检测 + `invoke`（走 `window.__TAURI_INTERNALS__`，**禁止引入 @tauri-apps/api**）；新增 Rust 命令（`src-tauri/src/lib.rs`）后必须在此同步封装；桌面端附件链接模式：`Attachment.mode==="link"` 只存 `path`（size=-1），打开统一走 `src/lib/attachment.ts` 的 `openAttachment/openAttachments`（链接→系统打开，blob→IndexedDB 下载）
- 路由：TanStack Router，`_layout` 共享壳 + today/week/month/tasks 四视图
- 全局任务表单：plannerStore 持有 `taskFormOpen/taskFormDate/openTaskForm/closeTaskForm`，各页面接入
- 优先级样式统一：`src/lib/utils.ts` 导出 `PRIORITY_TEXT`（文字色）/`PRIORITY_DOT`（圆点色），各视图（TaskCard/SidePanel/tasks/month）一律引用，禁止本地重复定义
- 主题持久化：`AppShell.tsx` 用 `localStorage` key `planner-theme`（"light"/"dark"），初始化读取 + 切换写入
- 全局快捷键：`AppShell.tsx` 监听 keydown——`N` 新增任务、`1-4` 切换今日/周/月/明细视图（INPUT/TEXTAREA 聚焦时忽略）

## What Didn't Work
- ❌ Write 工具长 content 时参数序列化丢失 `file_path` → 改用「file_path 放第一个参数 + 控制 content 长度 + 大文件短骨架 Write 后 Edit 追加」

## Lessons
- 周看板拖拽用浏览器原生 HTML5 拖放 API，四件套（draggable/onDragStart/onDragOver+preventDefault/onDrop）缺一不可，禁止与 pointer 方案混用
- 日期比较必须用 date-fns 本地时区安全 API，避免 `new Date("YYYY-MM-DD")` 的 UTC 偏移问题
- 周视图布局：采用参考图「顶部统计 + 本周目标/重点事项 + 纵向每日任务列表」结构（`_layout.week.tsx`），每行宽度足够，任务名用 `break-words` 完整显示；禁止 7 列并排看板（`grid-cols-7` 会让列过窄、任务名被迫 6 字换行或截断）
- 每月同日展开（`repeat.expandDates` 无 config 分支）：保持 base 目标日，超限（31 号遇 2 月）取月末，避免 addMonths 漂移（2026-08-18 修复，vitest 覆盖）
- 改动核心 lib（date/repeat/quickAdd/export）后必须 `pnpm test` 回归；`vite build` 不做类型检查，另跑 `pnpm run typecheck`