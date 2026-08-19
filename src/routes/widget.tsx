// 桌面月历挂件（Tauri 第二个透明置顶窗口，路由 /widget）
// 只读展示：当月月历 + 任务圆点 + 今日高亮；数据与主窗口共享（同一 origin 的 localStorage）
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { addDays, addMonths, format, isSameDay, startOfMonth, startOfWeek } from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { usePlannerStore } from "@/store/plannerStore";
import { loadStorage } from "@/lib/storage";
import { taskVisibleOnDate, todayStr } from "@/lib/date";
import { expandRecurringTasks } from "@/lib/repeat";
import { isTauri, showMainWindow, toggleWidget } from "@/lib/tauri";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function WidgetCalendar() {
  const tasks = usePlannerStore((s) => s.tasks);
  const recurringInstances = usePlannerStore((s) => s.recurringInstances);
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => todayStr());

  // 挂件窗口背景透明（覆盖 index.html 的 body 背景），仅对本窗口文档生效
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = "html.light body, html.dark body { background: transparent !important; }";
    document.head.appendChild(style);
    // 跟随主窗口主题
    const applyTheme = () => {
      const t = localStorage.getItem("planner-theme") === "dark" ? "dark" : "light";
      document.documentElement.classList.toggle("dark", t === "dark");
    };
    applyTheme();
    window.addEventListener("storage", applyTheme);
    return () => {
      style.remove();
      window.removeEventListener("storage", applyTheme);
    };
  }, []);

  // 数据实时同步：主窗口写 localStorage 后，本窗口触发 storage 事件 → 重载 store
  useEffect(() => {
    const onStorage = () => {
      const s = loadStorage();
      usePlannerStore.setState({ tasks: s.tasks, goals: s.goals, recurringInstances: s.recurringInstances });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 当月 6x7 网格（从首日所在周的周日开始）
  const days = useMemo(() => {
    const first = startOfMonth(cursor);
    const weekStart = startOfWeek(first, { weekStartsOn: 0 });
    return Array.from({ length: 42 }, (_, i) => addDays(weekStart, i));
  }, [cursor]);

  const rangeStart = format(days[0], "yyyy-MM-dd");
  const rangeEnd = format(days[41], "yyyy-MM-dd");

  // 展开重复任务（含虚拟实例）后统计每日任务数
  const expanded = useMemo(
    () => expandRecurringTasks(tasks, rangeStart, rangeEnd, recurringInstances),
    [tasks, rangeStart, rangeEnd, recurringInstances]
  );
  const countOn = (d: Date) =>
    expanded.filter((t) => taskVisibleOnDate(t, format(d, "yyyy-MM-dd"))).length;

  const openMain = () => {
    if (!isTauri) return;
    void showMainWindow();
  };
  const hideWidget = () => {
    if (!isTauri) return;
    void toggleWidget();
  };

  const selectedCount = countOn(new Date(`${selected}T00:00:00`));

  return (
    <div className="m-2 select-none overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur">
      {/* 拖拽条 */}
      <div
        className="flex h-9 items-center justify-between border-b border-border/50 pl-2.5 pr-1"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CalendarRange size={13} className="text-primary" /> 工作计划
        </span>
        {isTauri && (
          <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
            <button
              type="button"
              onClick={openMain}
              title="打开主界面"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ExternalLink size={13} />
            </button>
            <button
              type="button"
              onClick={hideWidget}
              title="隐藏挂件"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* 月份导航 */}
      <div className="flex items-center justify-between px-2 pb-1 pt-2">
        <button
          type="button"
          onClick={() => setCursor((c) => addMonths(c, -1))}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          aria-label="上一月"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-medium">{format(cursor, "yyyy年M月")}</span>
        <button
          type="button"
          onClick={() => setCursor((c) => addMonths(c, 1))}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          aria-label="下一月"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* 星期表头 */}
      <div className="grid grid-cols-7 px-2 text-center text-[10px] text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-0.5">{w}</div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-y-0.5 px-2 pb-1 pt-0.5">
        {days.map((d, i) => {
          const ds = format(d, "yyyy-MM-dd");
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = ds === todayStr();
          const isSelected = ds === selected;
          const count = countOn(d);
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(ds)}
              className={`relative flex h-[34px] flex-col items-center justify-center rounded-lg text-xs transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              } ${inMonth ? "" : "opacity-35"}`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                  isToday && !isSelected ? "bg-primary/15 font-semibold text-primary" : ""
                }`}
              >
                {d.getDate()}
              </span>
              <span className="mt-0.5 flex h-1 items-center gap-0.5">
                {count > 0 &&
                  Array.from({ length: Math.min(count, 3) }).map((_, k) => (
                    <span
                      key={k}
                      className={`h-1 w-1 rounded-full ${isSelected ? "bg-primary-foreground/80" : "bg-primary/70"}`}
                    />
                  ))}
              </span>
            </button>
          );
        })}
      </div>

      {/* 底部：选中日期任务数 */}
      <div className="border-t border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground">
        {format(new Date(`${selected}T00:00:00`), "M月d日")} 共{" "}
        <span className="font-medium text-foreground">{selectedCount}</span> 项任务
      </div>
    </div>
  );
}

export const Route = createFileRoute("/widget")({
  component: WidgetCalendar,
});
