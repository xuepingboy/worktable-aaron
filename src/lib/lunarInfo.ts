// 农历 / 节气 / 中国法定节假日与调休工具（挂件月历用）
// 基于 lunar-typescript（内置 2026 年及以后国务院放假安排数据）
import { HolidayUtil, Solar } from "lunar-typescript";

export interface DayLunarInfo {
  /** 农历日，如「初七」；初一返回「初一」 */
  lunarDay: string;
  /** 农历月，如「七月」；正月返回「正月」 */
  lunarMonth: string;
  /** 节气名（当天是节气日时），如「立秋」；否则空串 */
  jieQi: string;
  /** 农历节日（如 春节/七夕节），优先取第一个 */
  festival: string;
  /** 公历节日（如 元旦节/劳动节），优先取第一个 */
  solarFestival: string;
  /** 法定节假日（含调休）；work=true 表示调休上班日 */
  holiday: { name: string; work: boolean } | null;
}

const cache = new Map<string, DayLunarInfo>();

/** 获取某天（yyyy-MM-dd）的农历/节气/节日/调休信息；结果缓存 */
export function getDayLunarInfo(dateStr: string): DayLunarInfo {
  const cached = cache.get(dateStr);
  if (cached) return cached;

  const [y, m, d] = dateStr.split("-").map(Number);
  const solar = Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();

  const holidays = HolidayUtil.getHolidays(dateStr);
  const holiday = holidays && holidays.length > 0 ? holidays[0] : null;

  const info: DayLunarInfo = {
    lunarDay: lunar.getDayInChinese(),
    lunarMonth: `${lunar.getMonthInChinese()}月`,
    jieQi: lunar.getJieQi(),
    festival: lunar.getFestivals()[0] ?? "",
    solarFestival: solar.getFestivals()[0] ?? "",
    holiday: holiday
      ? { name: holiday.getName(), work: holiday.isWork() }
      : null,
  };
  cache.set(dateStr, info);
  return info;
}

/** 在日格内显示的小字：优先节假日（含调休「班」标），其次节气/节日，最后农历日 */
export function dayCellLabel(info: DayLunarInfo): {
  text: string;
  kind: "holiday" | "workday" | "festival" | "lunar";
} {
  if (info.holiday) {
    if (info.holiday.work) return { text: "班", kind: "workday" };
    const name = info.holiday.name;
    // 3 字以上去「节」后缀（国庆节→国庆）；2 字保留原名（春节、中秋）
    return { text: name.length <= 2 ? name : name.replace(/节$/, ""), kind: "holiday" };
  }
  if (info.jieQi) return { text: info.jieQi, kind: "festival" };
  if (info.festival) return { text: info.festival, kind: "festival" };
  if (info.solarFestival) return { text: info.solarFestival, kind: "festival" };
  return { text: info.lunarDay, kind: "lunar" };
}

/** 底部详情：完整的农历 + 节假日说明（includeHoliday=false 时去掉放假/调休段） */
export function dayDetailText(dateStr: string, includeHoliday = true): string {
  const info = getDayLunarInfo(dateStr);
  const parts: string[] = [`农历${info.lunarMonth}${info.lunarDay}`];
  if (info.jieQi) parts.push(info.jieQi);
  if (info.festival) parts.push(`节日·${info.festival}`);
  if (info.solarFestival) parts.push(`节日·${info.solarFestival}`);
  if (includeHoliday && info.holiday) {
    parts.push(info.holiday.work ? "调休上班" : `放假·${info.holiday.name}`);
  }
  return parts.join(" | ");
}
