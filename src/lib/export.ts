// 导入导出（对应详细设计 §9）
// Excel / JSON(带版本) / AI 素材 Markdown
import * as XLSX from "xlsx";
import type { Goal, StorageSchema, Task } from "../types";
import { PRIORITY_LABEL, STATUS_LABEL } from "../types";
import { friendlyDate } from "./date";

/** 导出时间范围选项 */
export type ExportRange = "all" | "month" | "week" | "custom";

export interface ExportOptions {
  range: ExportRange;
  start?: string; // YYYY-MM-DD（custom 时必填）
  end?: string; // YYYY-MM-DD（custom 时必填）
}

/** 按时间范围过滤任务（含起止，闭区间） */
export function filterTasksByRange(tasks: Task[], opts: ExportOptions): Task[] {
  if (opts.range === "all") return tasks;
  // 非 all 范围：start/end 缺一即视为不过滤（custom 时调用方保证传入）
  const start = opts.start;
  const end = opts.end;
  if (!start || !end) return tasks;
  return tasks.filter((t) => t.date >= start && t.date <= end);
}

/** 生成 AI 素材 Markdown（月度总结用，含每日笔记） */
export function buildAiMarkdown(
  tasks: Task[],
  goals: Goal[],
  monthLabel: string,
  memos: Record<string, string> = {}
): string {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const overdue = tasks.filter(
    (t) => t.status !== "done" && t.deadline && new Date(t.deadline).getTime() < Date.now()
  ).length;
  const rate = total ? Math.round((done / total) * 100) : 0;
  const high = tasks.filter((t) => t.priority === "high").length;
  const medium = tasks.filter((t) => t.priority === "medium").length;
  const low = tasks.filter((t) => t.priority === "low").length;

  const lines: string[] = [];
  lines.push(`# 工作任务月报素材（${monthLabel}）`);
  lines.push("## 统计");
  lines.push(`- 总任务: ${total} ｜ 已完成: ${done} ｜ 逾期: ${overdue} ｜ 完成率: ${rate}%`);
  lines.push(`- 优先级分布: 高 ${high} / 中 ${medium} / 低 ${low}`);
  lines.push("");
  lines.push("## 任务清单");
  tasks.forEach((t, i) => {
    const status = STATUS_LABEL[t.status];
    const prio = PRIORITY_LABEL[t.priority];
    const tagStr = t.tags.length ? ` — 标签: ${t.tags.map((x) => `#${x}`).join(" ")}` : "";
    const sub = t.subtasks.length
      ? `\n   - 子任务: ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}`
      : "";
    lines.push(`${i + 1}. [${friendlyDate(t.date)}][${prio}][${status}] ${t.title}${tagStr}${sub}`);
  });
  lines.push("");
  lines.push("## 本周/月目标");
  goals.forEach((g) => lines.push(`- ${g.title}`));
  lines.push("");
  const memoEntries = Object.entries(memos).filter(([, text]) => text.trim());
  if (memoEntries.length > 0) {
    lines.push("## 每日笔记");
    memoEntries.forEach(([date, text]) => lines.push(`- ${date}: ${text}`));
    lines.push("");
  }
  lines.push("---");
  lines.push(`以下是上述 ${monthLabel} 工作任务数据，请生成月度总结（完成情况、亮点、风险、下月建议）：`);
  return lines.join("\n");
}

/** 导出 JSON 备份（含 schemaVersion + 每日笔记） */
export function buildJsonBackup(
  schema: StorageSchema,
  memos: Record<string, string> = {}
): string {
  return JSON.stringify({ ...schema, memos }, null, 2);
}

/** 触发浏览器下载文本文件 */
export function downloadTextFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 导出 Excel（任务明细 + 每日笔记） */
export function buildExcel(tasks: Task[], memos: Record<string, string> = {}): void {
  const rows = tasks.map((t) => ({
    标题: t.title,
    日期: t.date,
    时间: t.time ?? "",
    优先级: PRIORITY_LABEL[t.priority],
    状态: STATUS_LABEL[t.status],
    截止: t.deadline ? new Date(t.deadline).toLocaleString() : "",
    标签: t.tags.join(", "),
    子任务: `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}`,
    描述: t.description ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "任务");

  // 每日笔记 sheet
  const memoRows = Object.entries(memos)
    .filter(([, text]) => text.trim())
    .map(([date, text]) => ({ 日期: date, 笔记: text }));
  if (memoRows.length > 0) {
    const wsMemo = XLSX.utils.json_to_sheet(memoRows);
    XLSX.utils.book_append_sheet(wb, wsMemo, "每日笔记");
  }

  XLSX.writeFile(wb, `tasks-${Date.now()}.xlsx`);
}

/** 解析导入的 JSON 备份 */
export function parseJsonBackup(json: string): StorageSchema | null {
  try {
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.tasks)) return null;
    // 逐条校验任务结构，过滤掉缺关键字段的脏数据，避免导入后渲染崩溃
    const tasks = (data.tasks as Task[]).filter(
      (t) => t && typeof t.id === "string" && typeof t.title === "string" && typeof t.date === "string"
    );
    return {
      schemaVersion: data.schemaVersion ?? 1,
      tasks,
      goals: Array.isArray(data.goals) ? (data.goals as Goal[]) : [],
      memos: data.memos && typeof data.memos === "object" ? (data.memos as Record<string, string>) : {},
    };
  } catch {
    return null;
  }
}