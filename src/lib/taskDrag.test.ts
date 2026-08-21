// 拖拽纯逻辑测试：isTaskDraggable / buildDropPatch
import { describe, expect, it } from "vitest";
import { buildDropPatch, isTaskDraggable } from "./taskDrag";
import type { Task } from "../types";

function mkTask(partial: Partial<Task> & { id: string }): Task {
  return {
    title: "t",
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

describe("isTaskDraggable", () => {
  it("普通未完成任务可拖拽", () => {
    expect(isTaskDraggable(mkTask({ id: "a" }))).toBe(true);
  });
  it("虚拟实例不可拖拽", () => {
    expect(isTaskDraggable(mkTask({ id: "tpl::2026-08-20" }))).toBe(false);
  });
  it("重复模板不可拖拽", () => {
    expect(isTaskDraggable(mkTask({ id: "b", repeatRule: "weekly" }))).toBe(false);
  });
  it("repeatRule 缺失（旧数据/快速添加）按 none 放行", () => {
    expect(isTaskDraggable(mkTask({ id: "e", repeatRule: undefined as never }))).toBe(true);
  });
});

describe("buildDropPatch", () => {
  const tasks = [
    mkTask({ id: "a", date: "2026-08-18" }),
    mkTask({ id: "b", date: "2026-08-19", status: "done", completedAt: 123 }),
    mkTask({ id: "c", repeatRule: "daily", date: "2026-08-18" }),
    mkTask({ id: "d", date: "2026-08-20" }),
  ];
  it("跨日移动返回日期补丁", () => {
    const patch = buildDropPatch(tasks, "a", "2026-08-21");
    expect(patch).toEqual({ date: "2026-08-21" });
  });
  it("已完成任务拖到新日期转未完成", () => {
    const patch = buildDropPatch(tasks, "b", "2026-08-22");
    expect(patch).toEqual({ date: "2026-08-22", status: "todo", completedAt: undefined });
  });
  it("同日期返回 null", () => {
    expect(buildDropPatch(tasks, "a", "2026-08-18")).toBeNull();
  });
  it("重复模板返回 null", () => {
    expect(buildDropPatch(tasks, "c", "2026-08-21")).toBeNull();
  });
  it("任务不存在返回 null", () => {
    expect(buildDropPatch(tasks, "nope", "2026-08-21")).toBeNull();
  });
});
