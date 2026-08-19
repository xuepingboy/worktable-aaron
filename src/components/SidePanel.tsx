// 侧栏：今日优先处理 + 本周目标
import { Plus, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlannerStore, priorityWeight } from "@/store/plannerStore";
import type { Task } from "@/types";
import { taskVisibleOnDate, todayStr, weekStartStr, weekEndStr } from "@/lib/date";
import { PRIORITY_DOT } from "@/lib/utils";

interface SidePanelProps {
  tasks: Task[];
}

export function SidePanel({ tasks }: SidePanelProps) {
  const goals = usePlannerStore((s) => s.goals);
  const addGoal = usePlannerStore((s) => s.addGoal);
  const deleteGoal = usePlannerStore((s) => s.deleteGoal);
  const [newGoal, setNewGoal] = useState("");

  const today = todayStr();
  const weekGoals = useMemo(
    () => goals.filter((g) => g.type === "week" && g.start <= weekEndStr() && g.end >= weekStartStr()),
    [goals]
  );
  // 今日优先处理：关联今日任务，按优先级从高到低排序，同级按时间先后排序
  const focusTasks = useMemo(
    () =>
      tasks
        .filter((t) => taskVisibleOnDate(t, today) && t.status !== "done")
        .sort((a, b) => {
          const pw = priorityWeight(a.priority) - priorityWeight(b.priority);
          if (pw !== 0) return pw;
          // 优先级相同：有时间排前面，无时间排后面；都有时间按时间先后
          if (a.time && b.time) return a.time.localeCompare(b.time);
          if (a.time) return -1;
          if (b.time) return 1;
          return a.order - b.order;
        })
        .slice(0, 5),
    [tasks, today]
  );

  const handleAddGoal = () => {
    if (!newGoal.trim()) return;
    addGoal({
      title: newGoal.trim(),
      type: "week",
      start: weekStartStr(),
      end: weekEndStr(),
      isFocus: true,
    });
    setNewGoal("");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Target size={16} className="text-primary" />
          今日优先处理
        </h3>
        {focusTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">今日暂无待办任务</p>
        ) : (
          <ul className="space-y-2">
            {focusTasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                <span className="truncate">{t.title}</span>
                {t.time && (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t.time}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">本周目标</h3>
        {weekGoals.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无本周目标</p>
        ) : (
          <ul className="space-y-2">
            {weekGoals.map((g) => (
              <li key={g.id} className="flex items-center gap-2 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span className="flex-1 truncate">{g.title}</span>
                <button
                  onClick={() => deleteGoal(g.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="删除目标"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex gap-2">
          <Input
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddGoal()}
            placeholder="添加本周目标"
            className="h-8 text-sm"
          />
          <Button size="sm" variant="outline" onClick={handleAddGoal} className="h-8">
            <Plus size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}