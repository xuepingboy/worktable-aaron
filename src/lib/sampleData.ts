// 示例数据：首次访问（本地无任何数据）时自动填充，便于演示各视图效果
import type { Goal, Task } from "../types";
import { addDays, addMonths, endOfDay, format, parseISO, startOfWeek } from "date-fns";
import { DATE_FMT } from "./date";

function d(date: Date): string {
  return format(date, DATE_FMT);
}

/** 生成覆盖今日/本周/本月、不同优先级/状态/标签/重复规则的示例任务与目标 */
export function buildSampleData(): { tasks: Task[]; goals: Goal[] } {
  const now = Date.now();
  const today = new Date();
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  const mk = (t: Partial<Task> & { title: string; date: string }): Task => ({
    id: crypto.randomUUID(),
    title: t.title,
    date: t.date,
    time: t.time,
    priority: t.priority ?? "medium",
    status: t.status ?? "todo",
    order: t.order ?? 0,
    deadline: t.deadline,
    description: t.description,
    tags: t.tags ?? [],
    subtasks: t.subtasks ?? [],
    attachments: [],
    repeatRule: t.repeatRule ?? "none",
    reminderOffset: t.reminderOffset,
    isRecurringOverride: t.isRecurringOverride,
    overrideDate: t.overrideDate,
    lastNotifiedAt: t.lastNotifiedAt,
    createdAt: now,
    updatedAt: now,
  });

  const tasks: Task[] = [
    // ---- 今日（今天）----
    mk({
      title: "晨会：同步本周项目进度",
      date: d(today),
      time: "09:30",
      priority: "high",
      status: "done",
      order: 0,
      tags: ["工作", "会议"],
      description: "与团队同步本周各模块进展，确认风险项与资源缺口。",
      subtasks: [
        { id: crypto.randomUUID(), title: "整理上周数据", done: true },
        { id: crypto.randomUUID(), title: "列出阻塞项", done: true },
      ],
    }),
    mk({
      title: "撰写季度复盘报告",
      date: d(today),
      time: "14:00",
      priority: "high",
      status: "doing",
      order: 1,
      tags: ["工作", "报告"],
      description: "汇总 Q2 目标达成情况，输出复盘结论与下季度建议。",
      reminderOffset: 30,
      subtasks: [
        { id: crypto.randomUUID(), title: "收集数据", done: true },
        { id: crypto.randomUUID(), title: "撰写初稿", done: false },
        { id: crypto.randomUUID(), title: "评审修订", done: false },
      ],
    }),
    mk({
      title: "预约牙医复诊",
      date: d(today),
      time: "17:30",
      priority: "low",
      status: "todo",
      order: 2,
      tags: ["生活"],
    }),
    mk({
      title: "每日站会",
      date: d(today),
      time: "10:00",
      priority: "medium",
      status: "todo",
      order: 3,
      tags: ["工作", "会议"],
      repeatRule: "daily",
    }),

    // ---- 本周（周一至周日）----
    mk({
      title: "完成产品原型评审",
      date: d(addDays(monday, 1)),
      time: "11:00",
      priority: "high",
      status: "todo",
      order: 0,
      tags: ["工作", "产品"],
      description: "与设计、研发三方评审新版原型，输出评审纪要。",
      reminderOffset: 60,
    }),
    mk({
      title: "健身房力量训练",
      date: d(addDays(monday, 2)),
      time: "19:00",
      priority: "medium",
      status: "todo",
      order: 0,
      tags: ["生活", "健康"],
      repeatRule: "weekly",
    }),
    mk({
      title: "整理周报并发送",
      date: d(addDays(monday, 4)),
      time: "16:00",
      priority: "medium",
      status: "todo",
      order: 0,
      tags: ["工作", "报告"],
      repeatRule: "weekly",
    }),
    mk({
      title: "家庭聚餐",
      date: d(addDays(monday, 5)),
      time: "18:30",
      priority: "low",
      status: "todo",
      order: 0,
      tags: ["生活"],
    }),
    mk({
      title: "阅读《高效能人士的七个习惯》",
      date: d(addDays(monday, 6)),
      priority: "low",
      status: "todo",
      order: 0,
      tags: ["学习"],
      description: "本周读完第 3-4 章并做笔记。",
    }),

    // ---- 本月（含跨周）----
    mk({
      title: "提交月度报销单",
      date: d(addDays(today, 8)),
      priority: "medium",
      status: "todo",
      order: 0,
      tags: ["工作", "财务"],
      reminderOffset: 120,
    }),
    mk({
      title: "月度目标复盘",
      date: d(addDays(today, 10)),
      priority: "high",
      status: "todo",
      order: 0,
      tags: ["工作", "复盘"],
      repeatRule: "monthly",
    }),
    mk({
      title: "续费云服务器",
      date: d(addDays(today, 12)),
      priority: "high",
      status: "todo",
      order: 0,
      tags: ["工作", "运维"],
      description: "检查到期时间，续费并确认自动续费开关。",
    }),
    mk({
      title: "参加行业技术沙龙",
      date: d(addDays(today, 15)),
      time: "14:00",
      priority: "medium",
      status: "todo",
      order: 0,
      tags: ["学习", "活动"],
    }),
    mk({
      title: "体检预约",
      date: d(addDays(today, 18)),
      priority: "medium",
      status: "todo",
      order: 0,
      tags: ["生活", "健康"],
    }),
    mk({
      title: "整理季度归档资料",
      date: d(addDays(today, 20)),
      priority: "low",
      status: "todo",
      order: 0,
      tags: ["工作"],
    }),

    // ---- 上月（逾期示例）----
    mk({
      title: "更新团队知识库文档",
      date: d(addDays(today, -3)),
      deadline: endOfDay(parseISO(d(addDays(today, -3)))).toISOString(),
      priority: "medium",
      status: "todo",
      order: 0,
      tags: ["工作", "文档"],
      description: "逾期未完成，需尽快补齐。",
    }),
    mk({
      title: "归还图书馆书籍",
      date: d(addDays(today, -5)),
      deadline: endOfDay(parseISO(d(addDays(today, -5)))).toISOString(),
      priority: "low",
      status: "todo",
      order: 0,
      tags: ["生活"],
    }),
  ];

  const goals: Goal[] = [
    {
      id: crypto.randomUUID(),
      title: "完成季度复盘报告并提交",
      type: "week",
      start: d(monday),
      end: d(addDays(monday, 6)),
      isFocus: true,
    },
    {
      id: crypto.randomUUID(),
      title: "坚持每周 3 次健身",
      type: "week",
      start: d(monday),
      end: d(addDays(monday, 6)),
    },
    {
      id: crypto.randomUUID(),
      title: "推进产品原型评审落地",
      type: "month",
      start: d(today),
      end: d(addMonths(today, 1)),
      isFocus: true,
    },
    {
      id: crypto.randomUUID(),
      title: "读完 2 本专业书籍",
      type: "month",
      start: d(today),
      end: d(addMonths(today, 1)),
    },
  ];

  return { tasks, goals };
}