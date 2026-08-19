// 自然语言快速添加解析（对标滴答清单/Todoist）
// 语法：标题 + 可选 [日期] [时间] [#标签] [!!优先级] [重复规则] [截止]
// 例：明天下午3点开会 #工作 !!高 / 每周一跑步 / 月底前交周报 / 今晚8点复盘
import { addDays, addMonths, parseISO } from "date-fns";
import type { Priority, RepeatConfig, RepeatRule } from "../types";
import { toDateStr } from "./date";

export interface QuickAddResult {
  title: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  priority?: Priority;
  tags: string[];
  endDate?: string; // YYYY-MM-DD（截止，如「周五前」「月底前」）
  repeatRule?: RepeatRule;
  repeatConfig?: RepeatConfig;
}

const WEEKDAY_MAP: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

const CN_NUM: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};
const CN_RE = "[0-9一二两三四五六七八九十]+";

/** 中文数字 → 阿拉伯数字（支持 0-99） */
function cnToNum(s: string): number | undefined {
  if (/^\d+$/.test(s)) return Number(s);
  if (s in CN_NUM) return CN_NUM[s];
  const m = s.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/);
  if (m) return (m[1] ? CN_NUM[m[1]] : 1) * 10 + (m[2] ? CN_NUM[m[2]] : 0);
  return undefined;
}

/** 周X 日期：本周/下周/上周的某星期（以周日为自然周起点，0=周日） */
function weekDate(base: Date, prefix: string | undefined, weekday: number): string {
  const baseDay = base.getDay();
  let offset = -baseDay + weekday;
  if (prefix === "下") offset += 7;
  if (prefix === "上") offset -= 7;
  return toDateStr(addDays(base, offset));
}

