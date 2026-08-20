// 全局状态（对应详细设计 §6）
// Zustand + 分 key 持久化 + 防抖写入
import { create } from "zustand";
import type { FilterState, Goal, Priority, RecurringInstanceState, Status, Task } from "../types";
import {
  loadStorage,
  loadMemos,
  saveGoals,
  saveMemos,
  saveTasks,
  loadRecurringInstances,
  saveRecurringInstances,
} from "../lib/storage";
import {
  defaultDeadline,
  taskVisibleOnDate,
  taskOverlapsRange,
  todayStr,
  weekStartStr,
  weekEndStr,
  monthStr,
  toDateStr,
} from "../lib/date";
import { endOfMonth } from "date-fns";
import { generateId } from "../lib/utils";

interface PlannerState {
  tasks: Task[];
  goals: Goal[];
  memos: Record<string, string>; // 每日备忘便签（key: YYYY-MM-DD）
  recurringInstances: Record<string, RecurringInstanceState>; // 重复任务实例完成状态
  // UI
  selectedDate: string;
  weekCursor: string; // 当前周周一
  monthCursor: string; // 当前月 YYYY-MM
  filter: FilterState;
  taskFormOpen: boolean;
  taskFormDate: string;
  // actions
  openTaskForm: (date?: string) => void;
  closeTaskForm: () => void;
  addTask: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  deleteTasks: (ids: string[]) => void;
  toggleTask: (id: string) => void;
  toggleRecurringInstance: (instanceId: string) => void;
  reorderTask: (id: string, date: string, order: number) => void;
  addGoal: (goal: Omit<Goal, "id">) => void;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  setSelectedDate: (d: string) => void;
  setWeekCursor: (d: string) => void;
  setMonthCursor: (d: string) => void;
  setFilter: (patch: Partial<FilterState>) => void;
  resetFilter: () => void;
  setMemo: (date: string, text: string) => void;
  importData: (tasks: Task[], goals: Goal[]) => void;
  clearAll: () => void;
}

const DEFAULT_FILTER: FilterState = {
  keyword: "",
  status: "all",
  priority: "all",
  tag: "all",
  dateRange: "all",
};

// 防抖写入
let tasksTimer: ReturnType<typeof setTimeout> | undefined;
let goalsTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleSaveTasks(tasks: Task[]) {
  if (tasksTimer) clearTimeout(tasksTimer);
  tasksTimer = setTimeout(() => saveTasks(tasks), 300);
}

function scheduleSaveGoals(goals: Goal[]) {
  if (goalsTimer) clearTimeout(goalsTimer);
  goalsTimer = setTimeout(() => saveGoals(goals), 300);
}

const initial = loadStorage();

