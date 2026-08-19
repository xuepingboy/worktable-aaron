// 全局布局：顶栏 Tab 切换四视图 + 新增任务 + 更多菜单
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { CalendarDays, CalendarRange, ListTodo, Moon, Plus, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MoreMenu } from "./MoreMenu";
import { ReminderCenter } from "./ReminderCenter";
import { usePlannerStore } from "@/store/plannerStore";

const THEME_KEY = "planner-theme";

const TABS = [
  { to: "/today", label: "今日", Icon: ListTodo },
  { to: "/week", label: "周", Icon: CalendarDays },
  { to: "/month", label: "月", Icon: CalendarRange },
  { to: "/tasks", label: "明细", Icon: ListTodo },
] as const;

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    } catch {
      return "light"; // 隐私模式/禁用存储时降级默认主题
    }
  });
  const openTaskForm = usePlannerStore((s) => s.openTaskForm);

  // 初始化时应用持久化的主题
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // 全局快捷键：N 新增任务；1-4 切换视图
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openTaskForm();
        return;
      }
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      if (idx >= 0) {
        e.preventDefault();
        navigate({ to: TABS[idx].to });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTaskForm, navigate]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // 存储不可用时仅本会话生效
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <ReminderCenter />
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ListTodo size={16} />
            </span>
            <span className="hidden sm:inline">工作计划</span>
          </div>

          <nav className="ml-2 flex items-center gap-1 rounded-lg bg-muted p-1">
            {TABS.map(({ to, label, Icon }) => {
              const active = location.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon size={15} />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="切换主题">
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </Button>
            <MoreMenu />
            <Button size="sm" onClick={() => openTaskForm()}>
              <Plus size={16} className="mr-1" />
              新增
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}