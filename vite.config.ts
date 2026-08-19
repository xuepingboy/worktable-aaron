import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { existsSync } from "fs";
import { resolve } from "path";

const SOURCE_LOCATION_PLUGIN_CANDIDATES = [
  process.env.MEOO_SOURCE_LOCATION_PLUGIN_PATH,
  "/app/sdk/lib/src/plugins/source-location-babel.js",
  resolve(process.cwd(), "node_modules/@ali/oneday-agent-sdk/lib/src/plugins/source-location-babel.js"),
].filter(Boolean) as string[];

const SOURCE_LOCATION_PLUGIN_PATH = SOURCE_LOCATION_PLUGIN_CANDIDATES.find((path) => existsSync(path));

/**
 * React + Vite 构建配置
 *
 * 硬约束：
 * - dev server 必须监听 3017 + strictPort（3015 曾与其它项目冲突，2026-08-18 换至 3017）
 * - outDir 'dist' / assetsDir 'assets' — 归一化产物目录
 */
export default defineConfig({
  plugins: [
    tailwindcss(),
    TanStackRouterVite(),
    viteReact({
      babel: {
        plugins: SOURCE_LOCATION_PLUGIN_PATH
          ? [[SOURCE_LOCATION_PLUGIN_PATH, { projectRoot: process.cwd() }]]
          : [],
      },
    }),
    tsConfigPaths(),
  ],
  server: {
    host: "0.0.0.0",
    port: 3017,
    strictPort: true,
    allowedHosts: true,
    // HMR 默认关闭：沙箱预览 iframe 下 HMR 的整页 reload 会放大任何 transform error
    // 如需热更，改为: hmr: { clientPort: 443, protocol: 'wss' }
    hmr: false,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        // 大 chunk 拆分：按依赖分组，避免单包超 500KB（验收：build 无 chunk 警告）
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("xlsx")) return "xlsx"; // SheetJS 导出（单体 ~440KB，独立 chunk）
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("framer-motion")) return "motion";
          if (
            id.includes("@radix-ui") ||
            id.includes("sonner") ||
            id.includes("cmdk") ||
            id.includes("vaul") ||
            id.includes("embla-carousel") ||
            id.includes("input-otp") ||
            id.includes("react-day-picker") ||
            id.includes("react-hook-form") ||
            id.includes("clsx") ||
            id.includes("tailwind-merge") ||
            id.includes("class-variance-authority")
          )
            return "ui";
          if (id.includes("date-fns")) return "date";
          if (
            id.includes("react") ||
            id.includes("@tanstack") ||
            id.includes("zustand") ||
            id.includes("scheduler")
          )
            return "react-vendor";
          return "vendor";
        },
      },
    },
  },
});