/** 解析日期 token（含中文数字与相对偏移），失败返回 undefined */
function parseDateToken(token: string, base: Date): string | undefined {
  const t = token.trim();
  if (!t) return undefined;

  if (t === "今天") return toDateStr(base);
  if (t === "明天") return toDateStr(addDays(base, 1));
  if (t === "后天") return toDateStr(addDays(base, 2));
  if (t === "大后天") return toDateStr(addDays(base, 3));
  if (t === "前天") return toDateStr(addDays(base, -2));

  // 下周 / 本周 / 上周（默认周一）
  if (t === "下周") return weekDate(base, "下", 1);
  if (t === "本周") return toDateStr(base);
  if (t === "上周") return weekDate(base, "上", 1);

  // 周末 / 这周末 → 本周六；下周末 → 下周六
  if (t === "周末" || t === "这周末") return weekDate(base, undefined, 6);
  if (t === "下周末") return weekDate(base, "下", 6);

  // 下个月 / 下月 / 月初 / 月底
  if (t === "下个月" || t === "下月") return toDateStr(addMonths(base, 1));
  if (t === "月初") return toDateStr(new Date(base.getFullYear(), base.getMonth(), 1));
  if (t === "月底") return toDateStr(new Date(base.getFullYear(), base.getMonth() + 1, 0));

  // (下|本|上)周X
  const wk = t.match(/^(下|本|上)?周([日天一二三四五六])$/);
  if (wk) return weekDate(base, wk[1], WEEKDAY_MAP[wk[2]]);

  // N天后
  const after = t.match(new RegExp(`^(${CN_RE})天后?$`));
  if (after) {
    const n = cnToNum(after[1]);
    if (n != null) return toDateStr(addDays(base, n));
  }

  // X月X日（中文数字亦可），已过则明年
  const md = t.match(new RegExp(`^(${CN_RE})月(${CN_RE})[号日]?$`));
  if (md) {
    const mo = cnToNum(md[1]);
    const d = cnToNum(md[2]);
    if (mo != null && d != null && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(base.getFullYear(), mo - 1, d);
      if (dt < base) dt.setFullYear(dt.getFullYear() + 1);
      return toDateStr(dt);
    }
  }

  // X号 / X日（当月，已过则下月）
  const dom = t.match(new RegExp(`^(${CN_RE})[号日]$`));
  if (dom) {
    const d = cnToNum(dom[1]);
    if (d != null && d >= 1 && d <= 31) {
      const dt = new Date(base.getFullYear(), base.getMonth(), d);
      if (dt < base) dt.setMonth(dt.getMonth() + 1);
      return toDateStr(dt);
    }
  }

  // YYYY-MM-DD
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const d = parseISO(`${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return toDateStr(d);
  }

  return undefined;
}

/** 解析时间 token（含中文数字与时段词）；时段词附带默认日期（今晚/明晚） */
function parseTimeToken(
  token: string,
  base: Date
): { time: string; impliedDate?: string } | undefined {
  const t = token.trim();

  // HH:mm 或 H:mm
  const hm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
    }
  }

  // 时段 + X点(半)：今晚/明晚/傍晚/凌晨/上午/早上/下午/晚上/中午（中文数字亦可）
  const cn = t.match(new RegExp(`^(今晚|明晚|傍晚|凌晨|上午|早上|下午|晚上|中午)?(${CN_RE})点(半)?$`));
  if (cn) {
    let h = cnToNum(cn[2]);
    const period = cn[1];
    if (h == null || h > 24) return undefined;
    if (period === "下午" || period === "晚上" || period === "傍晚") {
      if (h < 12) h += 12;
    } else if (period === "中午") {
      if (h < 12) h += 12;
    } else if (period === "今晚" || period === "明晚") {
      if (h < 12) h += 12;
    } else if (!period) {
      // 无前缀：1-6 点视为下午/晚上
      if (h >= 1 && h <= 6) h += 12;
    }
    const m = cn[3] ? 30 : 0;
    if (h >= 0 && h <= 23) {
      const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const impliedDate =
        period === "今晚" || period === "明晚"
          ? toDateStr(addDays(base, period === "明晚" ? 1 : 0))
          : undefined;
      return { time, impliedDate };
    }
  }

  // 单独时段词：今晚/明晚 → 20:00，傍晚 → 18:00
  if (t === "今晚" || t === "明晚" || t === "傍晚") {
    return {
      time: t === "傍晚" ? "18:00" : "20:00",
      impliedDate: t === "明晚" ? toDateStr(addDays(base, 1)) : toDateStr(base),
    };
  }

  return undefined;
}

interface RepeatMatch {
  rule: RepeatRule;
  config: RepeatConfig;
}

/** 提取重复规则（每天/每日/工作日/每周X/每周末/每月X号） */
function parseRepeatToken(title: string): { match: RepeatMatch; rest: string } | null {
  let m: RegExpMatchArray | null;
  m = title.match(/每(?:周|个)?工作日/);
  if (m) return { match: { rule: "daily", config: { workdaysOnly: true } }, rest: title.replace(m[0], "").trim() };
  m = title.match(/每(?:天|日)/);
  if (m) return { match: { rule: "daily", config: {} }, rest: title.replace(m[0], "").trim() };
  m = title.match(/每周末/);
  if (m) return { match: { rule: "weekly", config: { weekdays: [6] } }, rest: title.replace(m[0], "").trim() };
  m = title.match(/每周([日天一二三四五六])/);
  if (m) return { match: { rule: "weekly", config: { weekdays: [WEEKDAY_MAP[m[1]]] } }, rest: title.replace(m[0], "").trim() };
  m = title.match(new RegExp(`每月(${CN_RE})[号日]`));
  if (m) {
    const d = cnToNum(m[1]);
    if (d != null && d >= 1 && d <= 31) {
      return { match: { rule: "monthly", config: { dayOfMonth: d } }, rest: title.replace(m[0], "").trim() };
    }
  }
  return null;
}

/** 截止日期候选 token（X前；顺序敏感：长 token 在前） */
const DEADLINE_TOKEN = [
  "今天", "明天", "后天", "大后天",
  "(?:下|本|上)?周末",
  "(?:下|本|上)?周[日天一二三四五六]",
  "下周", "本周", "上周",
  "月底", "月初",
  "(?:下|本|上)?个月",
  "(?:下|本|上)?月",
  `${CN_RE}月${CN_RE}[号日]?`,
  `${CN_RE}[号日]`,
].join("|");

/** 提取截止（「周五前」「月底前」「15号前」） */
function parseDeadline(title: string, base: Date): { endDate: string; rest: string } | null {
  const m = title.match(new RegExp(`(${DEADLINE_TOKEN})前`));
  if (m) {
    const d = parseDateToken(m[1], base);
    if (d) return { endDate: d, rest: title.replace(m[0], "").trim() };
  }
  return null;
}

/** 日期候选 token（顺序敏感：长 token 在前） */
const DATE_TOKEN = [
  "今天", "明天", "后天", "大后天", "前天",
  "(?:下|本|上)?周末",
  "(?:下|本|上)?周[日天一二三四五六]",
  "下周", "本周", "上周",
  "月底", "月初",
  "(?:下|本|上)?个月",
  "(?:下|本|上)?月",
  "\\d{4}-\\d{1,2}-\\d{1,2}",
  `${CN_RE}月${CN_RE}[号日]?`,
  `${CN_RE}天后?`,
  `${CN_RE}[号日]`,
].join("|");

/** 时间候选 token（时段+点 优先，其次 HH:mm，最后单独时段词） */
const TIME_TOKEN = `(今晚|明晚|傍晚|凌晨|上午|早上|下午|晚上|中午)?${CN_RE}点(半)?|\\d{1,2}:\\d{2}|今晚|明晚|傍晚`;

/**
 * 解析自然语言输入。
 * 返回 null 表示无法解析出有效标题。
 * 注意：解析失败的 token 不会被从标题中移除（避免截断语义）。
 */
export function parseQuickAdd(input: string, baseDate = new Date()): QuickAddResult | null {
  const text = input.trim();
  if (!text) return null;

  let title = text;
  const result: QuickAddResult = { title, tags: [] };

  // 1. 优先级：!!高/!!中/!!低 或 同义词（紧急/加急/重要 → 高；次要/不急 → 低）
  const prioMatch = title.match(/!!(高|中|低)/);
  if (prioMatch) {
    result.priority = prioMatch[1] === "高" ? "high" : prioMatch[1] === "中" ? "medium" : "low";
    title = title.replace(prioMatch[0], "").trim();
  } else if (/紧急|加急|重要/.test(title)) {
    result.priority = "high";
  } else if (/次要|不急/.test(title)) {
    result.priority = "low";
  }

  // 2. 标签：#xxx（可多个）
  (title.match(/#([^\s#]+)/g) ?? []).forEach((m) => {
    const tag = m.slice(1).trim();
    if (tag) result.tags.push(tag);
  });
  title = title.replace(/#[^\s#]+/g, "").trim();

  // 3. 重复规则（每天/每周X/每月X号/工作日）
  const rep = parseRepeatToken(title);
  if (rep) {
    result.repeatRule = rep.match.rule;
    result.repeatConfig = rep.match.config;
    title = rep.rest;
  }

  // 4. 截止（X前）→ endDate
  const dl = parseDeadline(title, baseDate);
  if (dl) {
    result.endDate = dl.endDate;
    title = dl.rest;
  }

  // 5. 日期
  const dateMatch = title.match(new RegExp(DATE_TOKEN));
  if (dateMatch) {
    const d = parseDateToken(dateMatch[0], baseDate);
    if (d) {
      result.date = d;
      title = title.replace(dateMatch[0], "").trim();
    }
  }

  // 6. 时间（含时段词；今晚/明晚 未定日期时补默认日期）
  const timeMatch = title.match(new RegExp(TIME_TOKEN));
  if (timeMatch) {
    const t = parseTimeToken(timeMatch[0], baseDate);
    if (t) {
      result.time = t.time;
      title = title.replace(timeMatch[0], "").trim();
      if (t.impliedDate && !result.date) result.date = t.impliedDate;
    }
  }

  // 7. 清理多余空格
  title = title.replace(/\s+/g, " ").trim();
  result.title = title;

  if (!title) return null;
  return result;
}

/** 生成快速添加框的提示文案 */
export function quickAddPlaceholder(): string {
  return "快速添加：明天下午3点开会 #工作 !!高，试试「每周一跑步」「月底前交周报」";
}
