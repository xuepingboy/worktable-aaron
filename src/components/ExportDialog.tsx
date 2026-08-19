// 导出对话框：选择数据类型（Excel/JSON/AI素材）+ 时间范围（全部/本月/本周/自定义）
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePlannerStore } from "@/store/plannerStore";
import {
  buildAiMarkdown,
  buildExcel,
  buildJsonBackup,
  downloadTextFile,
  filterTasksByRange,
  type ExportRange,
} from "@/lib/export";
import { monthStr, todayStr, weekEndStr, weekStartStr, toDateStr } from "@/lib/date";
import { endOfMonth, parseISO } from "date-fns";

type ExportType = "excel" | "json" | "ai";

const RANGE_OPTIONS: { value: ExportRange; label: string }[] = [
  { value: "all", label: "全部数据" },
  { value: "month", label: "本月" },
  { value: "week", label: "本周" },
  { value: "custom", label: "自定义范围" },
];

const TYPE_OPTIONS: { value: ExportType; label: string; desc: string }[] = [
  { value: "excel", label: "Excel 表格", desc: "任务明细导出为 .xlsx" },
  { value: "json", label: "JSON 备份", desc: "含版本号的完整备份" },
  { value: "ai", label: "AI 素材", desc: "生成月度总结素材 .md" },
];

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const tasks = usePlannerStore((s) => s.tasks);
  const goals = usePlannerStore((s) => s.goals);
  const memos = usePlannerStore((s) => s.memos);

  const [type, setType] = useState<ExportType>("excel");
  const [range, setRange] = useState<ExportRange>("all");
  const [start, setStart] = useState(todayStr());
  const [end, setEnd] = useState(todayStr());

  const resolveRange = (): { start?: string; end?: string } => {
    if (range === "all") return {};
    if (range === "month") {
      const m = monthStr();
      return { start: `${m}-01`, end: toDateStr(endOfMonth(parseISO(`${m}-01`))) };
    }
    if (range === "week") return { start: weekStartStr(), end: weekEndStr() };
    return { start, end };
  };

  const handleExport = () => {
    const { start: s, end: e } = resolveRange();
    if (range === "custom" && (!start || !end)) {
      toast.error("请选择自定义起止日期");
      return;
    }
    if (range === "custom" && start > end) {
      toast.error("开始日期不能晚于结束日期");
      return;
    }
    const filtered = filterTasksByRange(tasks, { range, start: s, end: e });
    if (filtered.length === 0) {
      toast.warning("所选范围内没有任务");
      return;
    }

    if (type === "excel") {
      buildExcel(filtered, memos);
      toast.success(`已导出 ${filtered.length} 条任务到 Excel`);
    } else if (type === "json") {
      const json = buildJsonBackup({ schemaVersion: 1, tasks: filtered, goals }, memos);
      downloadTextFile(json, `planner-backup-${Date.now()}.json`, "application/json");
      toast.success(`已导出 ${filtered.length} 条任务到 JSON`);
    } else {
      const label = range === "all" ? "全部" : range === "month" ? "本月" : range === "week" ? "本周" : `${start}~${end}`;
      const md = buildAiMarkdown(filtered, goals, label, memos);
      downloadTextFile(md, `ai-material-${Date.now()}.md`, "text/markdown");
      toast.success("AI 素材已下载为 .md 文件");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>导出数据</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>数据类型</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as ExportType)}>
              {TYPE_OPTIONS.map((o) => (
                <div key={o.value} className="flex items-start gap-2 rounded-md border p-3">
                  <RadioGroupItem value={o.value} id={`type-${o.value}`} className="mt-0.5" />
                  <label htmlFor={`type-${o.value}`} className="cursor-pointer">
                    <span className="block text-sm font-medium">{o.label}</span>
                    <span className="block text-xs text-muted-foreground">{o.desc}</span>
                  </label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>时间范围</Label>
            <RadioGroup value={range} onValueChange={(v) => setRange(v as ExportRange)}>
              <div className="grid grid-cols-2 gap-2">
                {RANGE_OPTIONS.map((o) => (
                  <div key={o.value} className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <RadioGroupItem value={o.value} id={`range-${o.value}`} />
                    <label htmlFor={`range-${o.value}`} className="cursor-pointer text-sm">
                      {o.label}
                    </label>
                  </div>
                ))}
              </div>
            </RadioGroup>
          </div>

          {range === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>开始日期</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>结束日期</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleExport}>导出</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}