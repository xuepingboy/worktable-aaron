// 月度排期：月历 + 选中日任务列表 + 月统计
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { usePlannerStore } from "@/store/plannerStore";
import { useShallow } from "zustand/react/shallow";
import { isOverdue, monthDays, monthGrid, shiftMonth, taskVisibleOnDate, todayStr } from "@/lib/date";
import { expandRecurringTasks, isVirtualInstance, instanceDateOf, resolveEditTarget } from "@/lib/repeat";
import { isTaskDraggable, buildDropPatch } from "@/lib/taskDrag";
import { PRIORITY_BG } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TaskCard } from "@/components/TaskCard";
import { TaskForm } from "@/components/TaskForm";
import type { Task } from "@/types";

export const Route = createFileRoute("/_layout/month")({
  component: MonthPage,
});

function MonthPage() {
  const { tasks, recurringInstances, selectedDate, taskFormOpen, taskFormDate, memos } = usePlannerStore(
    useShallow((s) => ({
      tasks: s.tasks,
      recurringInstances: s.recurringInstances,
      selectedDate: s.selectedDate,
      taskFormOpen: s.taskFormOpen,
      taskFormDate: s.taskFormDate,
      memos: s.memos,
    }))
  );
  const { toggleTask, toggleRecurringInstance, deleteTask, setSelectedDate, closeTaskForm, setMemo, updateTask } = usePlannerStore(
    useShallow((s) => ({
      toggleTask: s.toggleTask,
      toggleRecurringInstance: s.toggleRecurringInstance,
      deleteTask: s.deleteTask,
      setSelectedDate: s.setSelectedDate,
      closeTaskForm: s.closeTaskForm,
      setMemo: s.setMemo,
      updateTask: s.updateTask,
    }))
  );
  const [cursor, setCursor] = useState(new Date());
  const [editing, setEditing] = useState<Task | null>(null);
  // 选中日详情侧弹（点日期打开）
  const [detailOpen, setDetailOpen] = useState(false);
  // 拖拽悬停的目标日期（用于格子高亮）
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  // 拖拽结束 120ms 内吞掉补发的 click，避免误开编辑框
  const justDraggedRef = useRef(false);

  const today = todayStr();
  const grid = monthGrid(cursor);
  const monthDaysArr = monthDays(cursor);
  const monthStart = monthDaysArr[0];
  const monthEnd = monthDaysArr[monthDaysArr.length - 1];

  // 展开当月重复任务实例，合并实例独立状态（useMemo 缓存避免重复计算）
  const expanded = useMemo(
    () => expandRecurringTasks(tasks, monthStart, monthEnd, recurringInstances),
    [tasks, monthStart, monthEnd, recurringInstances]
  );

  // 按日期预分组（Map 缓存，避免月历格子渲染时重复遍历 expanded）
  const tasksByDateMap = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const dateStr of monthDaysArr) {
      map.set(dateStr, expanded.filter((t) => taskVisibleOnDate(t, dateStr)));
    }
    return map;
  }, [expanded, monthDaysArr]);
  const tasksByDate = (date: string) => tasksByDateMap.get(date) ?? [];

  const selectedTasks = (tasksByDateMap.get(selectedDate) ?? []).sort((a, b) => a.order - b.order);
  const monthTasks = useMemo(
    () => expanded.filter((t) => monthDaysArr.some((d) => taskVisibleOnDate(t, d))),
    [expanded, monthDaysArr]
  );
  const monthDone = monthTasks.filter((t) => t.status === "done").length;
  const monthOverdue = monthTasks.filter((t) => isOverdue(t)).length;

  const handleToggle = (task: Task) => {
    if (isVirtualInstance(task)) {
      toggleRecurringInstance(task.id);
    } else {
      toggleTask(task.id);
    }
  };

  const openNew = () => {
    setEditing(null);
    usePlannerStore.getState().openTaskForm(selectedDate);
  };

  /** 点击日期：选中并打开当日详情侧弹 */
  const openDayDetail = (dateStr: string) => {
    setSelectedDate(dateStr);
    setDetailOpen(true);
  };

  // 拖拽：纯逻辑见 lib/taskDrag（非虚拟、非重复可拖；已完成拖到新日期转未完成）
  const handleDragOver = (day: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverDate !== day) setDragOverDate(day);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDragOverDate(null);
  };
  const handleDrop = (targetDay: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverDate(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const patch = buildDropPatch(tasks, id, targetDay);
    if (patch) updateTask(id, patch);
  };

  const openEdit = (task: Task) => {
    // 虚拟实例编辑：定位到模板任务
    const target = resolveEditTarget(task, tasks);
    setEditing(target);
    usePlannerStore.getState().openTaskForm(isVirtualInstance(task) ? instanceDateOf(task) : target.date);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(shiftMonth(cursor, -1))}>
            <ChevronLeft size={16} />
          </Button>
          <span className="text-sm font-medium">{format(cursor, "yyyy年M月")}</span>
          <Button variant="outline" size="icon" onClick={() => setCursor(shiftMonth(cursor, 1))}>
            <ChevronRight size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
            回到本月
          </Button>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>总 {monthTasks.length}</span>
          <span className="text-green-500">完成 {monthDone}</span>
          <span className="text-red-500">逾期 {monthOverdue}</span>
        </div>
      </div>

      {/* 月历：全宽 + 高度随视口自适应（6 行平分） */}
      <div className="flex h-[calc(100dvh-210px)] min-h-[420px] flex-col rounded-xl border bg-card p-2">
        <div className="grid grid-cols-7 gap-1 pb-1">
          {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
            <div key={d} className="py-1 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1">
            {grid.map(({ dateStr, inMonth }) => {
              const dayTasks = tasksByDate(dateStr);
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedDate;
              return (
                <div
                  key={dateStr}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDayDetail(dateStr)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      openDayDetail(dateStr);
                    }
                  }}
                  onDragOver={handleDragOver(dateStr)}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop(dateStr)}
                  className={`flex min-h-0 flex-col items-start gap-1 overflow-hidden rounded-lg border p-1.5 text-left transition-colors ${
                    inMonth ? "bg-background" : "bg-muted/30 opacity-50"
                  } ${isSelected ? "border-primary ring-1 ring-primary/30" : ""} ${
                    isToday ? "border-primary/60" : ""
                  } ${dragOverDate === dateStr ? "border-primary ring-2 ring-primary/40" : ""}`}
                >
                  <div className="flex w-full items-center justify-between gap-1">
                    <span className={`text-xs ${isToday ? "font-bold text-primary" : ""}`}>
                      {Number(dateStr.slice(8))}
                    </span>
                    {dayTasks.length > 4 && (
                      <span
                        className="shrink-0 rounded bg-muted px-1 text-[10px] font-medium leading-4 text-muted-foreground"
                        title={`另有 ${dayTasks.length - 4} 条任务`}
                      >
                        +{dayTasks.length - 4}
                      </span>
                    )}
                  </div>
                  <div className="flex w-full flex-col gap-0.5">
                    {dayTasks.slice(0, 4).map((t) => {
                      const draggable = isTaskDraggable(t);
                      return (
                      <div
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        draggable={draggable}
                        onDragStart={
                          draggable
                            ? (e) => {
                                justDraggedRef.current = true;
                                e.dataTransfer.setData("text/plain", t.id);
                                e.dataTransfer.effectAllowed = "move";
                              }
                            : undefined
                        }
                        onDragEnd={() => {
                          setTimeout(() => {
                            justDraggedRef.current = false;
                          }, 120);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (justDraggedRef.current) return;
                          openEdit(t);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            openEdit(t);
                          }
                        }}
                        className={`w-full cursor-pointer truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight ${PRIORITY_BG[t.priority]} ${
                          t.status === "done" ? "line-through opacity-60" : ""
                        }`}
                        title={t.title}
                      >
                        {t.title}
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* 选中日详情：侧弹抽屉 */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <div className="flex items-center justify-between pr-8">
              <SheetTitle>{format(new Date(selectedDate), "M月d日 EEEE", { locale: zhCN })}</SheetTitle>
              <Button size="sm" variant="outline" onClick={openNew}>+ 新增</Button>
            </div>
          </SheetHeader>
          <div className="mt-4 space-y-5">
            {/* 当日便签（历史可翻看、可补写） */}
            <div>
              <h4 className="mb-2 text-sm font-semibold">便签</h4>
              <textarea
                value={memos[selectedDate] ?? ""}
                onChange={(e) => setMemo(selectedDate, e.target.value)}
                placeholder="该日暂无便签，可记录…"
                rows={3}
                className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            {/* 当日任务 */}
            {selectedTasks.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card/50 py-8 text-center text-xs text-muted-foreground">
                该日暂无任务
              </p>
            ) : (
              <div className="space-y-2">
                {selectedTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={() => handleToggle(task)}
                    onEdit={openEdit}
                    onDelete={deleteTask}
                  />
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <TaskForm
        open={taskFormOpen}
        onOpenChange={closeTaskForm}
        editing={editing}
        defaultDate={taskFormDate}
      />
    </div>
  );
}