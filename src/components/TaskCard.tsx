// 任务卡片：勾选循环、优先级、状态、标签、子任务进度
import { Check, CheckCircle2, CalendarDays, ChevronDown, ChevronRight, Clock, Flag, Paperclip, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn, PRIORITY_TEXT } from "@/lib/utils";
import type { Task } from "@/types";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/types";
import { isOverdue, toDateStr } from "@/lib/date";
import { openAttachments } from "@/lib/attachment";
import { usePlannerStore } from "@/store/plannerStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface TaskCardProps {
  task: Task;
  onToggle: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, task: Task) => void;
  hoverActions?: boolean; // 操作按钮悬停才显示（窄列场景释放横向空间）
  compact?: boolean; // 精简模式：仅显示名称+时间+优先级+复选框（周视图）
  carriedOver?: boolean; // 顺延任务标识（未完成单日任务顺延到今天）
}

export function TaskCard({ task, onToggle, onEdit, onDelete, draggable, onDragStart, hoverActions, compact, carriedOver }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const updateTask = usePlannerStore((s) => s.updateTask);
  const done = task.status === "done";
  const overdue = isOverdue(task);
  const subDone = task.subtasks.filter((s) => s.done).length;
  const completedDate = done && task.completedAt ? toDateStr(new Date(task.completedAt)) : null;

  const toggleSubtask = (subId: string, checked: boolean) => {
    updateTask(task.id, {
      subtasks: task.subtasks.map((s) =>
        s.id === subId
          ? { ...s, done: checked, completedAt: checked ? Date.now() : undefined }
          : s
      ),
      // 勾选子任务时，若父任务还是待办则改为进行中
      status: checked && task.status === "todo" ? "doing" : task.status,
    });
  };

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart ? (e) => onDragStart(e, task) : undefined}
      className={cn(
        "group rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        done && "opacity-60",
        draggable && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={done}
          onCheckedChange={() => onToggle(task.id)}
          aria-label={`完成 ${task.title}`}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              title={task.title}
              className={cn(
                "min-w-0 text-sm font-medium break-words",
                done && "line-through text-muted-foreground"
              )}
            >
              {task.title}
            </span>
            {task.repeatRule !== "none" && (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                重复
              </Badge>
            )}
            {carriedOver && (
              <Badge variant="secondary" className="shrink-0 text-[10px] text-amber-600">
                顺延 {task.date.slice(5)}
              </Badge>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {task.time && (
              <span className="flex items-center gap-0.5">
                <Clock size={11} /> {task.time}
              </span>
            )}
            <span className={cn("flex items-center gap-0.5", PRIORITY_TEXT[task.priority])}>
              <Flag size={11} /> {PRIORITY_LABEL[task.priority]}
            </span>
            {!compact && (
              <>
                <span>{STATUS_LABEL[task.status]}</span>
                {task.endDate && !done && (
                  <span className="flex items-center gap-0.5 whitespace-nowrap">
                    <CalendarDays size={11} /> 截止 {task.endDate}
                  </span>
                )}
                {completedDate && (
                  <span className="flex items-center gap-0.5 whitespace-nowrap text-green-600">
                    <CheckCircle2 size={11} /> 完成于 {completedDate}
                  </span>
                )}
                {overdue && <Badge variant="destructive" className="text-[10px]">逾期</Badge>}
                {task.subtasks.length > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Check size={11} /> {subDone}/{task.subtasks.length}
                  </span>
                )}
                {task.attachments.length > 0 && (
                  <button
                    type="button"
                    className="flex items-center gap-0.5 hover:text-primary"
                    title="打开附件"
                    onClick={() => {
                      void openAttachments(task.attachments).then((err) => {
                        if (err) toast.error(err);
                      });
                    }}
                  >
                    <Paperclip size={11} /> {task.attachments.length}
                    {task.attachments.some((a) => a.mode === "link") && (
                      <span className="text-[9px] text-blue-600 dark:text-blue-300">链</span>
                    )}
                  </button>
                )}
                {task.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="whitespace-nowrap text-[10px]">
                    #{tag}
                  </Badge>
                ))}
              </>
            )}
          </div>

          {!compact && task.subtasks.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                子任务 {subDone}/{task.subtasks.length}
              </button>
              {expanded && (
                <ul className="mt-1 space-y-1">
                  {task.subtasks.map((s) => (
                    <li key={s.id} className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={s.done}
                        onCheckedChange={(v) => toggleSubtask(s.id, !!v)}
                        className="h-3.5 w-3.5"
                      />
                      <span className={cn(s.done && "line-through text-muted-foreground")}>
                        {s.title}
                      </span>
                      {s.done && s.completedAt && (
                        <span className="ml-auto shrink-0 text-[10px] text-green-600">
                          完成于 {toDateStr(new Date(s.completedAt))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div
          className={cn(
            "flex shrink-0 items-center gap-1",
            hoverActions &&
              "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => onEdit(task)}
            aria-label="编辑"
            title="编辑"
          >
            <Pencil size={13} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive"
            onClick={() => onDelete(task.id)}
            aria-label="删除"
          >
            <span className="text-sm">×</span>
          </Button>
        </div>
      </div>
    </div>
  );
}