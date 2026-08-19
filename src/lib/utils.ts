import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Priority } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 优先级文字颜色（统一各视图展示） */
export const PRIORITY_TEXT: Record<Priority, string> = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-slate-400",
};

/** 优先级圆点颜色（统一各视图展示） */
export const PRIORITY_DOT: Record<Priority, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-slate-400",
};

/** 优先级柔和背景色（月视图任务块用；low 用蓝色避免与完成划线变灰混淆） */
export const PRIORITY_BG: Record<Priority, string> = {
  high: "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  low: "bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-200",
};
