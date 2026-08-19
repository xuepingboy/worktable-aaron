// 农历/节气/节假日工具测试（lunar-typescript 内置 2026 年放假安排数据）
import { describe, expect, it } from "vitest";
import { dayCellLabel, dayDetailText, getDayLunarInfo } from "./lunarInfo";

describe("lunarInfo", () => {
  it("普通日：返回农历月日，无节日/节气", () => {
    const info = getDayLunarInfo("2026-08-25");
    expect(info.lunarDay).toBe("十三");
    expect(info.lunarMonth).toBe("七月");
    expect(info.jieQi).toBe("");
    expect(info.holiday).toBeNull();
    expect(dayCellLabel(info)).toEqual({ text: "十三", kind: "lunar" });
  });

  it("农历节日：七夕节", () => {
    const info = getDayLunarInfo("2026-08-19"); // 七月初七
    expect(info.festival).toContain("七夕");
    expect(dayCellLabel(info).kind).toBe("festival");
  });

  it("法定节假日：国庆节放假", () => {
    const info = getDayLunarInfo("2026-10-01");
    expect(info.holiday).toEqual({ name: "国庆节", work: false });
    const label = dayCellLabel(info);
    expect(label.kind).toBe("holiday");
    expect(label.text).toBe("国庆");
    expect(dayDetailText("2026-10-01")).toContain("放假·国庆节");
  });

  it("调休上班日：国庆后周六补班标记「班」", () => {
    const info = getDayLunarInfo("2026-10-10");
    expect(info.holiday?.work).toBe(true);
    expect(dayCellLabel(info)).toEqual({ text: "班", kind: "workday" });
    expect(dayDetailText("2026-10-10")).toContain("调休上班");
  });

  it("节气：立秋", () => {
    const info = getDayLunarInfo("2026-08-07");
    expect(info.jieQi).toBe("立秋");
    expect(dayCellLabel(info)).toEqual({ text: "立秋", kind: "festival" });
  });

  it("includeHoliday=false 时详情不含放假/调休段", () => {
    expect(dayDetailText("2026-10-01", false)).not.toContain("放假");
    expect(dayDetailText("2026-10-10", false)).not.toContain("调休");
  });

  it("2 字节日保留原名（春节）", () => {
    expect(dayCellLabel(getDayLunarInfo("2026-02-17"))).toEqual({ text: "春节", kind: "holiday" });
  });
});
