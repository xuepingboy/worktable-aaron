// 提醒引擎（对应详细设计 §10）
// 每 60s 扫描临近截止且未完成任务；lastNotifiedAt 去重
import type { Task } from "../types";
import { isTauri, sendNativeNotification } from "./tauri";

/**
 * 扫描应提醒的任务。
 * 条件：未完成 && reminderOffset != null && deadline && 0 < deadline - now <= reminderOffset
 * 去重：命中后写入 task.lastNotifiedAt，同一任务在窗口期内不重复提醒。
 */
export function scanReminders(
  tasks: Task[],
  now = Date.now()
): { hits: Task[]; updated: Task[] } {
  const hits: Task[] = [];
  const updated: Task[] = [];

  for (const task of tasks) {
    if (task.status === "done") continue;
    if (task.reminderOffset == null) continue;
    if (!task.deadline) continue;

    const deadlineTs = new Date(task.deadline).getTime();
    const diff = deadlineTs - now;
    const inWindow = diff > 0 && diff <= task.reminderOffset * 60 * 1000;
    if (!inWindow) continue;

    // 去重：若已提醒过且仍在窗口内，跳过
    if (task.lastNotifiedAt && now - task.lastNotifiedAt < task.reminderOffset * 60 * 1000) {
      continue;
    }

    hits.push(task);
    updated.push({ ...task, lastNotifiedAt: now });
  }

  return { hits, updated };
}

/** 请求通知权限（在创建/编辑带提醒任务时调用，非首载） */
export async function requestNotificationPermission(): Promise<boolean> {
  // 桌面端（Tauri）走系统原生通知，无需浏览器权限
  if (isTauri) return true;
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/** 发送系统通知，失败降级为应用内 Toast（由调用方处理） */
export function notify(title: string, body: string): boolean {
  // 桌面端：调用 Rust 命令发送原生通知（失败静默，ReminderCenter 会降级 Toast）
  if (isTauri) {
    void sendNativeNotification(title, body);
    return true;
  }
  if (!("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  try {
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}