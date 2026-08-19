// 工作计划管理工作台 - 绿色版静态托管服务（零依赖）
// 仅托管 public/（前端构建产物）+ /api/health 健康检查
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 3017);
const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);

    // 健康检查
    if (url.pathname === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, name: "planner" }));
      return;
    }

    // 静态文件（SPA 回退到 index.html）
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const filePath = resolve(join(ROOT, "." + pathname));
    // 防目录穿越
    if (relative(ROOT, filePath).startsWith("..")) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    try {
      const data = await readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
      res.end(data);
    } catch {
      // SPA 路由回退
      const idx = await readFile(join(ROOT, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(idx);
    }
  } catch (e) {
    res.writeHead(500);
    res.end("Internal Server Error: " + (e && e.message ? e.message : e));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[工作计划管理工作台] 服务已启动: http://localhost:${PORT}`);
});
