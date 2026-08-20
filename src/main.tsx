// 应用入口：样式在 ./styles.css（Tailwind v4 + design token），路由见 ./router.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { initRevealEngine } from "./lib/reveal-engine";
import "./styles.css";

// 全局滚动渐入引擎：业务元素只需加 class="reveal"（详见 lib/reveal-engine.ts），勿删
initRevealEngine();

const router = getRouter();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

// 主窗口：React 渲染完成后主动显示（配合 tauri.conf visible:false 消除启动白屏）；
// 挂件窗口（/widget）由托盘 toggle 控制显隐，不受影响
if (
  !import.meta.env.SSR &&
  typeof window !== "undefined" &&
  window.location.pathname !== "/widget"
) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // 动态 import 避免 Web 版打包报错：isTauri 判断在 tauri.ts 内部
      import("./lib/tauri").then(({ showMainWindow }) => void showMainWindow());
    });
  });
}

// PWA：生产环境注册 Service Worker（离线缓存 + 可安装），开发环境不注册避免干扰 HMR
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service Worker 注册失败（不影响使用）:", err);
    });
  });
}
