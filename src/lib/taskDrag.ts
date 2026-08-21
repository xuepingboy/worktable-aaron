// 任务拖拽跨日移动的纯逻辑（周视图/月视图共用，避免两处重复实现）
import type { Task } from "../types";
import { isVirtualInstance } from "./repeat";

/** 是否允许拖拽：非虚拟实例、非重复模板的普通任务（避免破坏重复规则/虚拟实例）。
 * 注意：旧数据/快速添加的任务 repeatRule 可能为 undefined，按 "none" 兜底放行。 */
export function isTaskDraggable(t: Task): boolean {
  return !isVirtualInstance(t) && (t.repeatRule ?? "none") === "none";
}

/**
 * 计算把任务拖到目标日期的更新补丁。
 * 返回 null 表示无变化（任务不存在 / 不可拖拽 / 已是目标日期）。
 * 已完成任务拖到新日期后转为未完成（否则按可见性规则不会在新日期显示）。
 */
export function buildDropPatch(tasks: Task[], id: string, targetDay: string): Partial<Task> | null {
  const t = tasks.find((x) => x.id === id);
  if (!t || !isTaskDraggable(t)) return null;
  if (t.date === targetDay) return null;
  const patch: Partial<Task> = { date: targetDay };
  if (t.status === "done") {
    patch.status = "todo";
    patch.completedAt = undefined;
  }
  return patch;
}
