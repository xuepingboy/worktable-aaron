// 重复任务展开测试：matchesRule / expandDates / expandTask / createOverrideTask / expandRecurringTasks
import { describe, expect, it } from "vitest";
import { createOverrideTask, expandDates, expandRecurringTasks, expandTask, isVirtualInstance, matchesRule, templateIdOf } from "./repeat";
import { parseDate } from "./date";
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

describe("matchesRule", () => {
  it("daily 每天命中", () => {
    expect(matchesRule(parseDate("2026-08-18"), "daily")).toBe(true);
  });
  it("daily 工作日：周六不命中", () => {
    expect(matchesRule(parseDate("2026-08-22"), "daily", { workdaysOnly: true })).toBe(false);
  });
  it("daily 工作日：周三命中", () => {
    expect(matchesRule(parseDate("2026-08-19"), "daily", { workdaysOnly: true })).toBe(true);
  });
  it("weekly 周一命中、周二不命中", () => {
    expect(matchesRule(parseDate("2026-08-24"), "weekly", { weekdays: [1] })).toBe(true);
    expect(matchesRule(parseDate("2026-08-25"), "weekly", { weekdays: [1] })).toBe(false);
  });
  it("monthly dayOfMonth 15 命中", () => {
    expect(matchesRule(parseDate("2026-08-15"), "monthly", { dayOfMonth: 15 })).toBe(true);
    expect(matchesRule(parseDate("2026-08-16"), "monthly", { dayOfMonth: 15 })).toBe(false);
  });
  it("yearly 8月18日命中", () => {
    expect(matchesRule(parseDate("2026-08-18"), "yearly", { yearMonth: 8, yearDay: 18 })).toBe(true);
  });
});

describe("expandDates", () => {
  it("daily 展开区间内所有天", () => {
    const dates = expandDates("daily", "2026-08-18", "2026-08-18", "2026-08-20");
    expect(dates).toEqual(["2026-08-18", "2026-08-19", "2026-08-20"]);
  });
  it("weekly 按 base 周几展开", () => {
    const dates = expandDates("weekly", "2026-08-18", "2026-08-18", "2026-09-01");
    // 8/18 周二，之后每周二
    expect(dates).toEqual(["2026-08-18", "2026-08-25", "2026-09-01"]);
  });
  it("monthly 每月同日（31 号遇 2 月取月末、不漂移）", () => {
    const dates = expandDates("monthly", "2026-01-31", "2026-01-31", "2026-04-30");
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("monthly dayOfMonth 逐日扫描（2 月无 31 跳过）", () => {
    const dates = expandDates("monthly", "2026-01-31", "2026-01-31", "2026-04-30", { dayOfMonth: 31 });
    expect(dates).toEqual(["2026-01-31", "2026-03-31"]);
  });
  it("none 返回空", () => {
    expect(expandDates("none", "2026-08-18", "2026-08-18", "2026-08-20")).toEqual([]);
  });
  it("config.endDate 截止后不再生成", () => {
    const dates = expandDates("daily", "2026-08-18", "2026-08-18", "2026-08-25", { endDate: "2026-08-20" });
    expect(dates).toEqual(["2026-08-18", "2026-08-19", "2026-08-20"]);
  });
});

describe("expandTask", () => {
  const tpl = mkTask({ id: "tpl", repeatRule: "weekly", repeatConfig: { weekdays: [2] } });
  it("展开虚拟实例（id 含 :: 日期，date 为实例日期）", () => {
    const insts = expandTask(tpl, "2026-08-18", "2026-08-25");
    expect(insts.map((i) => i.id)).toEqual(["tpl::2026-08-18", "tpl::2026-08-25"]);
    expect(insts[0].date).toBe("2026-08-18");
    expect(insts.every((i) => !i.isRecurringOverride)).toBe(true);
  });
  it("repeatRule none 返回空", () => {
    expect(expandTask(mkTask({ id: "a" }), "2026-08-18", "2026-08-25")).toHaveLength(0);
  });
});

describe("createOverrideTask", () => {
  it("生成仅本次覆盖实体（独立 id / overrideDate / repeatRule none）", () => {
    const tpl = mkTask({ id: "tpl", repeatRule: "weekly" });
    const ov = createOverrideTask(tpl, "2026-08-25");
    expect(ov.id).not.toBe("tpl");
    expect(ov.date).toBe("2026-08-25");
    expect(ov.isRecurringOverride).toBe(true);
    expect(ov.overrideDate).toBe("2026-08-25");
    expect(ov.overrideTemplateId).toBe("tpl");
    expect(ov.repeatRule).toBe("none");
  });
});

describe("expandRecurringTasks", () => {
  it("普通任务原样返回", () => {
    const normal = mkTask({ id: "a" });
    const r = expandRecurringTasks([normal], "2026-08-18", "2026-08-25", {});
    expect(r.map((t) => t.id)).toEqual(["a"]);
  });
  it("重复模板展开实例并合并实例状态", () => {
    const tpl = mkTask({ id: "tpl", repeatRule: "daily" });
    const state = { ["tpl::2026-08-18" as string]: { status: "done" as const, completedAt: 123 } };
    const r = expandRecurringTasks([tpl], "2026-08-18", "2026-08-19", state);
    const done = r.find((t) => t.id === "tpl::2026-08-18");
    expect(done?.status).toBe("done");
    expect(done?.completedAt).toBe(123);
    expect(r.find((t) => t.id === "tpl::2026-08-19")?.status).toBe("todo");
  });
  it("覆盖任务日期跳过虚拟实例（不重复显示）", () => {
    const tpl = mkTask({ id: "tpl", repeatRule: "daily" });
    const override = createOverrideTask(tpl, "2026-08-18");
    const r = expandRecurringTasks([tpl, override], "2026-08-18", "2026-08-19", {});
    const ids = r.map((t) => t.id);
    expect(ids).toContain(override.id); // 覆盖实体显示
    expect(ids).not.toContain("tpl::2026-08-18"); // 该日期虚拟实例被跳过
    expect(ids).toContain("tpl::2026-08-19");
  });
  it("模板日期在区间外且无实例时保留模板本身", () => {
    const tpl = mkTask({ id: "tpl", date: "2026-09-01", repeatRule: "daily" });
    const r = expandRecurringTasks([tpl], "2026-08-18", "2026-08-25", {});
    expect(r.map((t) => t.id)).toEqual(["tpl"]);
  });
});

describe("isVirtualInstance / templateIdOf", () => {
  it("虚拟实例判定与模板 id 还原", () => {
    const inst = mkTask({ id: "tpl::2026-08-20" });
    expect(isVirtualInstance(inst)).toBe(true);
    expect(templateIdOf(inst)).toBe("tpl");
    expect(isVirtualInstance(mkTask({ id: "plain" }))).toBe(false);
  });
});
