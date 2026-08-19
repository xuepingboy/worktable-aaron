// 共享布局：AppShell 包裹所有子路由
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_layout")({
  component: Layout,
});

function Layout() {
  return <AppShell />;
}