// date 工具测试：taskVisibleOnDate / taskOverlapsRange / 周与月边界
import { describe, expect, it } from "vitest";
import { taskOverlapsRange, taskVisibleOnDate, weekStartStr, weekEndStr, monthStr } from "./date";
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

describe("taskOverlapsRange", () => {
  it("单日任务在区间内", () => {
    expect(taskOverlapsRange(mkTask({ date: "2026-08-18" }), "2026-08-17", "2026-08-23")).toBe(true);
  });
  it("单日任务在区间外", () => {
    expect(taskOverlapsRange(mkTask({ date: "2026-08-25" }), "2026-08-17", "2026-08-23")).toBe(false);
  });
  it("范围任务跨区间（date 在区间前、endDate 在区间内）", () => {
    expect(taskOverlapsRange(mkTask({ date: "2026-08-15", endDate: "2026-08-25" }), "2026-08-17", "2026-08-23")).toBe(true);
  });
  it("范围任务完全在区间后", () => {
    expect(taskOverlapsRange(mkTask({ date: "2026-08-24", endDate: "2026-08-30" }), "2026-08-17", "2026-08-23")).toBe(false);
  });
  it("无 endDate 时按单日", () => {
    expect(taskOverlapsRange(mkTask({ date: "2026-08-23" }), "2026-08-17", "2026-08-23")).toBe(true);
  });
});

describe("taskVisibleOnDate", () => {
  it("单日未完成任务当天显示", () => {
    expect(taskVisibleOnDate(mkTask({ date: "2026-08-18" }), "2026-08-18")).toBe(true);
  });
  it("单日未完成任务非当天不显示", () => {
    // 注意：不能用「任务日期的次日」——顺延逻辑会让「日期已过且查询的是今天」显示（今天会漂移）。
    // 用远期固定日期，保证既非任务日期也非任何一天的真实「今天」。
    expect(taskVisibleOnDate(mkTask({ date: "2026-08-18" }), "2099-01-01")).toBe(false);
  });
  it("范围任务在 endDate 内显示", () => {
    expect(taskVisibleOnDate(mkTask({ date: "2026-08-15", endDate: "2026-08-25" }), "2026-08-20")).toBe(true);
  });
  it("范围任务超出 endDate 不显示", () => {
    expect(taskVisibleOnDate(mkTask({ date: "2026-08-15", endDate: "2026-08-25" }), "2026-08-26")).toBe(false);
  });
  it("已完成任务只在完成当天显示", () => {
    const t = mkTask({ date: "2026-08-18", status: "done", completedAt: new Date(2026, 7, 19).getTime() });
    expect(taskVisibleOnDate(t, "2026-08-19")).toBe(true);
    expect(taskVisibleOnDate(t, "2026-08-18")).toBe(false);
  });
  it("逾期未完成单日任务今天仍显示（顺延）", () => {
    const past = "2026-08-10";
    expect(taskVisibleOnDate(mkTask({ date: past }), todayMock())).toBe(true);
  });
});

// 顺延用例依赖「今天」，直接注入一个固定今天
function todayMock(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("周/月边界工具", () => {
  it("weekStartStr/weekEndStr 返回 7 天跨度", () => {
    const start = weekStartStr(new Date(2026, 7, 18)); // 周二
    const end = weekEndStr(new Date(2026, 7, 18));
    expect(start).toBe("2026-08-17"); // 周一
    expect(end).toBe("2026-08-23"); // 周日
  });
  it("monthStr 返回 YYYY-MM", () => {
    expect(monthStr(new Date(2026, 7, 18))).toBe("2026-08");
  });
});
