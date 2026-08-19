// 快速添加解析测试（20 边界用例）
import { describe, expect, it } from "vitest";
import { parseQuickAdd, type QuickAddResult } from "./quickAdd";

const base = new Date(2026, 7, 18); // 2026-08-18 周二

type Check = (r: QuickAddResult) => boolean;
const cases: { input: string; label: string; check: Check }[] = [
  { input: "明天下午3点开会 #工作 !!高", label: "基础语法", check: (r) => r.title === "开会" && r.date === "2026-08-19" && r.time === "15:00" && r.priority === "high" && r.tags.includes("工作") },
  { input: "每周一跑步", label: "每周X", check: (r) => r.title === "跑步" && r.repeatRule === "weekly" && JSON.stringify(r.repeatConfig?.weekdays) === "[1]" },
  { input: "月底前交周报", label: "月底前截止", check: (r) => r.title === "交周报" && r.endDate === "2026-08-31" && !r.date },
  { input: "今晚8点复盘", label: "今晚+点", check: (r) => r.title === "复盘" && r.date === "2026-08-18" && r.time === "20:00" },
  { input: "3天后交报告", label: "N天后", check: (r) => r.title === "交报告" && r.date === "2026-08-21" },
  { input: "15号交房租", label: "X号过月", check: (r) => r.title === "交房租" && r.date === "2026-09-15" },
  { input: "每月15号交房租", label: "每月X号", check: (r) => r.title === "交房租" && r.repeatRule === "monthly" && r.repeatConfig?.dayOfMonth === 15 },
  { input: "下周三下午三点开会", label: "下周三+下午三点", check: (r) => r.title === "开会" && r.date === "2026-08-26" && r.time === "15:00" },
  { input: "周末大扫除", label: "周末", check: (r) => r.title === "大扫除" && r.date === "2026-08-22" },
  { input: "明天前交材料", label: "明天前截止", check: (r) => r.title === "交材料" && r.endDate === "2026-08-19" },
  { input: "每周一早上9点站会", label: "每周X+时间", check: (r) => r.title === "站会" && r.repeatRule === "weekly" && r.time === "09:00" },
  { input: "每天写日志", label: "每天", check: (r) => r.title === "写日志" && r.repeatRule === "daily" },
  { input: "月底写总结", label: "月底日期", check: (r) => r.title === "写总结" && r.date === "2026-08-31" },
  { input: "加急修复线上问题", label: "同义词优先级", check: (r) => r.priority === "high" && r.title === "加急修复线上问题" },
  { input: "下个月做体检", label: "下个月", check: (r) => r.title === "做体检" && r.date === "2026-09-18" },
  { input: "今晚开周会", label: "今晚单独", check: (r) => r.title === "开周会" && r.date === "2026-08-18" && r.time === "20:00" },
  { input: "下周交方案", label: "下周单周词", check: (r) => r.title === "交方案" && r.date === "2026-08-24" },
  { input: "三点开会", label: "中文数字时间", check: (r) => r.title === "开会" && r.time === "15:00" },
  { input: "每月1号发工资", label: "每月1号", check: (r) => r.title === "发工资" && r.repeatRule === "monthly" && r.repeatConfig?.dayOfMonth === 1 },
  { input: "写个文档", label: "普通标题不误解析", check: (r) => r.title === "写个文档" && !r.date && !r.time && !r.repeatRule && !r.endDate },
];

describe("parseQuickAdd", () => {
  for (const c of cases) {
    it(c.label, () => {
      const r = parseQuickAdd(c.input, base);
      expect(r, `解析 ${c.input} 不应为 null`).not.toBeNull();
      expect(c.check(r!), `解析 ${c.input} 断言失败，got=${JSON.stringify(r)}`).toBe(true);
    });
  }
});
