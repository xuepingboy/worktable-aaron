// 更多菜单：导入、导出（Excel/JSON/AI 素材）、备份恢复、清空数据、桌面端设置
import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlannerStore } from "@/store/plannerStore";
import { parseJsonBackup } from "@/lib/export";
import { clearAllStorage } from "@/lib/storage";
import { ExportDialog } from "./ExportDialog";
import { isTauri, autostartEnabled, setAutostart, checkForUpdate } from "@/lib/tauri";

export function MoreMenu() {
  const importData = usePlannerStore((s) => s.importData);
  const clearAll = usePlannerStore((s) => s.clearAll);
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [autostart, setAutostartState] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // 桌面端：读取开机自启当前状态
  useEffect(() => {
    if (!isTauri) return;
    autostartEnabled()
      .then(setAutostartState)
      .catch(() => {});
  }, []);

  const toggleAutostart = async () => {
    const next = !autostart;
    const err = await setAutostart(next);
    if (err) {
      toast.error(err);
      return;
    }
    setAutostartState(next);
    toast.success(next ? "已开启开机自启" : "已关闭开机自启");
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const msg = await checkForUpdate();
      toast.success(msg);
    } catch (e) {
      toast.error(typeof e === "string" ? e : "检查更新失败");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseJsonBackup(String(reader.result));
        if (!parsed) {
          toast.error("备份文件格式无效");
          return;
        }
        importData(parsed.tasks, parsed.goals);
        toast.success(`已导入 ${parsed.tasks.length} 条任务`);
      } catch {
        toast.error("导入失败：文件内容无法解析");
      }
    };
    reader.onerror = () => toast.error("读取文件失败，请重试");
    reader.readAsText(file);
  };

  const handleClearAll = () => {
    if (!window.confirm("确定清空全部数据？此操作不可恢复。")) return;
    clearAll();
    clearAllStorage()
      .then(() => toast.success("已清空全部数据"))
      .catch(() => toast.error("本地附件清理失败，任务数据已清空"));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="更多菜单">
            <MoreHorizontal size={18} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>数据</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setExportOpen(true)}>导出数据</DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileRef.current?.click()}>导入备份</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={handleClearAll}>
            清空数据
          </DropdownMenuItem>
          {isTauri && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>桌面端</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => void toggleAutostart()}>
                开机自启：{autostart ? "开" : "关"}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={checkingUpdate} onClick={() => void handleCheckUpdate()}>
                {checkingUpdate ? "检查中…" : "检查更新"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImport(f);
          e.target.value = "";
        }}
      />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </>
  );
}