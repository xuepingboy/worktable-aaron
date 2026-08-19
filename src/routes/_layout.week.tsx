// 每周计划：7 列看板（每天一列） + 任务可跨日拖拽
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Target, Star, Plus } from "lucide-react";
import { addDays, format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { usePlannerStore } from "@/store/plannerStore";
import { useShallow } from "zustand/react/shallow";
import { isOverdue, shiftWeek, taskVisibleOnDate, todayStr, weekDays, weekStartDate, sortTasksForView } from "@/lib/date";
import { expandRecurringTasks, isVirtualInstance, instanceDateOf, resolveEditTarget } from "@/lib/repeat";
import { isTaskDraggable, buildDropPatch } from "@/lib/taskDrag";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaskForm } from "@/components/TaskForm";
import { WeekTaskBlock } from "@/components/WeekTaskBlock";
import type { Task } from "@/types";

export const Route = createFileRoute("/_layout/week")({
  component: WeekPage,
});

function WeekPage() {
  const { tasks, recurringInstances, goals, taskFormOpen, taskFormDate } = usePlannerStore(
    useShallow((s) => ({
      tasks: s.tasks,
      recurringInstances: s.recurringInstances,
      goals: s.goals,
      taskFormOpen: s.taskFormOpen,
      taskFormDate: s.taskFormDate,
    }))
  );
  const { toggleTask, toggleRecurringInstance, deleteTask, updateTask, closeTaskForm } = usePlannerStore(
    useShallow((s) => ({
      toggleTask: s.toggleTask,
      toggleRecurringInstance: s.toggleRecurringInstance,
      deleteTask: s.deleteTask,
      updateTask: s.updateTask,
      closeTaskForm: s.closeTaskForm,
    }))
  );
  const [cursor, setCursor] = useState(todayStr());
  const [editing, setEditing] = useState<Task | null>(null);
  // 当前拖拽悬停的目标日（用于列高亮）
  const [dragOver, setDragOver] = useState<string | null>(null);
  // 选择重点事项弹窗
  const [focusPickerOpen, setFocusPickerOpen] = useState(false);

  const today = todayStr();
  const weekStart = weekStartDate(new Date(cursor));
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(addDays(weekStart, 6), "yyyy-MM-dd");
  const days = weekDays(weekStart);

  // 展开本周重复任务实例
  const expanded = useMemo(
    () => expandRecurringTasks(tasks, weekStartStr, weekEndStr, recurringInstances),
    [tasks, weekStartStr, weekEndStr, recurringInstances]
  );

  const tasksByDay = (day: string) =>
    sortTasksForView(expanded.filter((t) => taskVisibleOnDate(t, day)), day);

  // 周统计
  const weekTasks = expanded.filter((t) => days.some((day) => taskVisibleOnDate(t, day)));
  const weekTotal = weekTasks.length;
  const weekDone = weekTasks.filter((t) => t.status === "done").length;
  const weekRate = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;
  const weekTodo = weekTasks.filter((t) => t.status !== "done").length;
  const weekOverdue = expanded.filter((t) => isOverdue(t) && days.some((d) => taskVisibleOnDate(t, d))).length;

  const handleToggle = (task: Task) => {
    if (isVirtualInstance(task)) {
      toggleRecurringInstance(task.id);
    } else {
      toggleTask(task.id);
    }
  };

  // 本周目标（区间交集，跨周目标不丢失）
  const weekGoals = goals.filter(
    (g) => g.type === "week" && g.start <= weekEndStr && g.end >= weekStartStr
  );
  // 本周重点事项（从本周任务中选择）
  const focusTasks = weekTasks.filter((t) => t.isFocus);
  const toggleFocus = (id: string, checked: boolean) => {
    updateTask(id, { isFocus: checked });
  };

  const openNew = (date: string) => {
    setEditing(null);
    usePlannerStore.getState().openTaskForm(date);
  };

  const openEdit = (task: Task) => {
    const target = resolveEditTarget(task, tasks);
    setEditing(target);
    usePlannerStore.getState().openTaskForm(isVirtualInstance(task) ? instanceDateOf(task) : target.date);
  };

  // 拖拽：纯逻辑见 lib/taskDrag（非虚拟、非重复可拖；已完成拖到新日期转未完成）
  const handleDragOver = (day: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOver !== day) setDragOver(day);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    // 避免子节点触发冒泡清掉高亮
    if (e.currentTarget === e.target) setDragOver(null);
  };
  const handleDrop = (targetDay: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const patch = buildDropPatch(tasks, id, targetDay);
    if (patch) updateTask(id, patch);
  };

  const weekLabel = `${weekStartStr} ~ ${format(addDays(weekStart, 6), "MM-dd")}`;

  return (
    <div className="flex h-[calc(100dvh-220px)] min-h-[560px] flex-col gap-4">
      {/* 顶部：周导航 + 周统计 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(format(shiftWeek(new Date(cursor), -1), "yyyy-MM-dd"))}>
            <ChevronLeft size={16} />
          </Button>
          <span className="text-sm font-medium">{weekLabel}</span>
          <Button variant="outline" size="icon" onClick={() => setCursor(format(shiftWeek(new Date(cursor), 1), "yyyy-MM-dd"))}>
            <ChevronRight size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(today)}>本周</Button>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground">完成率</span>
            <span className="font-semibold text-primary">{weekRate}%</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground">未完成</span>
            <span className="font-semibold">{weekTodo}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground">逾期</span>
            <span className="font-semibold text-red-500">{weekOverdue}</span>
          </span>
        </div>
      </div>

      {/* 中部：本周目标 + 重点事项 */}
      <div className="grid shrink-0 gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Target size={15} className="text-primary" />
            本周目标
          </div>
          {weekGoals.length > 0 ? (
            <ul className="space-y-1.5">
              {weekGoals.map((g) => (
                <li key={g.id} className="text-sm text-foreground">{g.title}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">暂无本周目标</p>
          )}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Star size={15} className="text-amber-500" />
              本周重点事项
            </div>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setFocusPickerOpen(true)}>
              <Plus size={13} /> 选择
            </Button>
          </div>
          {focusTasks.length > 0 ? (
            <ul className="space-y-1.5">
              {focusTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked
                    onCheckedChange={(v) => toggleFocus(t.id, !!v)}
                    aria-label={`取消重点事项 ${t.title}`}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1 break-words">{t.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">暂无重点事项</p>
          )}
        </div>
      </div>

      {/* 选择重点事项弹窗 */}
      <Dialog open={focusPickerOpen} onOpenChange={setFocusPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>选择本周重点事项</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {weekTasks.length > 0 ? (
              <div className="space-y-1.5">
                {weekTasks.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm hover:bg-muted/50">
                    <Checkbox
                      checked={!!t.isFocus}
                      onCheckedChange={(v) => toggleFocus(t.id, !!v)}
                      aria-label={`标记重点事项 ${t.title}`}
                    />
                    <span className="min-w-0 flex-1 break-words">{t.title}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">本周暂无任务</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 7 列看板：占剩余高度，窗口越高列越长 */}
      <div className="grid min-h-0 flex-1 grid-cols-7 gap-2">
        {days.map((day) => {
          const dayTasks = tasksByDay(day);
          const total = dayTasks.length;
          const done = dayTasks.filter((t) => t.status === "done").length;
          const rate = total ? Math.round((done / total) * 100) : 0;
          const isToday = day === today;
          return (
            <div
              key={day}
              onDragOver={handleDragOver(day)}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop(day)}
              className={`flex h-full min-h-0 flex-col rounded-xl border bg-card p-2 transition-shadow ${
                isToday ? "border-primary/50" : ""
              } ${dragOver === day ? "ring-2 ring-primary" : ""}`}
            >
              {/* 列头：周几 + 日期 + 项数徽标 */}
              <div className="flex items-baseline justify-between border-b pb-2">
                <div>
                  <div className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>
                    {format(new Date(day), "EEEE", { locale: zhCN })}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {Number(day.slice(5, 7))}/{Number(day.slice(8, 10))}
                  </div>
                </div>
                <span className="rounded bg-blue-50 px-1.5 text-[10px] font-medium text-blue-600">
                  {total} 项
                </span>
              </div>

              {/* 任务列表（任务多时列内滚动） */}
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto py-2">
                {dayTasks.length > 0 ? (
                  dayTasks.map((task) => {
                    const draggable = isTaskDraggable(task);
                    return (
                      <WeekTaskBlock
                        key={task.id}
                        task={task}
                        draggable={draggable}
                        onToggle={() => handleToggle(task)}
                        onEdit={() => openEdit(task)}
                        onDragStart={
                          draggable
                            ? (e) => {
                                e.dataTransfer.setData("text/plain", task.id);
                                e.dataTransfer.effectAllowed = "move";
                              }
                            : undefined
                        }
                      />
                    );
                  })
                ) : (
                  <p className="py-6 text-center text-xs text-muted-foreground">这一天还没有任务</p>
                )}
              </div>

              {/* 列尾：完成率 + 进度条 + 添加任务 */}
              <div className="space-y-1.5 border-t pt-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">完成率</span>
                  <span className="font-medium">{rate}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${rate === 100 ? "bg-green-500" : "bg-primary"}`}
                    style={{ width: `${rate}%` }}
                  />
                </div>
                <button
                  onClick={() => openNew(day)}
                  className="w-full rounded-md border border-dashed py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  + 添加任务
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <TaskForm
        open={taskFormOpen}
        onOpenChange={closeTaskForm}
        editing={editing}
        defaultDate={taskFormDate}
      />
    </div>
  );
}
