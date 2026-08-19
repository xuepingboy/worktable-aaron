// 提醒中心：每 60s 扫描临近截止任务，触发系统通知或 Toast
import { useEffect } from "react";
import { toast } from "sonner";
import { usePlannerStore } from "@/store/plannerStore";
import { scanReminders, notify } from "@/lib/reminder";

export function ReminderCenter() {
  // 定时器只挂载一次，回调内通过 getState() 读取最新数据，避免依赖 tasks 反复重建
  useEffect(() => {
    const timer = setInterval(() => {
      const { tasks, updateTask } = usePlannerStore.getState();
      const { hits, updated } = scanReminders(tasks);
      if (updated.length) {
        updated.forEach((t) => updateTask(t.id, { lastNotifiedAt: t.lastNotifiedAt }));
      }
      hits.forEach((t) => {
        const sent = notify("任务提醒", `「${t.title}」即将到期`);
        if (!sent) toast.warning(`任务提醒：「${t.title}」即将到期`);
      });
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  return null;
}