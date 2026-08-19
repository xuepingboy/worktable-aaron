// 前端 Tauri 桥：零依赖（不引入 @tauri-apps/api），仅在生产 WebView 内生效。
// 所有桌面端能力都通过 Rust 命令暴露，Web 版（浏览器/绿色版）完全不受影响。
// 说明：window.__TAURI_INTERNALS__ 是 Tauri 2 注入的前端桥（@tauri-apps/api 底层即调用它）。

type InvokeArgs = Record<string, unknown>;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: InvokeArgs) => Promise<unknown>;
    };
  }
}

/** 当前是否运行在 Tauri 桌面壳内 */
export const isTauri =
  typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__?.invoke === "function";

/** 调用 Rust 命令；非 Tauri 环境或命令失败时 reject（错误值为 Rust 侧 Err 的字符串） */
export async function invoke<T = unknown>(cmd: string, args?: InvokeArgs): Promise<T> {
  if (!isTauri) throw new Error("非 Tauri 环境，命令不可用：" + cmd);
  return (await window.__TAURI_INTERNALS__!.invoke(cmd, args)) as T;
}

// ── 常用封装（供业务代码使用）───────────────────────────────

/** 原生对话框选择本地文件（可多选），返回绝对路径数组；取消时为空数组 */
export async function pickAttachmentPaths(): Promise<string[]> {
  return invoke<string[]>("pick_attachment_paths");
}

/** 用系统默认程序打开本地文件；成功返回 null，失败返回错误信息 */
export async function openLocalFile(path: string): Promise<string | null> {
  try {
    await invoke("open_attachment", { path });
    return null;
  } catch (e) {
    return typeof e === "string" ? e : "打开文件失败";
  }
}

/** 发送系统原生通知；返回错误信息或 null（成功） */
export async function sendNativeNotification(title: string, body: string): Promise<string | null> {
  try {
    await invoke("notify", { title, body });
    return null;
  } catch (e) {
    return typeof e === "string" ? e : "通知发送失败";
  }
}

/** 设置开机自启 */
export async function setAutostart(enabled: boolean): Promise<string | null> {
  try {
    await invoke("set_autostart", { enabled });
    return null;
  } catch (e) {
    return typeof e === "string" ? e : "设置开机自启失败";
  }
}

/** 查询开机自启状态 */
export async function autostartEnabled(): Promise<boolean> {
  return invoke<boolean>("autostart_enabled");
}

/** 检查并安装更新；返回结果文案（成功）或错误信息 */
export async function checkForUpdate(): Promise<string> {
  return invoke<string>("check_for_update");
}

// ── 桌面挂件（P0 骨架）───────────────────────────────────────

/** 显示/隐藏桌面月历挂件 */
export async function toggleWidget(): Promise<string | null> {
  try {
    await invoke("toggle_widget");
    return null;
  } catch (e) {
    return typeof e === "string" ? e : "切换挂件失败";
  }
}

/** 切换挂件鼠标穿透（true=点击穿透到桌面） */
export async function setWidgetPassthrough(enabled: boolean): Promise<string | null> {
  try {
    await invoke("set_widget_passthrough", { enabled });
    return null;
  } catch (e) {
    return typeof e === "string" ? e : "切换穿透失败";
  }
}

/** 挂件贴桌面（true=置于所有窗口之下；Windows 生效，其他平台静默成功） */
export async function setWidgetStick(stick: boolean): Promise<string | null> {
  try {
    await invoke("set_widget_stick", { stick });
    return null;
  } catch (e) {
    return typeof e === "string" ? e : "设置贴桌面失败";
  }
}

/** 从挂件唤起主窗口 */
export async function showMainWindow(): Promise<string | null> {
  try {
    await invoke("show_main_window");
    return null;
  } catch (e) {
    return typeof e === "string" ? e : "打开主窗口失败";
  }
}

/** 开始拖拽调整挂件大小（右下角手柄，无边框窗口专用） */
export async function startWidgetResize(): Promise<string | null> {
  try {
    await invoke("start_widget_resize");
    return null;
  } catch (e) {
    return typeof e === "string" ? e : "调整挂件大小失败";
  }
}

/** 设置挂件窗口整体透明度（0~1）。内部 60ms 防抖，避免滑块高频调用 Rust。
 *  弹窗（设置/详情）打开时由 widget 传 1 拉满，关闭恢复滑块值。 */
let opacityTimer: ReturnType<typeof setTimeout> | undefined;
export function setWidgetOpacity(opacity: number): void {
  if (!isTauri) return;
  if (opacityTimer) clearTimeout(opacityTimer);
  opacityTimer = setTimeout(() => {
    invoke("set_widget_opacity", { value: opacity }).catch(() => {});
  }, 60);
}
