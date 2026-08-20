// 重复任务展开逻辑（对应详细设计 §5.3）
// 模板落库 + 查询时展开虚拟实例；isRecurringOverride 必须与 overrideDate 成对
import { addDays, addMonths, addWeeks, addYears, getDay, getMonth, getDate, isAfter, isBefore } from "date-fns";
import type { RecurringInstanceState, RepeatConfig, RepeatRule, Task } from "../types";
import { parseDate, toDateStr } from "./date";
import { generateId } from "./utils";

/** 判断某日期是否命中重复规则（含旧数据兼容：无 config 时按旧逻辑） */
export function matchesRule(date: Date, rule: RepeatRule, config?: RepeatConfig): boolean {
  const day = getDay(date); // 0=周日 ... 6=周六
  const month = getMonth(date) + 1; // 1-12
  const dom = getDate(date); // 1-31

  switch (rule) {
    case "none":
      return false;
    case "daily":
      // 仅工作日：周一至周五（day 1-5）
      if (config?.workdaysOnly) return day >= 1 && day <= 5;
      return true;
    case "weekly": {
      // 按星期几；无 config 时默认原「每周同一天」由调用方处理（见 expandDates 兼容分支）
      if (config?.weekdays && config.weekdays.length > 0) {
        return config.weekdays.includes(day);
      }
      return true;
    }
    case "monthly": {
      if (config?.nthWeekday) {
        // 每月第 nth 个 weekday：该日星期匹配，且位于当月第 nth 个该星期
        if (day !== config.nthWeekday.weekday) return false;
        const nth = Math.ceil(dom / 7);
        return nth === config.nthWeekday.nth;
      }
      if (config?.dayOfMonth) {
        return dom === config.dayOfMonth;
      }
      return true;
    }
    case "yearly": {
      if (config?.yearMonth && config?.yearDay) {
        return month === config.yearMonth && dom === config.yearDay;
      }
      return true;
    }
    case "custom": {
      // 自定义间隔由 expandDates 按步进处理，这里仅作兜底（不在此判断）
      return true;
    }
    default:
      return false;
  }
}

/** 计算某模板在 [start, end] 区间内应出现的周期日期 */
export function expandDates(
  rule: RepeatRule,
  baseDate: string,
  start: string,
  end: string,
  config?: RepeatConfig
): string[] {
  if (rule === "none") return [];
  const base = parseDate(baseDate);
  const s = parseDate(start);
  const e = parseDate(end);
  const dates: string[] = [];

  // 结束条件：按日期结束（config.endDate），之后不再生成
  const ruleEnd = config?.endDate ? parseDate(config.endDate) : null;

  // 自定义间隔：按 interval/unit 从 base 步进
  if (rule === "custom") {
    const interval = Math.max(1, config?.interval ?? 1);
    const unit = config?.unit ?? "day";
    let cur = base;
    for (let i = 0; i < 2000; i++) {
      if (isAfter(cur, e)) break;
      if (ruleEnd && isAfter(cur, ruleEnd)) break;
      if (!isBefore(cur, s)) dates.push(toDateStr(cur));
      if (unit === "day") cur = addDays(cur, interval);
      else if (unit === "week") cur = addWeeks(cur, interval);
      else if (unit === "month") cur = addMonths(cur, interval);
      else if (unit === "year") cur = addYears(cur, interval);
      else break;
    }
    return dates;
  }

  // 旧数据兼容：daily/weekly/monthly 无 config 时，按旧逻辑（每天/每周同一天/每月同日）
  if (!config) {
    let cur = base;
    for (let i = 0; i < 500; i++) {
      if (isAfter(cur, e)) break;
      if (!isBefore(cur, s)) dates.push(toDateStr(cur));
      if (rule === "daily") cur = addDays(cur, 1);
      else if (rule === "weekly") cur = addWeeks(cur, 1);
      else if (rule === "monthly") {
        // 每月同日：保持 base 的目标日，超限（如 31 号遇 2 月）取当月最后一天，避免漂移
        const targetDay = getDate(base);
        const next = addMonths(cur, 1);
        const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        cur = new Date(next.getFullYear(), next.getMonth(), Math.min(targetDay, lastDay));
      } else if (rule === "yearly") cur = addYears(cur, 1);
      else break;
    }
    return dates;
  }

  // 高级规则：从 base 到 end 逐日扫描，用 matchesRule 过滤
  // 起始点取 base 与 start 中较早者，避免漏掉 base 之后、start 之前的匹配日
  const scanStart = isBefore(base, s) ? base : s;
  let cur = scanStart;
  for (let i = 0; i < 2000; i++) {
    if (isAfter(cur, e)) break;
    if (ruleEnd && isAfter(cur, ruleEnd)) break;
    if (!isBefore(cur, s) && matchesRule(cur, rule, config)) {
      dates.push(toDateStr(cur));
    }
    cur = addDays(cur, 1);
  }
  return dates;
}

