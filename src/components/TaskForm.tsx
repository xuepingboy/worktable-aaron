// 新增/编辑任务抽屉（分组折叠：基础 / 时间与提醒 / 子任务 / 附件与标签 / 重复）
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlannerStore } from "@/store/plannerStore";
import { RepeatConfigFields } from "@/components/RepeatConfigFields";
import type { Attachment, Priority, RepeatConfig, RepeatRule, Status, Task } from "@/types";
import { REPEAT_LABEL } from "@/types";
import { todayStr } from "@/lib/date";
import { saveAttachmentBlob } from "@/lib/storage";
import { isTauri, pickAttachmentPaths } from "@/lib/tauri";
import { openAttachment } from "@/lib/attachment";
import { generateId } from "@/lib/utils";
import { Paperclip } from "lucide-react";

interface TaskFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Task | null;
  defaultDate?: string;
}

const EMPTY_SUBTASK = { id: "", title: "", done: false };

export function TaskForm({ open, onOpenChange, editing, defaultDate }: TaskFormProps) {
  const addTask = usePlannerStore((s) => s.addTask);
  const updateTask = usePlannerStore((s) => s.updateTask);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate ?? todayStr());
  const [endDate, setEndDate] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [status, setStatus] = useState<Status>("todo");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [repeatRule, setRepeatRule] = useState<RepeatRule>("none");
  const [repeatConfig, setRepeatConfig] = useState<RepeatConfig>({});
  const [reminderOffset, setReminderOffset] = useState("");
  const [subtasks, setSubtasks] = useState<{ id: string; title: string; done: boolean }[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDate(editing.date);
      setEndDate(editing.endDate ?? "");
      setTime(editing.time ?? "");
      setPriority(editing.priority);
      setStatus(editing.status);
      setDescription(editing.description ?? "");
      setTags(editing.tags.join(", "));
      setRepeatRule(editing.repeatRule);
      setRepeatConfig(editing.repeatConfig ?? {});
      setReminderOffset(editing.reminderOffset != null ? String(editing.reminderOffset) : "");
      setSubtasks(editing.subtasks.length ? editing.subtasks : []);
      setAttachments(
        editing.attachments.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          size: a.size,
          mode: a.mode,
          path: a.path,
        }))
      );
    } else {
      setTitle("");
      setDate(defaultDate ?? todayStr());
      setEndDate("");
      setTime("");
      setPriority("medium");
      setStatus("todo");
      setDescription("");
      setTags("");
      setRepeatRule("none");
      setRepeatConfig({});
      setReminderOffset("");
      setSubtasks([]);
    }
  }, [open, editing, defaultDate]);

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error("请输入任务标题");
      return;
    }
    if (endDate && endDate < date) {
      toast.error("截止日期不能早于开始日期");
      return;
    }
    const tagList = tags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const subList = subtasks
      .filter((s) => s.title.trim())
      .map((s) => ({ ...s, title: s.title.trim() }));

    if (editing) {
      updateTask(editing.id, {
        title: title.trim(),
        date,
        endDate: endDate || undefined,
        time: time || undefined,
        priority,
        status,
        description: description || undefined,
        tags: tagList,
        repeatRule,
        repeatConfig: repeatRule === "none" ? undefined : repeatConfig,
        reminderOffset: reminderOffset ? Number(reminderOffset) : undefined,
        subtasks: subList,
        attachments: attachments.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          size: a.size,
          mode: a.mode,
          path: a.path,
        })),
      });
      toast.success("任务已更新");
    } else {
      addTask({
        title: title.trim(),
        date,
        endDate: endDate || undefined,
        time: time || undefined,
        priority,
        status,
        description: description || undefined,
        tags: tagList,
        repeatRule,
        repeatConfig: repeatRule === "none" ? undefined : repeatConfig,
        reminderOffset: reminderOffset ? Number(reminderOffset) : undefined,
        subtasks: subList,
        attachments: attachments.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          size: a.size,
          mode: a.mode,
          path: a.path,
        })),
        order: Date.now(),
      });
      toast.success("任务已创建");
    }
    onOpenChange(false);
  };

  const addSubtaskRow = () => {
    setSubtasks((s) => [...s, { ...EMPTY_SUBTASK, id: generateId() }]);
  };

  /** 桌面端（Tauri）：原生对话框选本地文件 → 链接模式（只存路径，不复制） */
  const handleAddTauriLinks = async () => {
    try {
      const paths = await pickAttachmentPaths();
      if (!paths.length) return; // 用户取消
      const items: Attachment[] = paths.map((p) => {
        const name = p.split(/[\\/]/).filter(Boolean).pop() ?? p;
        return { id: generateId(), name, type: "", size: -1, mode: "link", path: p };
      });
      setAttachments((prev) => [...prev, ...items]);
    } catch {
      toast.error("无法打开文件选择器");
    }
  };

  /** 添加文件入口：Tauri 走原生对话框，Web 走文件输入框 */
  const handlePickFiles = () => {
    if (isTauri) {
      void handleAddTauriLinks();
    } else {
      fileRef.current?.click();
    }
  };

  const handleAddFiles = async (files: FileList | null) => {
    if (!files) return;
    const MAX = 20 * 1024 * 1024;
    // 并行保存所有附件（IndexedDB 写入互不依赖），成功项统一加入列表
    const results = await Promise.all(
      Array.from(files).map(async (file) => {
        if (file.size > MAX) {
          toast.error(`「${file.name}」超过 20MB 限制`);
          return null;
        }
        const id = generateId();
        // 持久化附件 Blob 到 IndexedDB；失败时提示用户并跳过，避免出现无法读取的假附件
        const ok = await saveAttachmentBlob(id, file);
        if (!ok) {
          toast.error(`「${file.name}」保存失败：浏览器附件存储不可用，已跳过该附件`);
          return null;
        }
        return { id, name: file.name, type: file.type, size: file.size };
      })
    );
    const okList = results.filter((r): r is NonNullable<(typeof results)[number]> => r !== null);
    if (okList.length) {
      setAttachments((prev) => [...prev, ...okList]);
    }
  };

  const handleOpenAttachment = async (a: Attachment) => {
    const err = await openAttachment(a);
    if (err) toast.error(err);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? "编辑任务" : "新增任务"}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>标题 *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="任务标题（≤200 字符）"
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>开始日期</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>截止日期</Label>
              <Input
                type="date"
                value={endDate}
                min={date}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="可选"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>时间</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>优先级</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">高</SelectItem>
                  <SelectItem value="medium">中</SelectItem>
                  <SelectItem value="low">低</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>状态</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">待办</SelectItem>
                  <SelectItem value="doing">进行中</SelectItem>
                  <SelectItem value="done">已完成</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>重复</Label>
              <Select value={repeatRule} onValueChange={(v) => setRepeatRule(v as RepeatRule)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(REPEAT_LABEL) as RepeatRule[]).map((r) => (
                    <SelectItem key={r} value={r}>{REPEAT_LABEL[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 重复规则详细配置 */}
          {repeatRule !== "none" && (
            <RepeatConfigFields
              repeatRule={repeatRule}
              repeatConfig={repeatConfig}
              onChange={setRepeatConfig}
              date={date}
            />
          )}

          <div className="space-y-2">
            <Label>提前提醒（分钟）</Label>
            <Input
              type="number"
              min={0}
              value={reminderOffset}
              onChange={(e) => setReminderOffset(e.target.value)}
              placeholder="如 30"
            />
          </div>

          <div className="space-y-2">
            <Label>标签（逗号分隔）</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="工作, 重要" />
          </div>

          <div className="space-y-2">
            <Label>描述</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="补充说明"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>子任务</Label>
              <Button variant="outline" size="sm" onClick={addSubtaskRow}>+ 添加</Button>
            </div>
            {subtasks.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <Checkbox
                  checked={s.done}
                  onCheckedChange={(v) =>
                    setSubtasks((arr) =>
                      arr.map((x, xi) =>
                        xi === i
                          ? { ...x, done: !!v, completedAt: v ? Date.now() : undefined }
                          : x
                      )
                    )
                  }
                />
                <Input
                  value={s.title}
                  onChange={(e) =>
                    setSubtasks((arr) =>
                      arr.map((x, xi) => (xi === i ? { ...x, title: e.target.value } : x))
                    )
                  }
                  placeholder="子任务标题"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => setSubtasks((arr) => arr.filter((_, xi) => xi !== i))}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>附件{isTauri ? "（本地链接）" : "（≤20MB）"}</Label>
              <Button variant="outline" size="sm" onClick={handlePickFiles}>
                <Paperclip size={12} className="mr-1" /> 添加文件
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleAddFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {attachments.length > 0 && (
              <ul className="space-y-1">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                    <Paperclip size={12} className="shrink-0 text-muted-foreground" />
                    <button
                      type="button"
                      className="flex-1 truncate text-left hover:underline"
                      title="打开附件"
                      onClick={() => void handleOpenAttachment(a)}
                    >
                      {a.name}
                    </button>
                    {a.mode === "link" && (
                      <span className="shrink-0 rounded bg-blue-100 px-1 text-[10px] text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                        本地链接
                      </span>
                    )}
                    <span className="shrink-0 text-muted-foreground">
                      {a.size >= 0 ? `${(a.size / 1024).toFixed(0)}KB` : "本地"}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      className="text-destructive hover:opacity-70"
                      aria-label="移除附件"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={handleSubmit}>
              {editing ? "保存修改" : "创建任务"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}