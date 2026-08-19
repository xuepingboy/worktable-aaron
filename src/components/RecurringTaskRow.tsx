// 明细视图重复任务分组行（从 _layout.tasks.tsx 拆分，控制单文件行数）
// 折叠行（模板） + 展开后的 90 天实例子行（memo 化避免高频重算）
import { useMemo } from "react";
import { ChevronDown, ChevronRight, Repeat } from "lucide-react";
import { addDays } from "date-fns";
import { usePlannerStore } from "@/store/plannerStore";
import { expandRecurringTasks, isVirtualInstance } from "@/lib/repeat";
import { todayStr, toDateStr } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { TableRow, TableCell } from "@/components/ui/table";
import { PRIORITY_LABEL, STATUS_LABEL, REPEAT_LABEL } from "@/types";
import { cn, PRIORITY_TEXT } from "@/lib/utils";
import type { Task } from "@/types";

/** 重复规则摘要（如「每天」「每周一三五」「每月15日」） */
function repeatSummary(task: Task): string {
  const c = task.repeatConfig;
  switch (task.repeatRule) {
    case "daily":
      return c?.workdaysOnly ? "工作日" : "每天";
    case "weekly": {
      if (c?.weekdays && c.weekdays.length > 0) {
        const labels = ["日", "一", "二", "三", "四", "五", "六"];
        return `每周${c.weekdays.map((d) => labels[d]).join("")}`;
      }
      return "每周";
    }
    case "monthly":
      if (c?.nthWeekday) {
        const labels = ["日", "一", "二", "三", "四", "五", "六"];
        return `每月第${c.nthWeekday.nth}个周${labels[c.nthWeekday.weekday]}`;
      }
      return c?.dayOfMonth ? `每月${c.dayOfMonth}日` : "每月";
    case "yearly":
      return c?.yearMonth && c?.yearDay ? `每年${c.yearMonth}月${c.yearDay}日` : "每年";
    case "custom":
      return `每${c?.interval ?? 1}${c?.unit === "day" ? "天" : c?.unit === "week" ? "周" : c?.unit === "month" ? "月" : "年"}`;
    default:
      return REPEAT_LABEL[task.repeatRule];
  }
}

interface FragmentRowProps {
  tpl: Task;
  isOpen: boolean;
  batchMode: boolean;
  selected: Set<string>;
  onToggleGroup: () => void;
  onToggleSelect: (id: string) => void;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onOverride: (inst: Task) => void;
}

export function RecurringTaskRow({
  tpl,
  isOpen,
  batchMode,
  selected,
  onToggleGroup,
  onToggleSelect,
  onToggle,
  onEdit,
  onDelete,
  onOverride,
}: FragmentRowProps) {
  const recurringInstances = usePlannerStore((s) => s.recurringInstances);
  // 展开时：从今天到未来 90 天展开实例（memo 化避免筛选/批量操作时高频重算）
  const instances = useMemo(() => {
    if (!isOpen) return [];
    return expandRecurringTasks([tpl], todayStr(), toDateStr(addDays(new Date(), 90)), recurringInstances)
      .filter((t) => !isVirtualInstance(t) || t.date >= todayStr())
      .slice(0, 30);
  }, [isOpen, tpl, recurringInstances]);
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onToggleGroup}>
        {batchMode && (
          <TableCell onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selected.has(tpl.id)}
              onCheckedChange={() => onToggleSelect(tpl.id)}
            />
          </TableCell>
        )}
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
          {tpl.date}
        </TableCell>
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
          {tpl.time ?? "-"}
        </TableCell>
        <TableCell className="max-w-[240px]">
          <span className="flex items-center gap-1.5">
            {isOpen ? (
              <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight size={13} className="shrink-0 text-muted-foreground" />
            )}
            <Repeat size={12} className="shrink-0 text-primary" aria-label="重复任务" />
            <span className="block truncate font-medium" title={tpl.title}>
              {tpl.title}
            </span>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {repeatSummary(tpl)}
            </Badge>
          </span>
        </TableCell>
        <TableCell>
          <span className={cn("inline-flex items-center gap-1 text-xs font-medium", PRIORITY_TEXT[tpl.priority])}>
            {PRIORITY_LABEL[tpl.priority]}
          </span>
        </TableCell>
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
          {tpl.repeatConfig?.endDate ? `至 ${tpl.repeatConfig.endDate}` : "长期"}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-[10px]">
            重复
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onEdit(tpl)}>
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive"
              onClick={() => onDelete(tpl.id)}
            >
              删除
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {isOpen &&
        instances.map((inst) => (
          <TableRow key={inst.id} className="bg-muted/30">
            {batchMode && (
              <TableCell>
                <Checkbox
                  checked={selected.has(inst.id)}
                  onCheckedChange={() => onToggleSelect(inst.id)}
                />
              </TableCell>
            )}
            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
              {inst.date}
            </TableCell>
            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
              {inst.time ?? "-"}
            </TableCell>
            <TableCell className="max-w-[240px]">
              <span className="flex items-center gap-1.5 pl-5">
                <Checkbox
                  checked={inst.status === "done"}
                  onCheckedChange={() => onToggle(inst)}
                  aria-label={`完成 ${inst.title}`}
                  className="h-3.5 w-3.5"
                />
                <span className={cn("block truncate", inst.status === "done" && "line-through text-muted-foreground")}>
                  {inst.title}
                </span>
              </span>
            </TableCell>
            <TableCell>
              <span className={cn("inline-flex items-center gap-1 text-xs font-medium", PRIORITY_TEXT[inst.priority])}>
                {PRIORITY_LABEL[inst.priority]}
              </span>
            </TableCell>
            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
              {inst.endDate ? inst.endDate : "-"}
            </TableCell>
            <TableCell>
              <Badge
                variant={inst.status === "done" ? "default" : "secondary"}
                className={inst.status === "done" ? "bg-green-600 text-white text-[10px]" : "text-[10px]"}
              >
                {STATUS_LABEL[inst.status]}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onOverride(inst)}>
                  仅本次
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onEdit(inst)}>
                  编辑
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
    </>
  );
}
