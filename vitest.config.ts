import react from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// 单元测试配置：对齐 vite.config.ts 的 @ 别名与 React 插件
export default defineConfig({
  plugins: [react(), tsConfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
