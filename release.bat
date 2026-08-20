@echo off
setlocal enabledelayedexpansion
title Planner - One-click Release

echo ============================================
echo   Planner - One-click Release Script
echo ============================================
echo.

REM ========== 1. Check git ==========
where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] git not found. Please install Git for Windows.
    pause
    exit /b 1
)

REM ========== 2. Check pnpm ==========
where pnpm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] pnpm not found. Please install Node.js and pnpm.
    pause
    exit /b 1
)

REM ========== 3. Read version ==========
set "VERSION="
for /f "usebackq tokens=2 delims=:" %%a in (`findstr /c:"\"version\"" src-tauri\tauri.conf.json`) do (
    set "line=%%a"
    set "line=!line: =!"
    set "line=!line:\"=!"
    set "line=!line:,=!"
    set "VERSION=!line!"
)
if "%VERSION%"=="" (
    echo [ERROR] Cannot read version from src-tauri\tauri.conf.json
    pause
    exit /b 1
)
echo [INFO] Current version: v%VERSION%
echo.

REM ========== 4. Confirm ==========
set /p CONFIRM=Release v%VERSION% to GitHub and trigger build? (y/N): 
if /i not "%CONFIRM%"=="y" (
    echo Cancelled.
    pause
    exit /b 0
)
echo.

REM ========== 5. Local verify ==========
echo [1/5] Installing dependencies...
call pnpm install
if errorlevel 1 (
    echo [ERROR] pnpm install failed.
    pause
    exit /b 1
)
echo.

echo [2/5] Building frontend (tsc + vite build)...
call pnpm build
if errorlevel 1 (
    echo [ERROR] Frontend build failed. Fix and retry.
    pause
    exit /b 1
)
echo.

echo [3/5] Checking Rust code (cargo check)...
pushd src-tauri
call cargo check
if errorlevel 1 (
    popd
    echo [ERROR] cargo check failed. Fix and retry.
    pause
    exit /b 1
)
popd
echo.

REM ========== 6. Check remote ==========
echo [4/5] Checking remote repository...
git remote get-url origin >nul 2>nul
if errorlevel 1 (
    echo [ERROR] No origin remote configured. Run:
    echo   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
    pause
    exit /b 1
)
echo [INFO] Remote:
git remote get-url origin
echo.

REM ========== 7. Commit and push ==========
echo [5/5] Committing and pushing code...
git add .
git commit -m "release: v%VERSION%"
if errorlevel 1 (
    echo [WARN] git commit failed (no changes or pre-commit hook blocked).
    echo Continuing to tag...
)

git push origin HEAD
if errorlevel 1 (
    echo [ERROR] Code push failed. Check network and remote permissions.
    pause
    exit /b 1
)
echo.

REM ========== 8. Tag and push ==========
echo Tagging v%VERSION% and pushing...
git tag v%VERSION%
if errorlevel 1 (
    echo [ERROR] Tag failed. Tag may already exist.
    echo If tag exists, run manually: git push origin v%VERSION%
    pause
    exit /b 1
)

git push origin v%VERSION%
if errorlevel 1 (
    echo [ERROR] Tag push failed.
    pause
    exit /b 1
)
echo.

echo ============================================
echo   Release successful!
echo   Version: v%VERSION%
echo   Code and tag pushed. GitHub Actions is building.
echo   Check Actions page for progress.
echo ============================================
echo.

REM ========== 9. Auto bump version ==========
echo Bumping patch version...
set "MAJOR="
set "MINOR="
set "PATCH="
for /f "tokens=1,2,3 delims=." %%a in ("%VERSION%") do (
    set "MAJOR=%%a"
    set "MINOR=%%b"
    set "PATCH=%%c"
)
if "%PATCH%"=="" (
    echo [WARN] Invalid version format. Skip auto bump.
    pause
    exit /b 0
)
set /a NEWPATCH=%PATCH%+1
set "NEWVERSION=%MAJOR%.%MINOR%.%NEWPATCH%"
echo [INFO] New version: v%NEWVERSION%

REM Update tauri.conf.json
powershell -NoProfile -Command "(Get-Content 'src-tauri\tauri.conf.json' -Raw) -replace '\"version\"\s*:\s*\"%VERSION%\"', '\"version\": \"%NEWVERSION%\"' | Set-Content 'src-tauri\tauri.conf.json' -NoNewline -Encoding UTF8"
if errorlevel 1 (
    echo [ERROR] Failed to update tauri.conf.json.
    pause
    exit /b 1
)

REM Update Cargo.toml
powershell -NoProfile -Command "(Get-Content 'src-tauri\Cargo.toml' -Raw) -replace '^version\s*=\s*\"%VERSION%\"', 'version = \"%NEWVERSION%\"' | Set-Content 'src-tauri\Cargo.toml' -NoNewline -Encoding UTF8"
if errorlevel 1 (
    echo [ERROR] Failed to update Cargo.toml.
    pause
    exit /b 1
)

echo [INFO] Version bumped from v%VERSION% to v%NEWVERSION%
echo [INFO] Updated tauri.conf.json and Cargo.toml.
echo.
echo Please commit the version bump:
echo   git add src-tauri/tauri.conf.json src-tauri/Cargo.toml
echo   git commit -m "chore: bump version to v%NEWVERSION%"
echo   git push
echo.
pause
exit /b 0