// 重复规则详细配置（从 TaskForm 拆分，控制单文件行数）
import { Repeat } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RepeatConfig, RepeatRule } from "@/types";

// 星期几选项（0=周日 ... 6=周六）
const WEEKDAY_OPTIONS = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 0, label: "日" },
];

interface RepeatConfigFieldsProps {
  repeatRule: RepeatRule;
  repeatConfig: RepeatConfig;
  onChange: (config: RepeatConfig) => void;
  date: string; // 当前任务开始日期（用于默认月/日）
}

export function RepeatConfigFields({ repeatRule, repeatConfig, onChange, date }: RepeatConfigFieldsProps) {
  const set = (patch: Partial<RepeatConfig>) => onChange({ ...repeatConfig, ...patch });
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Repeat size={13} /> 重复设置
      </div>

      {repeatRule === "daily" && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={!!repeatConfig.workdaysOnly}
            onCheckedChange={(v) => set({ workdaysOnly: !!v })}
          />
          仅工作日（周一至周五）
        </label>
      )}

      {repeatRule === "weekly" && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">选择星期几</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_OPTIONS.map((w) => {
              const active = (repeatConfig.weekdays ?? []).includes(w.value);
              return (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => {
                    const cur = repeatConfig.weekdays ?? [];
                    const next = active ? cur.filter((x) => x !== w.value) : [...cur, w.value];
                    set({ weekdays: next });
                  }}
                  className={`h-8 w-8 rounded-full border text-sm transition-colors ${
                    active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {repeatRule === "monthly" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={!!repeatConfig.dayOfMonth}
              onCheckedChange={(v) =>
                set({
                  dayOfMonth: v ? Number(date.slice(8)) || 1 : undefined,
                  nthWeekday: v ? undefined : repeatConfig.nthWeekday,
                })
              }
            />
            <span>每月第</span>
            <Input
              type="number"
              min={1}
              max={31}
              className="h-8 w-16"
              value={(repeatConfig.dayOfMonth ?? Number(date.slice(8))) || 1}
              disabled={!repeatConfig.dayOfMonth}
              onChange={(e) => set({ dayOfMonth: Number(e.target.value) || 1 })}
            />
            <span>日</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={!!repeatConfig.nthWeekday}
              onCheckedChange={(v) =>
                set({
                  nthWeekday: v ? { nth: 1, weekday: 1 } : undefined,
                  dayOfMonth: v ? undefined : repeatConfig.dayOfMonth,
                })
              }
            />
            <span>每月第</span>
            <Select
              value={String(repeatConfig.nthWeekday?.nth ?? 1)}
              disabled={!repeatConfig.nthWeekday}
              onValueChange={(v) =>
                set({ nthWeekday: { nth: Number(v), weekday: repeatConfig.nthWeekday?.weekday ?? 1 } })
              }
            >
              <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>个</span>
            <Select
              value={String(repeatConfig.nthWeekday?.weekday ?? 1)}
              disabled={!repeatConfig.nthWeekday}
              onValueChange={(v) =>
                set({ nthWeekday: { nth: repeatConfig.nthWeekday?.nth ?? 1, weekday: Number(v) } })
              }
            >
              <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEEKDAY_OPTIONS.map((w) => (
                  <SelectItem key={w.value} value={String(w.value)}>周{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {repeatRule === "yearly" && (
        <div className="flex items-center gap-2 text-sm">
          <span>每年</span>
          <Input
            type="number"
            min={1}
            max={12}
            className="h-8 w-16"
            value={(repeatConfig.yearMonth ?? Number(date.slice(5, 7))) || 1}
            onChange={(e) => set({ yearMonth: Number(e.target.value) || 1 })}
          />
          <span>月</span>
          <Input
            type="number"
            min={1}
            max={31}
            className="h-8 w-16"
            value={(repeatConfig.yearDay ?? Number(date.slice(8))) || 1}
            onChange={(e) => set({ yearDay: Number(e.target.value) || 1 })}
          />
          <span>日</span>
        </div>
      )}

      {repeatRule === "custom" && (
        <div className="flex items-center gap-2 text-sm">
          <span>每</span>
          <Input
            type="number"
            min={1}
            className="h-8 w-16"
            value={repeatConfig.interval ?? 1}
            onChange={(e) => set({ interval: Number(e.target.value) || 1 })}
          />
          <Select
            value={repeatConfig.unit ?? "day"}
            onValueChange={(v) => set({ unit: v as RepeatConfig["unit"] })}
          >
            <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">天</SelectItem>
              <SelectItem value="week">周</SelectItem>
              <SelectItem value="month">月</SelectItem>
              <SelectItem value="year">年</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-xs text-muted-foreground">按日期结束</span>
        <Input
          type="date"
          className="h-8 flex-1"
          value={repeatConfig.endDate ?? ""}
          min={date}
          onChange={(e) => set({ endDate: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}
