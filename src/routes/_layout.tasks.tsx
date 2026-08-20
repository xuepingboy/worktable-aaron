// 任务明细：筛选 + 批量操作 + 导出（重复任务分组折叠）
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { usePlannerStore } from "@/store/plannerStore";
import { filterTasks, collectTags } from "@/store/plannerStore";
import { isVirtualInstance, resolveEditTarget, createOverrideTask, templateIdOf, instanceDateOf } from "@/lib/repeat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { TaskForm } from "@/components/TaskForm";
import { EmptyState } from "@/components/EmptyState";
import { RecurringTaskRow } from "@/components/RecurringTaskRow";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/types";
import type { Priority, Status, Task } from "@/types";
import { cn, PRIORITY_TEXT } from "@/lib/utils";

export const Route = createFileRoute("/_layout/tasks")({
  component: TasksPage,
});

function TasksPage() {
  const tasks = usePlannerStore((s) => s.tasks);
  const filter = usePlannerStore((s) => s.filter);
  const setFilter = usePlannerStore((s) => s.setFilter);
  const resetFilter = usePlannerStore((s) => s.resetFilter);
  const toggleTask = usePlannerStore((s) => s.toggleTask);
  const toggleRecurringInstance = usePlannerStore((s) => s.toggleRecurringInstance);
  const deleteTask = usePlannerStore((s) => s.deleteTask);
  const deleteTasks = usePlannerStore((s) => s.deleteTasks);
  const updateTask = usePlannerStore((s) => s.updateTask);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 展开的重复任务组（key: 模板 id）
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const tags = useMemo(() => collectTags(tasks), [tasks]);
  // 普通任务（非重复）逐行显示；重复任务模板（每个一行，可展开）——过滤结果 memo 化，避免筛选输入时全量重算
  const filteredNormal = useMemo(
    () =>
      filterTasks(
        tasks.filter((t) => t.repeatRule === "none"),
        filter
      ).sort((a, b) => a.date.localeCompare(b.date)),
    [tasks, filter]
  );
  const filteredRepeat = useMemo(
    () =>
      filterTasks(
        tasks.filter((t) => t.repeatRule !== "none"),
        filter
      ).sort((a, b) => a.date.localeCompare(b.date)),
    [tasks, filter]
  );

  const openEdit = (task: Task) => {
    // 虚拟实例编辑：定位到模板任务
    setEditing(resolveEditTarget(task, tasks));
    setFormOpen(true);
  };

  const handleToggle = (task: Task) => {
    if (isVirtualInstance(task)) {
      toggleRecurringInstance(task.id);
    } else {
      toggleTask(task.id);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const total = filteredNormal.length + filteredRepeat.length;
    if (selected.size === total) setSelected(new Set());
    else setSelected(new Set([...filteredNormal, ...filteredRepeat].map((t) => t.id)));
  };

  const handleBatchDone = () => {
    const count = selected.size;
    selected.forEach((id) => {
      if (id.includes("::")) toggleRecurringInstance(id);
      else updateTask(id, { status: "done" });
    });
    setSelected(new Set());
    toast.success(`已完成 ${count} 项`);
  };

  const handleBatchDelete = () => {
    const count = selected.size;
    if (!window.confirm(`确定删除选中的 ${count} 项任务？此操作不可恢复。`)) return;
    const realIds = Array.from(selected).filter((id) => !id.includes("::"));
    if (realIds.length > 0) deleteTasks(realIds);
    setSelected(new Set());
    toast.success(`已删除 ${count} 项`);
  };

  const toggleGroup = (templateId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  };

  // 仅本次修改：把某实例复制为独立覆盖任务，然后打开编辑
  const handleOverride = (inst: Task) => {
    const tpl = tasks.find((t) => t.id === templateIdOf(inst));
    if (!tpl) return;
    const override = createOverrideTask(tpl, instanceDateOf(inst));
    usePlannerStore.getState().addTask(override);
    setEditing(override);
    setFormOpen(true);
    toast.success("已创建本次独立任务，可单独修改");
  };

  const totalRows = filteredNormal.length + filteredRepeat.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={filter.keyword}
          onChange={(e) => setFilter({ keyword: e.target.value })}
          placeholder="搜索关键词"
          className="w-40"
        />
        <Select
          value={filter.status}
          onValueChange={(v) => setFilter({ status: v as Status | "all" })}
        >
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="todo">待办</SelectItem>
            <SelectItem value="doing">进行中</SelectItem>
            <SelectItem value="done">已完成</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filter.priority}
          onValueChange={(v) => setFilter({ priority: v as Priority | "all" })}
        >
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部优先级</SelectItem>
            <SelectItem value="high">高</SelectItem>
            <SelectItem value="medium">中</SelectItem>
            <SelectItem value="low">低</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filter.tag}
          onValueChange={(v) => setFilter({ tag: v })}
        >
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部标签</SelectItem>
            {tags.map((t) => (
              <SelectItem key={t} value={t}>#{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filter.dateRange}
          onValueChange={(v) => setFilter({ dateRange: v as "all" | "today" | "week" | "month" })}
        >
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部日期</SelectItem>
            <SelectItem value="today">今天</SelectItem>
            <SelectItem value="week">本周</SelectItem>
            <SelectItem value="month">本月</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={resetFilter}>重置</Button>
        <Button
          variant={batchMode ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setBatchMode(!batchMode);
            setSelected(new Set());
          }}
        >
          {batchMode ? "退出批量" : "批量模式"}
        </Button>
      </div>

      {batchMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-2">
          <Checkbox
            checked={selected.size === totalRows && totalRows > 0}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-xs text-muted-foreground">已选 {selected.size} 项</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={handleBatchDone}>批量完成</Button>
            <Button size="sm" variant="destructive" onClick={handleBatchDelete}>批量删除</Button>
          </div>
        </div>
      )}

      {totalRows === 0 ? (
        <EmptyState title="没有符合条件的任务" description="调整筛选条件或新增任务" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {batchMode && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.size === totalRows && totalRows > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                )}
                <TableHead>日期</TableHead>
                <TableHead>时间</TableHead>
                <TableHead>任务名称</TableHead>
                <TableHead>优先级</TableHead>
                <TableHead>截止日期</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* 普通任务逐行 */}
              {filteredNormal.map((task) => (
                <TableRow key={task.id}>
                  {batchMode && (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(task.id)}
                        onCheckedChange={() => toggleSelect(task.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {task.date}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {task.time ?? "-"}
                  </TableCell>
                  <TableCell className="max-w-[240px]">
                    <span className="block truncate font-medium" title={task.title}>
                      {task.title}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-medium",
                        PRIORITY_TEXT[task.priority]
                      )}
                    >
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {task.endDate ? task.endDate : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={task.status === "done" ? "default" : task.status === "doing" ? "default" : "secondary"}
                      className={task.status === "done" ? "bg-green-600 text-white text-[10px]" : "text-[10px]"}
                    >
                      {STATUS_LABEL[task.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {task.status !== "done" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => updateTask(task.id, { status: "doing" })}
                        >
                          开始
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(task)}>
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-destructive"
                        onClick={() => deleteTask(task.id)}
                      >
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {/* 重复任务分组折叠 */}
              {filteredRepeat.map((tpl) => (
                <RecurringTaskRow
                  key={tpl.id}
                  tpl={tpl}
                  isOpen={expandedGroups.has(tpl.id)}
                  batchMode={batchMode}
                  selected={selected}
                  onToggleGroup={() => toggleGroup(tpl.id)}
                  onToggleSelect={toggleSelect}
                  onToggle={handleToggle}
                  onEdit={openEdit}
                  onDelete={deleteTask}
                  onOverride={handleOverride}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TaskForm open={formOpen} onOpenChange={setFormOpen} editing={editing} />
    </div>
  );
}