/**
 * 展开某模板在区间内的虚拟实例。
 * 返回虚拟 Task 列表（不落库），并应用 overrideDate 匹配的覆盖。
 */
export function expandTask(template: Task, start: string, end: string): Task[] {
  if (template.repeatRule === "none") return [];
  const dates = expandDates(template.repeatRule, template.date, start, end, template.repeatConfig);
  return dates.map((dateStr) => {
    // 若存在匹配该日期的 override，则用 override 实体替换展示
    const override = template.isRecurringOverride && template.overrideDate === dateStr;
    return {
      ...template,
      id: `${template.id}::${dateStr}`, // 虚拟实例 id
      date: dateStr,
      isRecurringOverride: override,
      overrideDate: override ? dateStr : undefined,
    };
  });
}

/** 判断某任务是否为虚拟实例（id 含 :: 分隔符） */
export function isVirtualInstance(task: Task): boolean {
  return task.id.includes("::");
}

/** 从虚拟实例 id 还原模板 id */
export function templateIdOf(task: Task): string {
  return task.id.split("::")[0];
}

/** 从虚拟实例 id 还原周期日期 */
export function instanceDateOf(task: Task): string {
  const parts = task.id.split("::");
  return parts[1] ?? task.date;
}

/** 编辑目标解析：虚拟实例 → 定位模板任务（四视图共用，避免重复实现） */
export function resolveEditTarget(task: Task, allTasks: Task[]): Task {
  if (isVirtualInstance(task)) {
    const tpl = allTasks.find((t) => t.id === templateIdOf(task));
    if (tpl) return tpl;
  }
  return task;
}

/** 生成一条"仅本次"覆盖实体任务 */
export function createOverrideTask(template: Task, dateStr: string): Task {
  return {
    ...template,
    id: generateId(),
    date: dateStr,
    isRecurringOverride: true,
    overrideDate: dateStr,
    overrideTemplateId: template.id,
    repeatRule: "none", // 覆盖任务本身不重复
    repeatConfig: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * 展开区间内所有重复任务的虚拟实例，并合并实例独立状态。
 * 返回「普通任务 + 展开后的虚拟实例」合并列表。
 * 虚拟实例的 status/completedAt 优先取 recurringInstances 中的记录。
 */
export function expandRecurringTasks(
  tasks: Task[],
  start: string,
  end: string,
  instances: Record<string, RecurringInstanceState>
): Task[] {
  const result: Task[] = [];
  // 收集所有覆盖任务（仅本次修改的独立实体），按模板 id + 日期 索引
  const overridesByTemplate = new Map<string, Set<string>>();
  for (const t of tasks) {
    if (t.isRecurringOverride && t.overrideDate) {
      const tplId = t.overrideTemplateId ?? t.id;
      if (!overridesByTemplate.has(tplId)) overridesByTemplate.set(tplId, new Set());
      overridesByTemplate.get(tplId)!.add(t.overrideDate);
    }
  }
  for (const t of tasks) {
    if (t.repeatRule === "none") {
      result.push(t);
      continue;
    }
    const expanded = expandTask(t, start, end);
    if (expanded.length === 0) {
      // 区间内无实例（如模板日期在区间外），保留模板本身
      result.push(t);
      continue;
    }
    const overriddenDates = overridesByTemplate.get(t.id);
    for (const inst of expanded) {
      // 若该日期已有覆盖实体，跳过虚拟实例（避免重复显示）
      if (overriddenDates?.has(inst.date)) continue;
      const state = instances[inst.id];
      if (state) {
        result.push({ ...inst, status: state.status, completedAt: state.completedAt });
      } else {
        result.push(inst);
      }
    }
  }
  return result;
}