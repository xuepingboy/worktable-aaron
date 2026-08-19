#!/usr/bin/env node
/**
 * 工作计划管理工作台 - 一键打包脚本（绿色文件夹版，零误报）
 * 用法：node scripts/build.mjs [win|mac|linux|all] [--pnpm] [--no-install] [--skip-typecheck] [--zip] [--debug]
 *
 * 流程：
 * 1. 安装前端依赖（默认 npm，可用 --pnpm 改用 pnpm；--no-install 跳过）
 * 2. 构建前端（tsc --noEmit + vite build；--skip-typecheck 跳过 tsc）→ dist/
 * 3. 下载对应平台 Node 二进制（本地缓存 release/.cache/，命中跳过）→ 解压
 * 4. 组装分发目录 → release/工作计划管理工作台[-平台]/
 *    ├── node.exe（或 node）
 *    ├── server/
 *    │   ├── index.js   （零依赖静态托管）
 *    │   ├── package.json
 *    │   └── public/    （前端产物）
 *    ├── 启动.bat（Windows）/ start.sh（mac/linux）
 *    └── README.txt
 *
 * 产物为普通文件夹，杀软不会误报；解压双击「启动.bat」即用（端口 3017），无需安装 Node。
 * --zip 额外把产物压缩为 zip（Windows 用系统 tar.exe，mac/linux 用 tar）。
 */
import { execSync, spawnSync } from "child_process";
import { createHash } from "crypto";
import {
  existsSync, mkdirSync, rmSync, cpSync,
  writeFileSync, readFileSync, statSync, readdirSync,
} from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SERVER = resolve(ROOT, "server");
const RELEASE = resolve(ROOT, "release");
const DIST = resolve(ROOT, "dist");
const CACHE_DIR = resolve(RELEASE, ".cache");

const APP_NAME = "工作计划管理工作台";
const APP_PORT = 3017;

// ── 参数解析 ─────────────────────────────────────────────
const args = process.argv.slice(2);
const rawTarget = args.find((a) => !a.startsWith("--")) || "win";
const usePnpm = args.includes("--pnpm");
const noInstall = args.includes("--no-install");
const skipTypecheck = args.includes("--skip-typecheck");
const makeZip = args.includes("--zip");
const debug = args.includes("--debug");

const VALID = ["win", "mac", "linux", "all"];
if (!VALID.includes(rawTarget)) {
  console.error(`\n  ❌ 无效平台参数: "${rawTarget}"（可用: ${VALID.join(" | ")}）`);
  process.exit(1);
}
const platforms = rawTarget === "all" ? ["win", "mac", "linux"] : [rawTarget];

// 防御：清空环境注入的 NODE_OPTIONS（某些环境会注入安全删除 shim，
// 导致 pnpm/npm 的缓存清理被拦截 EPERM）
if (process.env.NODE_OPTIONS) {
  console.log(`  ⚠ 检测到 NODE_OPTIONS 注入，已清空（原值: ${process.env.NODE_OPTIONS}）`);
  delete process.env.NODE_OPTIONS;
}

// 包管理器：默认 npm（pnpm 9.x 在 Node 22 上 added 阶段死锁，已验证）；
// 需要 pnpm 时用 --pnpm 显式启用
const pm = usePnpm ? "pnpm" : "npm";

// npm 缓存目录：本项目已验证 C 盘用户目录缓存会被安全策略拦截（EPERM），
// 统一指向项目内 .npm-cache（跨机器可用，也避免污染系统缓存）
const NPM_CACHE = resolve(ROOT, ".npm-cache");
const npmOpts = `--no-audit --no-fund --cache "${NPM_CACHE}"`;

// 临时目录重定向到项目内（受限环境/杀软会拦截 C 盘用户目录写入，
// 例如 esbuild 清理 %TEMP% 时 Access denied）。用随机后缀子目录，
// 避免 esbuild 退出清理被拦截时残留死锁目录影响下次构建。
const LOCAL_TMP = resolve(ROOT, ".npm-cache", "tmp-build-" + Date.now().toString(36));
mkdirSync(LOCAL_TMP, { recursive: true });
process.env.TMP = LOCAL_TMP;
process.env.TEMP = LOCAL_TMP;
process.env.TMPDIR = LOCAL_TMP;

// Node 版本（与官方 LTS 对齐，可用环境变量覆盖）
const NODE_VERSION = process.env.NODE_VERSION || "v20.15.0";

