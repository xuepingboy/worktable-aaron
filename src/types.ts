// 核心数据模型（对应详细设计 §5）

export type Priority = "high" | "medium" | "low";
export type Status = "todo" | "doing" | "done";
export type RepeatRule = "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";

/** 重复规则详细配置（repeatRule !== "none" 时生效） */
export interface RepeatConfig {
  // daily: 每天 / 工作日
  workdaysOnly?: boolean; // true = 仅工作日（周一至周五）
  // weekly: 按星期几（0=周日 ... 6=周六）
  weekdays?: number[];
  // monthly: 每月固定日 / 每月第N个星期几
  dayOfMonth?: number; // 每月第 dayOfMonth 日
  nthWeekday?: { nth: number; weekday: number }; // 每月第 nth 个 weekday
  // yearly: 每年某月某日
  yearMonth?: number; // 1-12
  yearDay?: number; // 1-31
  // custom: 每 N 天/周/月/年
  interval?: number; // 间隔数
  unit?: "day" | "week" | "month" | "year";
  // 结束条件
  endDate?: string; // 按日期结束（YYYY-MM-DD），之后不再生成
}

export interface SubTask {
  id: string;
  title: string;
  done: boolean;
  completedAt?: number; // 完成时间戳（用于显示子任务完成日期）
}

export interface Attachment {
  id: string;
  name: string;
  type: string; // mime
  size: number; // 单文件 ≤ 20MB（链接模式为 -1）
  mode?: "link" | "blob"; // 桌面端链接模式：仅存本地路径、不复制；默认 blob（IndexedDB 副本）
  path?: string; // mode === "link" 时的本地绝对路径
  blob?: Blob; // IndexedDB 存储
  url?: string; // 运行时 objectURL
}

export interface Task {
  id: string; // crypto.randomUUID()
  title: string; // 必填，≤ 200 字符
  date: string; // 开始日期 YYYY-MM-DD —— 决定视图归属
  endDate?: string; // 截止日期 YYYY-MM-DD（可选，无则视为单日任务）
  time?: string; // HH:mm
  priority: Priority; // 默认 medium
  status: Status; // 默认 todo
  order: number; // 同 date 内相对排序权重（拖拽维护，落位时对目标列归一化重排）
  deadline?: string; // ISO 日期；未填默认 = endDate 当天 23:59:59（无 endDate 则 = date 当天）
  completedAt?: number; // 完成时间戳（用于显示完成日期 + 完成当天显示）
  description?: string;
  tags: string[];
  subtasks: SubTask[]; // 子任务（唯一归属机制，无 parentId）
  attachments: Attachment[];
  repeatRule: RepeatRule; // 默认 none
  repeatConfig?: RepeatConfig; // 重复规则详细配置
  reminderOffset?: number; // 提前提醒分钟数
  isFocus?: boolean; // 本周重点事项标记（从本周任务中选择）
  isRecurringOverride?: boolean; // 仅本次覆盖标记
  overrideDate?: string; // 覆盖对应的周期日期 YYYY-MM-DD（配合 isRecurringOverride）
  overrideTemplateId?: string; // 覆盖任务对应的模板任务 id（用于展开时去重）
  lastNotifiedAt?: number; // 最近一次提醒时间戳（提醒去重）
  createdAt: number;
  updatedAt: number;
}

export interface Goal {
  id: string;
  title: string;
  type: "week" | "month";
  start: string; // YYYY-MM-DD
  end: string;
  isFocus?: boolean; // 本周重点事项标记（合并原 FocusItem）
}

/** 重复任务虚拟实例的独立状态（key: `${模板id}::${日期}`） */
export interface RecurringInstanceState {
  status: Status;
  completedAt?: number;
}

export interface StorageSchema {
  schemaVersion: 1; // 迁移版本号
  tasks: Task[];
  goals: Goal[];
  memos?: Record<string, string>; // 每日笔记（key: YYYY-MM-DD）
  recurringInstances?: Record<string, RecurringInstanceState>; // 重复任务实例完成状态
}

export interface FilterState {
  keyword: string;
  status: Status | "all";
  priority: Priority | "all";
  tag: string | "all";
  dateRange: "all" | "today" | "week" | "month";
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export const STATUS_LABEL: Record<Status, string> = {
  todo: "待办",
  doing: "进行中",
  done: "已完成",
};

export const REPEAT_LABEL: Record<RepeatRule, string> = {
  none: "不重复",
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
  yearly: "每年",
  custom: "自定义",
};