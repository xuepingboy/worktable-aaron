// 提醒引擎测试：scanReminders 窗口命中 / 去重 / 边界
import { describe, expect, it } from "vitest";
import { scanReminders } from "./reminder";
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

const NOW = Date.parse("2026-08-18T10:00:00+08:00");

describe("scanReminders", () => {
  it("窗口内未完成且带提醒的任务命中", () => {
    // deadline 在 30 分钟提醒窗口内（diff = 10 分钟）
    const t = mkTask({ id: "a", deadline: new Date(NOW + 10 * 60 * 1000).toISOString(), reminderOffset: 30 });
    const { hits } = scanReminders([t], NOW);
    expect(hits.map((x) => x.id)).toEqual(["a"]);
  });
  it("已提醒过且仍在窗口内不重复命中", () => {
    const t = mkTask({ id: "a", deadline: new Date(NOW + 20 * 60 * 1000).toISOString(), reminderOffset: 60, lastNotifiedAt: NOW - 5 * 60 * 1000 });
    const { hits } = scanReminders([t], NOW);
    expect(hits).toHaveLength(0);
  });
  it("超过窗口不命中（diff > offset）", () => {
    const t = mkTask({ id: "a", deadline: new Date(NOW + 61 * 60 * 1000).toISOString(), reminderOffset: 60 });
    const { hits } = scanReminders([t], NOW);
    expect(hits).toHaveLength(0);
  });
  it("已过期不命中（diff <= 0）", () => {
    const t = mkTask({ id: "a", deadline: new Date(NOW - 1000).toISOString(), reminderOffset: 60 });
    const { hits } = scanReminders([t], NOW);
    expect(hits).toHaveLength(0);
  });
  it("已完成任务跳过", () => {
    const t = mkTask({ id: "a", status: "done", deadline: new Date(NOW + 5 * 60 * 1000).toISOString(), reminderOffset: 30 });
    const { hits } = scanReminders([t], NOW);
    expect(hits).toHaveLength(0);
  });
  it("无 reminderOffset 或无 deadline 跳过", () => {
    const t1 = mkTask({ id: "a", deadline: new Date(NOW + 5 * 60 * 1000).toISOString() });
    const t2 = mkTask({ id: "b", reminderOffset: 30 });
    const { hits } = scanReminders([t1, t2], NOW);
    expect(hits).toHaveLength(0);
  });
  it("命中的任务同时返回 updated（带 lastNotifiedAt）", () => {
    const t = mkTask({ id: "a", deadline: new Date(NOW + 10 * 60 * 1000).toISOString(), reminderOffset: 30 });
    const { updated } = scanReminders([t], NOW);
    expect(updated[0].lastNotifiedAt).toBe(NOW);
  });
});