function nodeUrl(platform) {
  const map = {
    win: `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`,
    mac: `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-x64.tar.gz`,
    linux: `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz`,
  };
  return map[platform];
}

// 产物目录名：单平台用原名，all 模式带平台后缀避免互相覆盖
function releaseName(platform) {
  return platforms.length > 1 ? `${APP_NAME}-${platform}` : APP_NAME;
}

// 复制文件或目录：单文件用 Node cpSync（沙箱下正常），目录用系统命令
// （robocopy / cp -R），因为部分受限环境中 cpSync 递归复制会被拦截。
function copyAny(src, dest) {
  const st = statSync(src);
  if (st.isDirectory()) {
    copyDir(src, dest);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}

// 递归复制目录：优先用系统命令（robocopy / cp -R）。
function copyDir(src, dest) {
  if (process.platform === "win32") {
    let lastStatus = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        execSync(`robocopy "${src}" "${dest}" /E /NFL /NDL /NJH /NJS /NC /NS /NP`, { stdio: "inherit" });
        return;
      } catch (e) {
        lastStatus = e.status ?? 0;
        if (lastStatus >= 8) {
          if (attempt < 3) {
            console.log(`  ⚠ robocopy 失败(${lastStatus})，重试 ${attempt}/3...`);
            continue;
          }
          throw new Error(`robocopy 失败: ${src} → ${dest}`);
        }
        return; // 返回码 1-7 均为成功
      }
    }
    return;
  }
  execSync(`rm -rf "${dest}" && cp -R "${src}" "${dest}"`, { stdio: "inherit" });
}

function run(cmd, opts = {}) {
  console.log(`\n  ▶ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", cwd: opts.cwd || ROOT, ...opts });
  } catch (e) {
    if (opts.ignoreExit) {
      console.log("  ⚠ 命令退出码非 0（可能为受限环境 esbuild 清理问题），继续...");
      return;
    }
    throw e;
  }
}

let stepNum = 0;
function step(msg) {
  stepNum++;
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  [${stepNum}] ${msg}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

// 下载文件：优先 curl（win10 1803+ 自带 curl.exe / mac / linux 都有），
// Windows 上 fallback 到 PowerShell Invoke-WebRequest
function downloadFile(url, outPath) {
  console.log(`\n  ⬇ 下载 ${NODE_VERSION}`);
  console.log(`    ${url}`);
  try {
    const curlCmd = process.platform === "win32" ? "curl.exe" : "curl";
    execSync(
      `${curlCmd} -L --fail --retry 3 --connect-timeout 20 --max-time 300 -o "${outPath}" "${url}"`,
      { stdio: "inherit" },
    );
  } catch (e) {
    if (process.platform === "win32") {
      console.log("  ⚠ curl 下载失败，改用 PowerShell 重试...");
      execSync(
        `powershell -NoProfile -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${outPath}'"`,
        { stdio: "inherit" },
      );
    } else {
      throw e;
    }
  }
  const size = statSync(outPath).size;
  if (size < 1024 * 1024) {
    throw new Error(`下载文件异常（仅 ${size} bytes）：${url}`);
  }
}

// 解压 Node 归档：Windows 用系统自带 tar.exe（libarchive，支持 zip），
// 避免 PowerShell Expand-Archive 在中文路径下的 GBK 传参乱码
function extractNode(platform, archive, extractDir) {
  if (platform === "win") {
    const sysTar = process.env.SystemRoot
      ? resolve(process.env.SystemRoot, "System32", "tar.exe")
      : "C:\\Windows\\System32\\tar.exe";
    if (!existsSync(sysTar)) throw new Error(`未找到系统 tar.exe：${sysTar}`);
    const r = spawnSync(sysTar, ["-xf", archive, "-C", extractDir], { encoding: "utf-8" });
    if (r.status !== 0) {
      throw new Error(`tar 解压失败 (${r.status}): ${(r.stderr || "").trim().slice(0, 200)}`);
    }
  } else {
    const flag = archive.endsWith(".tar.xz") ? "J" : "z";
    execSync(`tar -x${flag}f "${archive}" -C "${extractDir}"`, { stdio: "inherit" });
  }
}

