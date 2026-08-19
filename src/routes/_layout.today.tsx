// 今日工作台：KPI + 今日任务 + 侧栏
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { usePlannerStore } from "@/store/plannerStore";
import { useShallow } from "zustand/react/shallow";
import { taskVisibleOnDate, todayStr, sortTasksForView, isCarriedOver } from "@/lib/date";
import { expandRecurringTasks, isVirtualInstance, instanceDateOf, resolveEditTarget } from "@/lib/repeat";
import { parseQuickAdd, quickAddPlaceholder } from "@/lib/quickAdd";
import { ProgressSection } from "@/components/ProgressSection";
import { TaskCard } from "@/components/TaskCard";
import { SidePanel } from "@/components/SidePanel";
import { EmptyState } from "@/components/EmptyState";
import { TaskForm } from "@/components/TaskForm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Task } from "@/types";

export const Route = createFileRoute("/_layout/today")({
  component: TodayPage,
});

function TodayPage() {
  const { tasks, recurringInstances, memo, taskFormOpen, taskFormDate } = usePlannerStore(
    useShallow((s) => ({
      tasks: s.tasks,
      recurringInstances: s.recurringInstances,
      memo: s.memos[todayStr()] ?? "",
      taskFormOpen: s.taskFormOpen,
      taskFormDate: s.taskFormDate,
    }))
  );
  const { toggleTask, toggleRecurringInstance, deleteTask, setMemo, closeTaskForm, addTask } = usePlannerStore(
    useShallow((s) => ({
      toggleTask: s.toggleTask,
      toggleRecurringInstance: s.toggleRecurringInstance,
      deleteTask: s.deleteTask,
      setMemo: s.setMemo,
      closeTaskForm: s.closeTaskForm,
      addTask: s.addTask,
    }))
  );
  const [editing, setEditing] = useState<Task | null>(null);
  const [quickInput, setQuickInput] = useState("");

  const today = todayStr();
  // 展开今日重复任务实例，合并实例独立状态（useMemo 缓存避免重复计算）
  const expanded = useMemo(
    () => expandRecurringTasks(tasks, today, today, recurringInstances),
    [tasks, today, recurringInstances]
  );
  const todayTasks = useMemo(
    () => sortTasksForView(expanded.filter((t) => taskVisibleOnDate(t, today)), today),
    [expanded, today]
  );

  const handleToggle = (task: Task) => {
    if (isVirtualInstance(task)) {
      toggleRecurringInstance(task.id);
    } else {
      toggleTask(task.id);
    }
  };

  const openNew = () => {
    setEditing(null);
    usePlannerStore.getState().openTaskForm(today);
  };

  // 快速添加：解析自然语言，成功则直接创建，否则打开表单预填标题
  const handleQuickAdd = () => {
    const parsed = parseQuickAdd(quickInput);
    if (!parsed) {
      toast.error("请输入任务标题");
      return;
    }
    // 可直接落库的场景：有日期+时间、或有重复规则、或有截止日期（表单无法预填这些字段）
    const directCreate = (parsed.date && parsed.time) || !!parsed.repeatRule || !!parsed.endDate;
    if (directCreate) {
      addTask({
        title: parsed.title,
        date: parsed.date ?? today,
        endDate: parsed.endDate,
        time: parsed.time,
        priority: parsed.priority ?? "medium",
        status: "todo",
        tags: parsed.tags,
        subtasks: [],
        attachments: [],
        repeatRule: parsed.repeatRule ?? "none",
        repeatConfig: parsed.repeatRule && parsed.repeatRule !== "none" ? parsed.repeatConfig ?? {} : undefined,
        order: Date.now(),
      });
      setQuickInput("");
      toast.success("任务已创建");
      return;
    }
    // 无日期/时间：打开表单预填标题，让用户补充
    setEditing(null);
    usePlannerStore.getState().openTaskForm(parsed.date ?? today);
    setQuickInput("");
  };

  const openEdit = (task: Task) => {
    // 虚拟实例编辑：定位到模板任务
    const target = resolveEditTarget(task, tasks);
    setEditing(target);
    usePlannerStore.getState().openTaskForm(isVirtualInstance(task) ? instanceDateOf(task) : target.date);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {format(new Date(), "yyyy年M月d日 EEEE", { locale: zhCN })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">从今天最重要的任务开始</p>
      </div>
      {/* 快速添加 */}
      <div className="flex items-center gap-2">
        <Input
          value={quickInput}
          onChange={(e) => setQuickInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleQuickAdd();
          }}
          placeholder={quickAddPlaceholder()}
          className="flex-1"
        />
        <Button onClick={handleQuickAdd} className="shrink-0 gap-1">
          <Plus size={15} /> 添加
        </Button>
      </div>
      {/* 今日笔记 */}
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">今日笔记</h2>
          <span className="text-xs text-muted-foreground">每日便签</span>
        </div>
        <textarea
          value={memo}
          onChange={(e) => setMemo(today, e.target.value)}
          placeholder="记录今天需要提醒自己的事情…"
          rows={3}
          className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>
      <ProgressSection tasks={expanded} date={today} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">今日任务</h2>
            <span className="text-xs text-muted-foreground">{todayTasks.length} 项</span>
          </div>
          {todayTasks.length === 0 ? (
            <EmptyState
              title="今天还没有任务"
              description="点击右上角「新增」或按 N 键快速添加"
              onAction={openNew}
              actionLabel="新增任务"
            />
          ) : (
            <div className="space-y-2">
              {todayTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={() => handleToggle(task)}
                  onEdit={openEdit}
                  onDelete={deleteTask}
                  carriedOver={isCarriedOver(task, today)}
                />
              ))}
            </div>
          )}
        </div>

        <SidePanel tasks={expanded} />
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