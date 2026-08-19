// 导入导出工具测试：parseJsonBackup / filterTasksByRange
import { describe, expect, it } from "vitest";
import { filterTasksByRange, parseJsonBackup } from "./export";
import type { Task } from "../types";

function mkTask(partial: Partial<Task>): Task {
  return {
    id: "t1",
    title: "测试",
    date: "2026-08-18",
    priority: "medium",
    status: "todo",
    order: 0,
    tags: [],
    subtasks: [],
    attachments: [],
    repeatRule: "none",
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe("filterTasksByRange", () => {
  const tasks: Task[] = [
    mkTask({ id: "a", date: "2026-08-18" }),
    mkTask({ id: "b", date: "2026-08-20", endDate: "2026-08-26" }),
    mkTask({ id: "c", date: "2026-09-01" }),
  ];
  it("all 返回全部", () => {
    expect(filterTasksByRange(tasks, { range: "all" })).toHaveLength(3);
  });
  it("custom 起止闭区间（范围任务计入）", () => {
    const r = filterTasksByRange(tasks, { range: "custom", start: "2026-08-19", end: "2026-08-23" });
    expect(r.map((t) => t.id)).toEqual(["b"]); // a 在区间前，c 在区间后，b 跨区间
  });
  it("custom 缺 start/end 返回全部", () => {
    expect(filterTasksByRange(tasks, { range: "custom" })).toHaveLength(3);
  });
});

describe("parseJsonBackup", () => {
  it("合法备份解析", () => {
    const data = { schemaVersion: 1, tasks: [{ id: "1", title: "a", date: "2026-08-18" }], goals: [], memos: { "2026-08-18": "x" } };
    const r = parseJsonBackup(JSON.stringify(data));
    expect(r).not.toBeNull();
    expect(r!.tasks).toHaveLength(1);
    expect(r!.memos?.["2026-08-18"]).toBe("x");
  });
  it("脏任务（缺 title）被过滤", () => {
    const data = { schemaVersion: 1, tasks: [{ id: "1", date: "2026-08-18" }, { id: "2", title: "ok", date: "2026-08-19" }], goals: [] };
    const r = parseJsonBackup(JSON.stringify(data));
    expect(r!.tasks).toHaveLength(1);
    expect(r!.tasks[0].id).toBe("2");
  });
  it("非数组 tasks 返回 null", () => {
    expect(parseJsonBackup(JSON.stringify({ tasks: "bad" }))).toBeNull();
  });
  it("非法 JSON 返回 null", () => {
    expect(parseJsonBackup("not json")).toBeNull();
  });
});