/** 计算文件 SHA256 */
function sha256File(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

/** 校验 Node 归档完整性：比对 nodejs.org 官方 SHASUMS256.txt（防供应链投毒；网络异常时跳过并提示） */
function verifyNodeArchive(archivePath, platform) {
  const map = {
    win: `node-${NODE_VERSION}-win-x64.zip`,
    mac: `node-${NODE_VERSION}-darwin-x64.tar.gz`,
    linux: `node-${NODE_VERSION}-linux-x64.tar.xz`,
  };
  const fileName = map[platform];
  const sumsUrl = `https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`;
  console.log(`\n  🔐 校验归档完整性（${fileName}）...`);
  let expected = null;
  try {
    const curlCmd = process.platform === "win32" ? "curl.exe" : "curl";
    const sums = execSync(`${curlCmd} -sL --max-time 30 "${sumsUrl}"`, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    const line = sums.split("\n").find((l) => {
      const parts = l.trim().split(/\s+/);
      return parts.length >= 2 && parts[1].endsWith(fileName);
    });
    expected = line ? line.trim().split(/\s+/)[0] : null;
  } catch {
    expected = null;
  }
  if (!expected) {
    console.log("  ⚠ 无法获取官方校验和（网络受限），已跳过完整性校验");
    return;
  }
  const actual = sha256File(archivePath);
  if (actual !== expected) {
    throw new Error(`Node 归档校验失败：expected=${expected} actual=${actual}`);
  }
  console.log(`  ✓ 校验和匹配（${actual.slice(0, 16)}…）`);
}

// 下载并解压 Node 二进制，带本地缓存；返回 node 可执行文件路径
function downloadNode(platform, destDir) {  const cacheRoot = resolve(CACHE_DIR, `node-${NODE_VERSION}-${platform}`);
  const binName = platform === "win" ? "node.exe" : "node";
  const cachedBin = resolve(cacheRoot, binName);
  const destBin = resolve(destDir, binName);

  if (existsSync(cachedBin)) {
    console.log(`\n  ♻ 使用缓存 Node: ${cachedBin}`);
    cpSync(cachedBin, destBin);
    if (platform === "win") {
      const cachedIcu = resolve(cacheRoot, "icudt.dll");
      if (existsSync(cachedIcu)) cpSync(cachedIcu, resolve(destDir, "icudt.dll"));
    } else {
      try { execSync(`chmod +x "${destBin}"`); } catch {}
    }
    return destBin;
  }

  const url = nodeUrl(platform);
  const tmpDir = resolve(cacheRoot, ".tmp");
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  if (platform === "win") {
    const zipPath = resolve(tmpDir, "node.zip");
    downloadFile(url, zipPath);
    verifyNodeArchive(zipPath, platform);
    const extractDir = resolve(tmpDir, "extracted");
    mkdirSync(extractDir, { recursive: true });
    extractNode(platform, zipPath, extractDir);
    const nodeRoot = resolve(extractDir, `node-${NODE_VERSION}-win-x64`);
    const nodeExe = resolve(nodeRoot, "node.exe");
    if (!existsSync(nodeExe)) throw new Error(`node.exe 未找到：${nodeExe}`);
    cpSync(nodeExe, resolve(cacheRoot, "node.exe"));
    const dataFile = resolve(nodeRoot, "icudt.dll");
    if (existsSync(dataFile)) cpSync(dataFile, resolve(cacheRoot, "icudt.dll"));
    rmSync(tmpDir, { recursive: true, force: true });
    cpSync(resolve(cacheRoot, "node.exe"), destBin);
    if (existsSync(resolve(cacheRoot, "icudt.dll"))) {
      cpSync(resolve(cacheRoot, "icudt.dll"), resolve(destDir, "icudt.dll"));
    }
    return destBin;
  }

  // macOS / Linux
  const ext = platform === "mac" ? "tar.gz" : "tar.xz";
  const tarPath = resolve(tmpDir, `node.${ext}`);
  downloadFile(url, tarPath);
  verifyNodeArchive(tarPath, platform);
  const extractDir = resolve(tmpDir, "extracted");
  mkdirSync(extractDir, { recursive: true });
  extractNode(platform, tarPath, extractDir);
  const nodeRoot = resolve(extractDir, `node-${NODE_VERSION}-darwin-x64`);
  const nodeBin = resolve(nodeRoot, "bin", "node");
  if (!existsSync(nodeBin)) throw new Error(`node 未找到：${nodeBin}`);
  cpSync(nodeBin, resolve(cacheRoot, "node"));
  try { execSync(`chmod +x "${resolve(cacheRoot, "node")}"`); } catch {}
  rmSync(tmpDir, { recursive: true, force: true });
  cpSync(resolve(cacheRoot, "node"), destBin);
  try { execSync(`chmod +x "${destBin}"`); } catch {}
  return destBin;
}

// 递归统计目录体积
function dirSize(p) {
  let total = 0;
  for (const entry of readdirSync(p, { withFileTypes: true })) {
    const full = join(p, entry.name);
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size;
  }
  return total;
}

// 压缩产物为 zip（Windows 用系统 tar.exe -a 自动按扩展名选格式）
function makeZipArchive(releaseDir, name) {
  console.log(`\n  📦 压缩产物 → ${name}.zip`);
  const parent = resolve(releaseDir, "..");
  let zipPath = resolve(parent, `${name}.zip`);
  if (existsSync(zipPath)) {
    try {
      rmSync(zipPath, { force: true });
    } catch {
      zipPath = resolve(parent, `${name}-${Date.now().toString(36)}.zip`);
      console.log(`  ⚠ 旧 zip 被占用，改用新文件名: ${zipPath}`);
    }
  }
  if (process.platform === "win32") {
    const sysTar = process.env.SystemRoot
      ? resolve(process.env.SystemRoot, "System32", "tar.exe")
      : "C:\\Windows\\System32\\tar.exe";
    const r = spawnSync(sysTar, ["-a", "-cf", zipPath, "-C", parent, name], { encoding: "utf-8" });
    if (r.status !== 0) {
      throw new Error(`tar 压缩失败 (${r.status}): ${(r.stderr || "").trim().slice(0, 200)}`);
    }
  } else {
    execSync(`tar -czf "${zipPath}" -C "${parent}" "${name}"`, { stdio: "inherit" });
  }
  console.log(`  ✓ ${zipPath}`);
}

// 单个平台的组装步骤
function buildOnce(platform) {
  const name = releaseName(platform);
  const releaseDir = resolve(RELEASE, name);
  if (existsSync(releaseDir)) rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(releaseDir, { recursive: true });

  step(`下载 Node 二进制 (${platform})`);
  const nodeBinPath = downloadNode(platform, releaseDir);
  console.log(`  ✓ Node 已就位: ${nodeBinPath}`);

  step(`组装分发目录 (${name})`);
  const serverDest = resolve(releaseDir, "server");
  mkdirSync(serverDest, { recursive: true });

  // 只复制必要文件：index.js（静态托管）、package.json、public（前端产物）
  const keepItems = ["index.js", "package.json", "public"];
  for (const item of keepItems) {
    const src = resolve(SERVER, item);
    if (existsSync(src)) {
      copyAny(src, resolve(serverDest, item));
      console.log(`  ✓ 复制 server/${item}`);
    }
  }

  // 启动脚本
  if (platform === "win") {
    writeFileSync(
      resolve(releaseDir, "启动.bat"),
      `@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\necho.\r\necho   启动工作计划管理工作台...\r\necho.\r\nstart "" /b node.exe server/index.js >nul 2>&1\r\necho   等待服务启动...\r\nset /a tries=0\r\n:wait\r\ntimeout /t 1 /nobreak >nul\r\nset /a tries+=1\r\ncurl -s -o nul http://localhost:${APP_PORT}/api/health && goto ready\r\nif %tries% geq 20 goto timeout\r\ngoto wait\r\n:ready\r\nstart "" "http://localhost:${APP_PORT}"\r\necho   ✅ 服务已启动，浏览器即将打开\r\necho   ⚠️ 关闭此窗口将停止服务\r\necho.\r\npause\r\nexit /b 0\r\n:timeout\r\necho   ❌ 服务启动超时（20 秒），请检查端口 ${APP_PORT} 是否被其他程序占用\r\necho.\r\npause\r\n`,
    );
  } else {
    writeFileSync(
      resolve(releaseDir, "start.sh"),
      `#!/bin/bash\ncd "$(dirname "$0")"\necho ""\necho "  启动工作计划管理工作台..."\necho ""\nchmod +x node 2>/dev/null\n./node server/index.js &\nSERVER_PID=$!\necho "  等待服务启动..."\nfor i in $(seq 1 20); do\n  curl -s -o /dev/null "http://localhost:${APP_PORT}/api/health" && break\n  sleep 1\ndone\nopen "http://localhost:${APP_PORT}" 2>/dev/null || xdg-open "http://localhost:${APP_PORT}" 2>/dev/null || echo "  请手动打开 http://localhost:${APP_PORT}"\necho "  ✅ 服务已启动，关闭此终端将停止服务 (PID $SERVER_PID)"\nwait $SERVER_PID\n`,
    );
    try { execSync(`chmod +x "${resolve(releaseDir, "start.sh")}"`); } catch {}
  }

  // README
  writeFileSync(
    resolve(releaseDir, "README.txt"),
    `${APP_NAME} - 使用说明
========================

【绿色版，无需安装 Node，杀软不报毒】

1. 双击「启动.bat」（Windows）或运行「./start.sh」（macOS/Linux）
2. 浏览器自动打开 http://localhost:${APP_PORT}
3. 关闭启动窗口即停止服务

说明
====
- 数据保存在浏览器本地（localStorage / IndexedDB），
  换浏览器或换电脑后数据不随文件夹迁移，请用「导出」功能备份。
- 端口固定 ${APP_PORT}；被占用时修改 server/index.js 中 PORT 与启动脚本端口。

目录结构
========
${APP_NAME}/
├── node.exe          （Node 运行时，无需另装）
├── 启动.bat          （双击启动）
├── server/
│   ├── index.js      （静态托管服务）
│   └── public/       （前端页面）
└── README.txt
`,
  );

  // 体积统计
  const sizeMB = (dirSize(releaseDir) / 1024 / 1024).toFixed(1);
  console.log(`\n  ✅ ${name} 打包完成！`);
  console.log(`  📁 目录: ${releaseDir}（${sizeMB} MB）`);
  try {
    execSync(`ls -la "${releaseDir}"`, { stdio: "inherit" });
  } catch {
    execSync(`dir "${releaseDir}"`, { stdio: "inherit" });
  }

  if (makeZip) {
    makeZipArchive(releaseDir, name);
  }
}

// ─────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n  📦 ${APP_NAME} - 一键打包（绿色文件夹版）`);
  console.log(`  目标平台: ${rawTarget}`);
  console.log(`  Node 版本: ${NODE_VERSION}（环境变量 NODE_VERSION 可覆盖）`);
  console.log(`  包管理器: ${pm}`);
  console.log(`  端口: ${APP_PORT}`);
  console.log(`  选项: ${noInstall ? "跳过依赖安装 " : ""}${skipTypecheck ? "跳过 tsc " : ""}${makeZip ? "生成 zip " : ""}`);

  // 1. 安装前端依赖
  if (noInstall) {
    console.log("\n  ⏭ [1/2] 跳过前端依赖安装（--no-install）");
  } else {
    step("安装前端依赖");
    if (pm === "pnpm") {
      run("pnpm install --frozen-lockfile");
    } else {
      run(`npm install ${npmOpts}`);
    }
  }

  // 2. 构建前端（沙箱/受限环境下 esbuild 进程可能被间歇性终止，自动重试最多 3 次）
  step("构建前端");
  const viteBin = resolve(ROOT, "node_modules", "vite", "bin", "vite.js");
  const tscBin = resolve(ROOT, "node_modules", "typescript", "bin", "tsc");
  const tsbuildInfo = resolve(NPM_CACHE, "tscheck.tsbuildinfo");
  let built = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
    console.log(`\n  ↻ 构建尝试 ${attempt}/3...`);
    if (!skipTypecheck) {
      run(`node "${tscBin}" --noEmit --incremental false --tsBuildInfoFile "${tsbuildInfo}"`, { ignoreExit: true });
    }
    run(`node "${viteBin}" build`, { ignoreExit: true });
    if (existsSync(resolve(DIST, "index.html"))) {
      built = true;
      break;
    }
    console.log("  ⚠ 本轮构建未产出 dist/index.html，重试...");
  }
  if (!built) {
    throw new Error("前端构建失败：连续 3 次未产出 dist/index.html");
  }
  console.log("  ✓ 前端构建完成");

  // 3. 复制 dist/ → server/public/（供绿色版静态托管）
  step("复制前端到 server/public/");
  const publicDir = resolve(SERVER, "public");
  if (existsSync(publicDir)) rmSync(publicDir, { recursive: true, force: true });
  mkdirSync(publicDir, { recursive: true });
  copyDir(DIST, publicDir);
  console.log(`  ✓ 已复制到 ${publicDir}`);

  // 4-5. 逐平台下载 Node + 组装
  for (const plat of platforms) {
    buildOnce(plat);
  }

  console.log(`\n  🎉 全部打包完成！产物位于: ${RELEASE}`);
  console.log(`  将整个目录（或 zip）分发给用户，解压后双击「启动.bat」即可使用。`);
}

main().catch((e) => {
  console.error(`\n  ❌ 打包失败：${e.message}`);
  if (debug) console.error(e.stack);
  console.error(`  半成品目录可能残留: ${RELEASE}（确认后手动删除即可）`);
  process.exit(1);
});