export const usePlannerStore = create<PlannerState>((set) => ({
  tasks: initial.tasks,
  goals: initial.goals,
  memos: loadMemos(),
  recurringInstances: loadRecurringInstances(),
  selectedDate: todayStr(),
  weekCursor: todayStr(),
  monthCursor: todayStr().slice(0, 7),
  filter: { ...DEFAULT_FILTER },
  taskFormOpen: false,
  taskFormDate: todayStr(),

  openTaskForm: (date) => set({ taskFormOpen: true, taskFormDate: date ?? todayStr() }),
  closeTaskForm: () => set({ taskFormOpen: false }),

  addTask: (task) => {
    const now = Date.now();
    const newTask: Task = {
      ...task,
      id: generateId(),
      deadline: task.deadline ?? defaultDeadline(task.date, task.endDate),
      createdAt: now,
      updatedAt: now,
    };
    set((s) => {
      const tasks = [...s.tasks, newTask];
      scheduleSaveTasks(tasks);
      return { tasks };
    });
    return newTask;
  },

  updateTask: (id, patch) => {
    set((s) => {
      const tasks = s.tasks.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t
      );
      scheduleSaveTasks(tasks);
      return { tasks };
    });
  },

  deleteTask: (id) => {
    set((s) => {
      const tasks = s.tasks.filter((t) => t.id !== id);
      scheduleSaveTasks(tasks);
      return { tasks };
    });
  },

  deleteTasks: (ids) => {
    const idSet = new Set(ids);
    set((s) => {
      const tasks = s.tasks.filter((t) => !idSet.has(t.id));
      scheduleSaveTasks(tasks);
      return { tasks };
    });
  },

  toggleTask: (id) => {
    set((s) => {
      const tasks = s.tasks.map((t) => {
        if (t.id !== id) return t;
        const next: Status = t.status === "done" ? "todo" : "done";
        return {
          ...t,
          status: next,
          completedAt: next === "done" ? Date.now() : undefined,
          updatedAt: Date.now(),
        };
      });
      scheduleSaveTasks(tasks);
      return { tasks };
    });
  },

  toggleRecurringInstance: (instanceId) => {
    set((s) => {
      const cur = s.recurringInstances[instanceId];
      const next: Status = cur?.status === "done" ? "todo" : "done";
      const instances = {
        ...s.recurringInstances,
        [instanceId]: {
          status: next,
          completedAt: next === "done" ? Date.now() : undefined,
        },
      };
      saveRecurringInstances(instances);
      return { recurringInstances: instances };
    });
  },

  reorderTask: (id, date, order) => {
    set((s) => {
      const tasks = s.tasks.map((t) =>
        t.id === id ? { ...t, date, order, updatedAt: Date.now() } : t
      );
      scheduleSaveTasks(tasks);
      return { tasks };
    });
  },

  addGoal: (goal) => {
    const newGoal: Goal = { ...goal, id: generateId() };
    set((s) => {
      const goals = [...s.goals, newGoal];
      scheduleSaveGoals(goals);
      return { goals };
    });
  },

  updateGoal: (id, patch) => {
    set((s) => {
      const goals = s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g));
      scheduleSaveGoals(goals);
      return { goals };
    });
  },

  deleteGoal: (id) => {
    set((s) => {
      const goals = s.goals.filter((g) => g.id !== id);
      scheduleSaveGoals(goals);
      return { goals };
    });
  },

  setSelectedDate: (d) => set({ selectedDate: d }),
  setWeekCursor: (d) => set({ weekCursor: d }),
  setMonthCursor: (d) => set({ monthCursor: d }),
  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  resetFilter: () => set({ filter: { ...DEFAULT_FILTER } }),

  setMemo: (date, text) => {
    set((s) => {
      const memos = { ...s.memos, [date]: text };
      saveMemos(memos);
      return { memos };
    });
  },

  importData: (tasks, goals) => {
    set({ tasks, goals });
    saveTasks(tasks);
    saveGoals(goals);
  },

  clearAll: () => {
    set({ tasks: [], goals: [], memos: {}, recurringInstances: {} });
    saveTasks([]);
    saveGoals([]);
    saveMemos({});
    saveRecurringInstances({});
  },
}));

// ---- 派生选择器 ----

/** 按筛选条件过滤任务 */
export function filterTasks(tasks: Task[], filter: FilterState): Task[] {
  const today = todayStr();
  const weekStart = weekStartStr();
  const weekEnd = weekEndStr();
  const month = monthStr();
  return tasks.filter((t) => {
    if (filter.keyword && !t.title.toLowerCase().includes(filter.keyword.toLowerCase())) return false;
    if (filter.status !== "all" && t.status !== filter.status) return false;
    if (filter.priority !== "all" && t.priority !== filter.priority) return false;
    if (filter.tag !== "all" && !t.tags.includes(filter.tag)) return false;
    // 日期范围筛选（周/月用区间交集，范围任务跨周/跨月不丢失）
    if (filter.dateRange === "today" && !taskVisibleOnDate(t, today)) return false;
    if (filter.dateRange === "week" && !taskOverlapsRange(t, weekStart, weekEnd)) return false;
    if (filter.dateRange === "month" && !taskOverlapsRange(t, `${month}-01`, toDateStr(endOfMonth(new Date())))) return false;
    return true;
  });
}

/** 收集所有标签 */
export function collectTags(tasks: Task[]): string[] {
  const set = new Set<string>();
  tasks.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
  return Array.from(set);
}

/** 优先级排序权重 */
export function priorityWeight(p: Priority): number {
  return p === "high" ? 0 : p === "medium" ? 1 : 2;
}