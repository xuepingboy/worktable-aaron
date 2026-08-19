// 附件打开统一入口（P1）
// - 链接模式（桌面端）：invoke Rust 命令，用系统默认程序打开本地原文件，不复制
// - 复制模式（Web/IndexedDB）：读 Blob 后触发下载
import type { Attachment } from "@/types";
import { loadAttachmentBlob } from "@/lib/storage";
import { isTauri, openLocalFile } from "@/lib/tauri";

/** 打开单个附件。成功返回 null；失败返回错误信息（供调用方 toast） */
export async function openAttachment(a: Attachment): Promise<string | null> {
  try {
    if (a.mode === "link" && isTauri && a.path) {
      return openLocalFile(a.path);
    }
    // Web / 复制模式：从 IndexedDB 取 Blob 并下载
    const blob = await loadAttachmentBlob(a.id);
    if (!blob) return "附件内容已丢失（可能已被清理）";
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = a.name;
    document.body.appendChild(el);
    el.click();
    el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return null;
  } catch (e) {
    console.warn("打开附件失败", e);
    return typeof e === "string" ? e : "打开附件失败";
  }
}

/** 依次尝试打开附件列表（TaskCard 角标点击时用），全部失败才返回首个错误 */
export async function openAttachments(list: Attachment[]): Promise<string | null> {
  if (!list.length) return "没有可打开的附件";
  let lastErr: string | null = null;
  for (const a of list) {
    lastErr = await openAttachment(a);
    if (!lastErr) return null; // 有一个打开成功即视为成功
  }
  return lastErr ?? "打开附件失败";
}
