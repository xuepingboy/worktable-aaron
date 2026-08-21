// 周看板任务块（从 _layout.week.tsx 拆分，控制单文件行数）
// 左侧优先级色条 + 完成勾选 + 标题/时间/优先级/重复/逾期 信息行
import { Checkbox } from "@/components/ui/checkbox";
import { useRef } from "react";
import { isOverdue } from "@/lib/date";
import { isVirtualInstance } from "@/lib/repeat";
import { PRIORITY_LABEL } from "@/types";
import type { Task } from "@/types";

/** 优先级 → 左侧色条颜色 */
function priorityBar(p: Task["priority"]): string {
  if (p === "high") return "bg-red-500";
  if (p === "medium") return "bg-amber-500";
  return "bg-blue-500";
}

interface WeekTaskBlockProps {
  task: Task;
  draggable: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}

export function WeekTaskBlock({ task, draggable, onToggle, onEdit, onDragStart }: WeekTaskBlockProps) {
  // 拖拽结束后浏览器可能补发 click，避免误触打开编辑框
  const justDraggedRef = useRef(false);
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        justDraggedRef.current = true;
        onDragStart?.(e);
      }}
      onDragEnd={() => {
        // 保留 120ms 窗口吞掉拖拽后的 click
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 120);
      }}
      onClick={() => {
        if (justDraggedRef.current) return;
        onEdit();
      }}
      className={`flex items-stretch gap-1.5 rounded border bg-background p-1.5 ${
        draggable ? "cursor-pointer hover:border-primary/50" : "cursor-pointer"
      }`}
    >
      <div className={`w-[3px] shrink-0 rounded ${priorityBar(task.priority)}`} />
      <Checkbox
        checked={task.status === "done"}
        onCheckedChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 h-3.5 w-3.5 shrink-0"
        aria-label={`完成 ${task.title}`}
      />
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-xs ${
            task.status === "done" ? "text-muted-foreground line-through" : ""
          }`}
          title={task.title}
        >
          {task.title}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>{task.time || "全天"}</span>
          <span className="rounded bg-muted px-1 text-[9px]">{PRIORITY_LABEL[task.priority]}</span>
          {isVirtualInstance(task) && (
            <span className="rounded bg-purple-50 px-1 text-[9px] text-purple-600">重复</span>
          )}
          {isOverdue(task) && task.status !== "done" && (
            <span className="text-[9px] text-red-500">逾期</span>
          )}
        </div>
      </div>
    </div>
  );
}
