// 根路径重定向到 /today
import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  return <Navigate to="/today" replace />;
}