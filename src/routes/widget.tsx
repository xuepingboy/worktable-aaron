// 桌面月历挂件（Tauri 第二个透明置顶窗口，路由 /widget）
// 日格显示「任务名（优先级底色）+ 农历/节气/节假日/调休」，双击日格弹快捷浮窗（完成/改名/删除）
// 设置：字体大小 / 透明度 / 日历底色 / 显示农历 / 显示节假日调休 / 贴桌面（桌面端）
// 数据与主窗口共享（同一 origin 的 localStorage），storage 事件实时同步
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { addDays, addMonths, format, startOfMonth, startOfWeek } from "date-fns";
import {
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pencil,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { usePlannerStore } from "@/store/plannerStore";
import { loadStorage } from "@/lib/storage";
import { taskVisibleOnDate, todayStr } from "@/lib/date";
import { expandRecurringTasks } from "@/lib/repeat";
import { PRIORITY_BG } from "@/lib/utils";
import { dayCellLabel, dayDetailText, getDayLunarInfo } from "@/lib/lunarInfo";
import { isTauri, setWidgetStick, showMainWindow, startWidgetResize, toggleWidget } from "@/lib/tauri";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const SETTINGS_KEY = "planner-widget-settings";
// 动态行数计算常量（与下方 tailwind 类对应）：
// 网格 gap-y-0.5 = 2px；格子内：py-0.5(上下各2px) + 日号行 h-4(16px) + mt-0.5(2px)；
// 任务行 line-height 1.35×fontSize + gap-px(1px)
const GRID_ROW_GAP = 2;
const CELL_HEADER_OFFSET = 22;
const MAX_LINES_CAP = 6;

interface WidgetSettings {
  fontSize: number; // 任务名字号 9~15
  opacity: number; // 卡片不透明度 0.35~1
  bg: string; // "default" 跟随主题 | hex 自定义底色
  showLunar: boolean; // 显示农历/节气/节日小字
  showHoliday: boolean; // 显示法定节假日与调休（依赖 showLunar 开启才有空间）
  stick: boolean; // 贴桌面（Windows）
  frame: boolean; // 显示前端卡片边框+阴影
}

const DEFAULT_SETTINGS: WidgetSettings = {
  fontSize: 9,
  opacity: 0.95,
  bg: "default",
  showLunar: true,
  showHoliday: true,
  stick: false,
  frame: false,
};

const BG_PRESETS: { key: string; label: string; color: string }[] = [
  { key: "default", label: "默认", color: "" },
  { key: "#ffffff", label: "白", color: "#ffffff" },
  { key: "#e8f4fc", label: "浅蓝", color: "#e8f4fc" },
  { key: "#fdf6e3", label: "米黄", color: "#fdf6e3" },
  { key: "#eef7ee", label: "浅绿", color: "#eef7ee" },
  { key: "#333333", label: "深灰", color: "#333333" },
];

function loadSettings(): WidgetSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function WidgetCalendar() {
  const tasks = usePlannerStore((s) => s.tasks);
  const recurringInstances = usePlannerStore((s) => s.recurringInstances);
  const toggleTask = usePlannerStore((s) => s.toggleTask);
  const updateTask = usePlannerStore((s) => s.updateTask);
  const deleteTask = usePlannerStore((s) => s.deleteTask);
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => todayStr());
  const [openDay, setOpenDay] = useState<string | null>(null); // 双击弹出的日格
  const [editingId, setEditingId] = useState<string | null>(null); // 行内编辑任务
  const [editValue, setEditValue] = useState("");
  const [settings, setSettings] = useState<WidgetSettings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridH, setGridH] = useState(300); // 日期网格容器实测高度（px），窗口拉伸时更新

  // 挂件窗口背景透明：必须覆盖 html 自身（index.html 给 html.light/html.dark 刷了 !important 背景色）
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = "html, html.light, html.dark, body, #root { background: transparent !important; }";
    document.head.appendChild(style);
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

  // 设置持久化 + 贴桌面同步（桌面端）
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (isTauri) void setWidgetStick(settings.stick);
  }, [settings]);

  // 数据实时同步：主窗口写 localStorage 后触发 storage 事件 → 重载 store
  useEffect(() => {
    const onStorage = () => {
      const s = loadStorage();
      usePlannerStore.setState({ tasks: s.tasks, goals: s.goals, recurringInstances: s.recurringInstances });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 监听日期网格容器高度（窗口拉伸/字体变化时重算），决定每格可显示的任务行数
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setGridH(e.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 当月 6x7 网格
  const days = useMemo(() => {
    const first = startOfMonth(cursor);
    const weekStart = startOfWeek(first, { weekStartsOn: 0 });
    return Array.from({ length: 42 }, (_, i) => addDays(weekStart, i));
  }, [cursor]);

  const rangeStart = format(days[0], "yyyy-MM-dd");
  const rangeEnd = format(days[41], "yyyy-MM-dd");
  const expanded = useMemo(
    () => expandRecurringTasks(tasks, rangeStart, rangeEnd, recurringInstances),
    [tasks, rangeStart, rangeEnd, recurringInstances]
  );
  const dayTasks = (ds: string) => expanded.filter((t) => taskVisibleOnDate(t, ds));

  // 根据日格实际高度动态计算可显示的任务行数（日格越大行数越多）
  const maxNameLines = useMemo(() => {
    const cellH = (gridH - (6 - 1) * GRID_ROW_GAP) / 6; // 单格高度
    const avail = cellH - CELL_HEADER_OFFSET; // 任务区可用高度
    const lineH = settings.fontSize * 1.35 + 1; // 单行任务高度（line-height + gap-px）
    const n = Math.floor((avail + 1) / lineH); // N 行需 N*lineH-1，反推 N
    return Math.max(1, Math.min(MAX_LINES_CAP, n));
  }, [gridH, settings.fontSize]);

  const openMain = () => {
    if (!isTauri) return;
    void showMainWindow();
  };
  const hideWidget = () => {
    if (!isTauri) return;
    void toggleWidget();
  };

  const saveEdit = () => {
    if (editingId && editValue.trim()) {
      updateTask(editingId, { title: editValue.trim() });
    }
    setEditingId(null);
  };

  const popupTasks = openDay ? dayTasks(openDay) : [];
  const selectedInfo = getDayLunarInfo(selected);

  // 卡片底色：frame=true 时跟随主题（css 变量 + 透明度）或自定义 hex；
  // frame=false（无边框模式）时背景完全透明，仅文字/网格悬浮在桌面上，消除白底/白边
  const cardStyle: CSSProperties = settings.frame
    ? settings.bg === "default"
      ? {
          backgroundColor: `color-mix(in srgb, var(--background) ${Math.round(
            settings.opacity * 100
          )}%, transparent)`,
        }
      : { backgroundColor: hexToRgba(settings.bg, settings.opacity) }
    : {};

  const patch = (p: Partial<WidgetSettings>) => setSettings((s) => ({ ...s, ...p }));

  return (
    <div
      className={`absolute inset-2 flex select-none flex-col overflow-hidden rounded-2xl ${
        settings.frame ? "backdrop-blur border border-border/70 shadow-2xl" : ""
      }`}
      style={cardStyle}
    >
      {/* 拖拽条 */}
      <div
        className={`flex h-9 items-center justify-between pl-2.5 pr-1 ${
          settings.frame ? "border-b border-border/50" : ""
        }`}
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
        {/* 设置入口（Web 也可调，便于预览） */}
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          title="挂件设置"
          className={`rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${
            settingsOpen ? "bg-muted text-foreground" : ""
          }`}
        >
          <Settings size={13} />
        </button>
      </div>

      {/* 月份导航 */}
      <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
        <button
          type="button"
          onClick={() => setCursor((c) => addMonths(c, -1))}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          aria-label="上一月"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-medium">
          {format(cursor, "yyyy年M月")}
          <span className="ml-1.5 text-[10px] text-muted-foreground">
            {getDayLunarInfo(format(cursor, "yyyy-MM-01")).lunarMonth}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setCursor((c) => addMonths(c, 1))}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          aria-label="下一月"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* 表头 + 日期网格（flex-1 随窗口/视口高度自适应） */}
      <div className="flex min-h-0 flex-1 flex-col px-2">
        {/* 星期表头 */}
        <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-0.5">{w}</div>
          ))}
        </div>

        {/* 日期网格：日号 + 数量气泡 + 农历/节日小字 + 任务名（优先级底色） */}
        <div
          ref={gridRef}
          className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-y-0.5 pb-1 pt-0.5"
        >
        {days.map((d, i) => {
          const ds = format(d, "yyyy-MM-dd");
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = ds === todayStr();
          const list = dayTasks(ds);
          const shown = list.slice(0, maxNameLines);
          const extra = list.length - shown.length;
          // 格内小字：showLunar 总开关；showHoliday=false 时法定假日/调休退回普通农历小字
          let cell: { text: string; kind: "holiday" | "workday" | "festival" | "lunar" } | null = null;
          if (settings.showLunar) {
            const info = getDayLunarInfo(ds);
            const raw = dayCellLabel(info);
            cell =
              !settings.showHoliday && (raw.kind === "holiday" || raw.kind === "workday")
                ? { text: info.lunarDay, kind: "lunar" }
                : raw;
          }
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              title={
                settings.showLunar
                  ? `${ds} · ${dayDetailText(ds, settings.showHoliday)}${
                      list.length ? ` · ${list.length} 项任务` : ""
                    }`
                  : `${ds}${list.length ? ` · ${list.length} 项任务` : ""}`
              }
              onClick={() => setSelected(ds)}
              onDoubleClick={() => setOpenDay(ds)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setOpenDay(ds);
              }}
              className={`flex min-h-0 cursor-pointer flex-col overflow-hidden rounded-lg px-1 py-0.5 text-left transition-colors ${
                ds === selected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted"
              } ${inMonth ? "" : "opacity-35"}`}
            >
              <div className="flex items-center justify-between gap-0.5">
                <span className="flex min-w-0 items-center gap-0.5">
                  <span
                    className={`flex h-4 min-w-4 items-center justify-center rounded px-0.5 text-[10px] leading-none ${
                      isToday ? "bg-primary font-semibold text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {extra > 0 && (
                    <span
                      title={`还有 ${extra} 项任务`}
                      className="shrink-0 rounded-full bg-primary/15 px-1 text-[8px] font-semibold leading-[14px] text-primary"
                    >
                      +{extra}
                    </span>
                  )}
                </span>
                {cell && settings.showLunar && (
                  <span
                    style={{ fontSize: Math.max(settings.fontSize - 2, 7) }}
                    className={`truncate leading-none ${
                      cell.kind === "holiday"
                        ? "font-medium text-red-500"
                        : cell.kind === "workday"
                          ? "rounded bg-green-100 px-0.5 font-semibold text-green-700 dark:bg-green-500/30 dark:text-green-300"
                          : cell.kind === "festival"
                            ? "font-medium text-primary"
                            : "text-muted-foreground"
                    }`}
                  >
                    {cell.text}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex min-h-0 flex-1 flex-col gap-px">
                {shown.map((t) => (
                  <span
                    key={t.id}
                    style={{ fontSize: settings.fontSize }}
                    className={`truncate rounded px-0.5 leading-[1.35] ${
                      t.status === "done" ? "opacity-60 line-through" : ""
                    } ${PRIORITY_BG[t.priority]}`}
                  >
                    {t.title}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* 底部：选中日期任务数 + 农历/节日详情 */}
      <div className={`px-3 pb-1.5 pr-6 pt-1.5 text-[11px] leading-snug text-muted-foreground ${
        settings.frame ? "border-t border-border/50" : ""
      }`}>
        <div className="flex items-center justify-between">
          <span>
            {format(new Date(`${selected}T00:00:00`), "M月d日")} 共{" "}
            <span className="font-medium text-foreground">{dayTasks(selected).length}</span> 项任务
          </span>
          <span className="opacity-70">双击日格快捷操作</span>
        </div>
        {settings.showLunar && (
          <div className="mt-0.5 truncate text-[10px] text-primary/80">
            {dayDetailText(selected, settings.showHoliday)}
          </div>
        )}
      </div>

      {/* 右下角 resize 手柄（无边框窗口用，拖拽调整挂件大小） */}
      {isTauri && (
        <button
          type="button"
          onPointerDown={() => void startWidgetResize()}
          title="拖拽调整挂件大小"
          aria-label="调整挂件大小"
          className="absolute bottom-1 right-1 z-10 cursor-se-resize p-1.5 text-muted-foreground/40 transition-colors hover:text-primary"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <span className="block h-0 w-0 border-b-[7px] border-l-[7px] border-b-transparent border-l-current" />
        </button>
      )}

      {/* 快捷小浮窗：双击日格弹出（居中，非全屏） */}
      {openDay && (
        <>
          <div className="absolute inset-0 z-10 bg-black/10" onClick={() => setOpenDay(null)} />
          <div className="absolute left-1/2 top-1/2 z-20 flex max-h-[240px] w-[272px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
              <span className="text-xs font-medium">
                {format(new Date(`${openDay}T00:00:00`), "M月d日")} · {popupTasks.length} 项
              </span>
              <button
                type="button"
                onClick={() => setOpenDay(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="关闭"
              >
                <X size={13} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {popupTasks.length === 0 ? (
                <div className="py-5 text-center text-xs text-muted-foreground">这一天没有任务</div>
              ) : (
                <ul className="space-y-0.5">
                  {popupTasks.map((t) => (
                    <li key={t.id} className="group flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-muted">
                      <button
                        type="button"
                        onClick={() => toggleTask(t.id)}
                        title={t.status === "done" ? "标记未完成" : "完成任务"}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          t.status === "done"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:border-primary"
                        }`}
                      >
                        {t.status === "done" && <Check size={10} />}
                      </button>
                      {editingId === t.id ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          maxLength={200}
                          className="h-6 min-w-0 flex-1 rounded border border-primary/50 bg-transparent px-1.5 text-xs outline-none"
                        />
                      ) : (
                        <span
                          className={`min-w-0 flex-1 truncate text-xs ${
                            t.status === "done" ? "text-muted-foreground line-through" : ""
                          }`}
                        >
                          {t.title}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(t.id);
                          setEditValue(t.title);
                        }}
                        title="编辑"
                        className="rounded p-1 text-muted-foreground opacity-0 hover:bg-background group-hover:opacity-100"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`删除任务「${t.title}」？`)) deleteTask(t.id);
                        }}
                        title="删除"
                        className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-border/60 px-3 py-1 text-[10px] text-muted-foreground">
              勾选完成 · 铅笔改名 · 点外部关闭
            </div>
          </div>
        </>
      )}

      {/* 设置浮层（居中小组件） */}
      {settingsOpen && (
        <>
          <div className="absolute inset-0 z-10 bg-black/10" onClick={() => setSettingsOpen(false)} />
          <div className="absolute left-1/2 top-1/2 z-20 flex max-h-[320px] w-[264px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Settings size={12} /> 挂件设置
              </span>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="关闭设置"
              >
                <X size={13} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
              {/* 字体大小 */}
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">字体大小</span>
                  <span className="font-medium">{settings.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={9}
                  max={15}
                  step={1}
                  value={settings.fontSize}
                  onChange={(e) => patch({ fontSize: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              {/* 透明度 */}
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">透明度</span>
                  <span className="font-medium">{Math.round(settings.opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={35}
                  max={100}
                  step={5}
                  value={Math.round(settings.opacity * 100)}
                  onChange={(e) => patch({ opacity: Number(e.target.value) / 100 })}
                  className="w-full"
                />
              </div>
              {/* 日历底色 */}
              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">日历底色</div>
                <div className="flex items-center gap-1.5">
                  {BG_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      title={p.label}
                      onClick={() => patch({ bg: p.key })}
                      className={`flex h-6 w-6 items-center justify-center rounded-md border text-[9px] transition-colors ${
                        settings.bg === p.key
                          ? "border-primary ring-1 ring-primary/50"
                          : "border-border hover:border-primary/50"
                      }`}
                      style={p.color ? { backgroundColor: p.color } : undefined}
                    >
                      {p.key === "default" && <span className="text-[8px] text-muted-foreground">默</span>}
                      {settings.bg === p.key && p.color && <Check size={11} className="text-foreground" />}
                    </button>
                  ))}
                </div>
              </div>
              {/* 开关 */}
              <label className="flex cursor-pointer items-center justify-between text-[11px]">
                <span className="text-muted-foreground">显示农历 / 节气 / 节日</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.showLunar}
                  onClick={() => patch({ showLunar: !settings.showLunar })}
                  className={`relative h-4 w-7 rounded-full transition-colors ${
                    settings.showLunar ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                      settings.showLunar ? "left-3.5" : "left-0.5"
                    }`}
                  />
                </button>
              </label>
              <label className="flex cursor-pointer items-center justify-between text-[11px]">
                <span className="text-muted-foreground">显示边框阴影</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.frame}
                  onClick={() => patch({ frame: !settings.frame })}
                  className={`relative h-4 w-7 rounded-full transition-colors ${
                    settings.frame ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                      settings.frame ? "left-3.5" : "left-0.5"
                    }`}
                  />
                </button>
              </label>
              <label className="flex cursor-pointer items-center justify-between text-[11px]">
                <span className="text-muted-foreground">显示节假日与调休</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.showHoliday}
                  onClick={() => patch({ showHoliday: !settings.showHoliday })}
                  className={`relative h-4 w-7 rounded-full transition-colors ${
                    settings.showHoliday ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                      settings.showHoliday ? "left-3.5" : "left-0.5"
                    }`}
                  />
                </button>
              </label>
              {isTauri && (
                <label className="flex cursor-pointer items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    贴桌面<span className="ml-1 opacity-60">（Windows）</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.stick}
                    onClick={() => patch({ stick: !settings.stick })}
                    className={`relative h-4 w-7 rounded-full transition-colors ${
                      settings.stick ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                        settings.stick ? "left-3.5" : "left-0.5"
                      }`}
                    />
                  </button>
                </label>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export const Route = createFileRoute("/widget")({
  component: WidgetCalendar,
});
