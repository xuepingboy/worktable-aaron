// 持久化层（对应详细设计 §6.2）
// 分 key 存储 + schemaVersion 迁移；附件 Blob 走 IndexedDB（idb-keyval）
import { get, set, del } from "idb-keyval";
import type { Goal, RecurringInstanceState, StorageSchema, Task } from "../types";
import { buildSampleData } from "./sampleData";

const META_KEY = "planner.meta";
const TASKS_KEY = "planner.tasks";
const GOALS_KEY = "planner.goals";
const MEMOS_KEY = "planner.memos";
const RECURRING_KEY = "planner.recurringInstances";
const SCHEMA_VERSION = 1;

export interface StoredMeta {
  schemaVersion: number;
}

function readMeta(): StoredMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return { schemaVersion: SCHEMA_VERSION };
    return JSON.parse(raw) as StoredMeta;
  } catch {
    return { schemaVersion: SCHEMA_VERSION };
  }
}

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, value: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // 隐私模式/配额超限等场景：记录告警，避免静默丢数据
    console.warn(`本地存储写入失败（${key}）`, err);
  }
}

/** 校验并归一化单条任务：核心字段缺失/类型错误视为脏数据返回 null；可选字段缺失补默认值（兼容旧数据） */
function normalizeTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string" || typeof o.date !== "string") return null;
  if (o.priority !== "high" && o.priority !== "medium" && o.priority !== "low") return null;
  if (o.status !== "todo" && o.status !== "doing" && o.status !== "done") return null;
  if (typeof o.order !== "number") return null;
  if (!Array.isArray(o.tags) || !Array.isArray(o.subtasks) || !Array.isArray(o.attachments)) return null;
  return {
    ...(raw as Task),
    repeatRule: (o.repeatRule as Task["repeatRule"]) ?? "none",
    tags: o.tags.filter((x): x is string => typeof x === "string"),
  };
}

/** 加载全部数据（含迁移 + 脏数据清洗）；任何存储异常降级为空数据，避免模块加载崩溃 */
export function loadStorage(): StorageSchema {
  try {
    const meta = readMeta();
    let tasks = readArray<Task>(TASKS_KEY)
      .map(normalizeTask)
      .filter((t): t is Task => t !== null);
    let goals = readArray<Goal>(GOALS_KEY);

    // 迁移：v1 直读（未来版本在此追加迁移函数）
    if (meta.schemaVersion < 1) {
      // 预留迁移入口
    }

    // 首次访问（本地无任何数据）时自动填充示例数据，便于演示各视图
    if (tasks.length === 0 && goals.length === 0) {
      const sample = buildSampleData();
      tasks = sample.tasks;
      goals = sample.goals;
      writeArray(TASKS_KEY, tasks);
      writeArray(GOALS_KEY, goals);
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      tasks,
      goals,
      recurringInstances: loadRecurringInstances(),
    };
  } catch (err) {
    // 隐私模式/存储被禁用等场景：降级为空数据（不抛异常，保证应用可启动）
    console.warn("存储加载失败，已降级为空数据", err);
    return { schemaVersion: SCHEMA_VERSION, tasks: [], goals: [], recurringInstances: {} };
  }
}

/** 加载重复任务实例状态 */
export function loadRecurringInstances(): Record<string, RecurringInstanceState> {
  try {
    const raw = localStorage.getItem(RECURRING_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, RecurringInstanceState>) : {};
  } catch {
    return {};
  }
}

/** 保存重复任务实例状态 */
export function saveRecurringInstances(instances: Record<string, RecurringInstanceState>): void {
  localStorage.setItem(RECURRING_KEY, JSON.stringify(instances));
}

/** 保存任务数组（防抖由调用方控制） */
export function saveTasks(tasks: Task[]): void {
  writeArray(TASKS_KEY, tasks);
}

/** 保存目标数组 */
export function saveGoals(goals: Goal[]): void {
  writeArray(GOALS_KEY, goals);
}

/** 加载备忘（按日期存储的便签文本） */
export function loadMemos(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MEMOS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** 保存备忘 */
export function saveMemos(memos: Record<string, string>): void {
  localStorage.setItem(MEMOS_KEY, JSON.stringify(memos));
}

/** 清空全部本地数据（localStorage + IndexedDB） */
export async function clearAllStorage(): Promise<void> {
  localStorage.removeItem(META_KEY);
  localStorage.removeItem(TASKS_KEY);
  localStorage.removeItem(GOALS_KEY);
  localStorage.removeItem(MEMOS_KEY);
  localStorage.removeItem(RECURRING_KEY);
  // 清空 IndexedDB 附件
  const keys = await get<string[]>("planner.attachmentKeys");
  if (keys) {
    for (const k of keys) await del(k);
  }
  await del("planner.attachmentKeys");
}

// ---- 附件 IndexedDB 存储 ----

const ATTACH_KEYS = "planner.attachmentKeys";

async function getAttachKeys(): Promise<string[]> {
  return (await get<string[]>(ATTACH_KEYS)) ?? [];
}

/** 保存附件 Blob。成功返回 true；IndexedDB 不可用/配额超限时返回 false，由调用方提示用户 */
export async function saveAttachmentBlob(attachmentId: string, blob: Blob): Promise<boolean> {
  try {
    const key = `planner.attach.${attachmentId}`;
    await set(key, blob);
    const keys = await getAttachKeys();
    if (!keys.includes(key)) {
      keys.push(key);
      await set(ATTACH_KEYS, keys);
    }
    return true;
  } catch (err) {
    console.warn("附件保存失败（IndexedDB 不可用）", err);
    return false;
  }
}

/** 读取附件 Blob */
export async function loadAttachmentBlob(attachmentId: string): Promise<Blob | undefined> {
  return get<Blob>(`planner.attach.${attachmentId}`);
}

/** 删除附件 Blob */
export async function deleteAttachmentBlob(attachmentId: string): Promise<void> {
  const key = `planner.attach.${attachmentId}`;
  await del(key);
  const keys = await getAttachKeys();
  await set(
    ATTACH_KEYS,
    keys.filter((k) => k !== key)
  );
}