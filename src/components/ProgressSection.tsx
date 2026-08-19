// 工作进度分析：折叠展示某日任务的完成统计与完成率进度条
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Task } from "@/types";
import { taskVisibleOnDate } from "@/lib/date";

interface ProgressSectionProps {
  tasks: Task[];
  date: string; // YYYY-MM-DD
}

export function ProgressSection({ tasks, date }: ProgressSectionProps) {
  const [open, setOpen] = useState(false);
  const dayTasks = tasks.filter((t) => taskVisibleOnDate(t, date));
  // 单次遍历统计状态，避免三次 filter
  let done = 0;
  let doing = 0;
  let todo = 0;
  for (const t of dayTasks) {
    if (t.status === "done") done++;
    else if (t.status === "doing") doing++;
    else todo++;
  }
  const total = dayTasks.length;
  const rate = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-xl border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        工作进度分析
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {done}/{total} · {rate}%
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t px-4 py-3">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-lg font-semibold">{total}</div>
              <div className="text-xs text-muted-foreground">总任务</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-green-500">{done}</div>
              <div className="text-xs text-muted-foreground">已完成</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-amber-500">{doing}</div>
              <div className="text-xs text-muted-foreground">进行中</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-blue-500">{todo}</div>
              <div className="text-xs text-muted-foreground">待办</div>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>完成率</span>
              <span>{rate}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${
                  rate === 100 ? "bg-green-500" : "bg-primary"
                }`}
                style={{ width: `${rate}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}