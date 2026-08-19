// 日期周期工具（对应详细设计 §5.2 时区约束）
// 所有日期比较统一走 date-fns + 本地时区，禁止直接 new Date('YYYY-MM-DD')
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";
import type { Task } from "../types";

export const DATE_FMT = "yyyy-MM-dd";
export const MONTH_FMT = "yyyy-MM";

/** 本地时区安全解析 YYYY-MM-DD → Date */
export function parseDate(dateStr: string): Date {
  return parseISO(dateStr);
}

/** Date → YYYY-MM-DD（本地时区） */
export function toDateStr(date: Date): string {
  return format(date, DATE_FMT);
}

/** 今天 YYYY-MM-DD */
export function todayStr(): string {
  return toDateStr(new Date());
}

/** 今天 23:59:59 的毫秒时间戳 */
export function todayEndTs(): number {
  return endOfDay(new Date()).getTime();
}

/** 本周周一 YYYY-MM-DD */
export function weekStartStr(date = new Date()): string {
  return toDateStr(startOfWeek(date, { weekStartsOn: 1 }));
}

/** 本周周日 YYYY-MM-DD */
export function weekEndStr(date = new Date()): string {
  return toDateStr(endOfWeek(date, { weekStartsOn: 1 }));
}

/** 本月 YYYY-MM */
export function monthStr(date = new Date()): string {
  return format(date, MONTH_FMT);
}

/** 某周周一的 Date */
export function weekStartDate(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/** 某周 7 天的 YYYY-MM-DD 数组（周一 → 周日） */
export function weekDays(date: Date): string[] {
  const start = weekStartDate(date);
  return Array.from({ length: 7 }, (_, i) => toDateStr(addDays(start, i)));
}

/** 某月所有天的 YYYY-MM-DD 数组 */
export function monthDays(date: Date): string[] {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const days: string[] = [];
  let cur = start;
  while (cur <= end) {
    days.push(toDateStr(cur));
    cur = addDays(cur, 1);
  }
  return days;
}

/** 某月日历网格（含前后月补位，周一开头），返回 { dateStr, inMonth } */
export function monthGrid(date: Date): { dateStr: string; inMonth: boolean }[] {
  const first = startOfMonth(date);
  const gridStart = startOfWeek(first, { weekStartsOn: 1 });
  const cells: { dateStr: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    cells.push({ dateStr: toDateStr(d), inMonth: isSameMonth(d, date) });
  }
  return cells;
}

export function isSameDayStr(a: string, b: string): boolean {
  return isSameDay(parseDate(a), parseDate(b));
}

/** 周偏移：返回以 base 为基准偏移 n 周的周一 */
export function shiftWeek(base: Date, n: number): Date {
  return addWeeks(weekStartDate(base), n);
}

/** 月偏移 */
export function shiftMonth(base: Date, n: number): Date {
  return addMonths(startOfMonth(base), n);
}

/** 日期显示：今天/昨天/明天/MM-dd */
export function friendlyDate(dateStr: string): string {
  const d = parseDate(dateStr);
  const today = new Date();
  if (isSameDay(d, today)) return "今天";
  if (isSameDay(d, subDays(today, 1))) return "昨天";
  if (isSameDay(d, addDays(today, 1))) return "明天";
  return format(d, "MM-dd");
}

/** 逾期判定：deadline < 当天 23:59:59 且未完成 */
export function isOverdue(task: { deadline?: string; status: string }): boolean {
  if (!task.deadline || task.status === "done") return false;
  return parseDate(task.deadline).getTime() < todayEndTs();
}

/** 临近判定：0 < deadline - now <= 24h 且未完成 */
export function isDueSoon(task: { deadline?: string; status: string }): boolean {
  if (!task.deadline || task.status === "done") return false;
  const diff = parseDate(task.deadline).getTime() - Date.now();
  return diff > 0 && diff <= 24 * 60 * 60 * 1000;
}

/** 任务默认 deadline：未填取 endDate 当天 23:59:59（无 endDate 则取 date 当天） */
export function defaultDeadline(dateStr: string, endDate?: string): string {
  return endOfDay(parseDate(endDate ?? dateStr)).toISOString();
}

/** 是否为顺延任务：未完成 + 无截止日期 + 计划日期早于今天（被顺延到今天显示） */
export function isCarriedOver(task: Task, date: string): boolean {
  if (task.status === "done" || task.endDate) return false;
  return task.date < date;
}

/** 任务是否与 [rangeStart, rangeEnd] 日期区间有交集（范围任务按 endDate 判断；YYYY-MM-DD 字符串可字典序比较） */
export function taskOverlapsRange(task: Task, rangeStart: string, rangeEnd: string): boolean {
  const start = task.date;
  const end = task.endDate ?? task.date;
  return start <= rangeEnd && end >= rangeStart;
}

/** 任务在指定日期是否显示（范围任务 + 完成即止逻辑） */
export function taskVisibleOnDate(task: Task, date: string): boolean {
  // 覆盖任务（仅本次修改）作为独立实体正常显示
  if (task.isRecurringOverride) {
    if (task.status === "done") {
      if (!task.completedAt) return false;
      return toDateStr(new Date(task.completedAt)) === date;
    }
    if (task.endDate) {
      return task.date <= date && date <= task.endDate;
    }
    return task.date === date;
  }
  // 已完成：只在完成当天显示
  if (task.status === "done") {
    if (!task.completedAt) return false;
    return toDateStr(new Date(task.completedAt)) === date;
  }
  // 未完成 + 有截止日期：在 [date, endDate] 范围显示
  if (task.endDate) {
    return task.date <= date && date <= task.endDate;
  }
  // 未完成 + 无截止日期：单日任务，未完成自动顺延到今天
  if (task.date === date) return true;
  // 顺延：未完成的单日任务，若日期已过且查询的是今天，则显示在今天
  if (date === todayStr() && task.date < date) return true;
  return false;
}

/** 视图排序：顺延任务置顶，其余按 order 排序（today/week 共用） */
export function sortTasksForView(tasks: Task[], date: string): Task[] {
  return [...tasks].sort((a, b) => {
    const aOver = isCarriedOver(a, date) ? 0 : 1;
    const bOver = isCarriedOver(b, date) ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    return a.order - b.order;
  });
}