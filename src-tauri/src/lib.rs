// 工作计划管理工作台 - Tauri 桌面壳
// Rust 侧职责：附件链接模式（对话框选路径 / 系统默认程序打开）、原生通知、
// 开机自启、托盘（关闭到托盘）、可选自动更新。
// 前端通过 window.__TAURI_INTERNALS__.invoke 调用下方命令（见 src/lib/tauri.ts）。
use tauri::Manager;

// ── 附件：链接本地原文件（P1）──────────────────────────────

/// 原生文件对话框（可多选），返回本地绝对路径列表；用户取消时返回空数组
#[tauri::command]
fn pick_attachment_paths(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter(
            "常用文件",
            &[
                "doc", "docx", "xls", "xlsx", "pdf", "txt", "md", "csv",
                "png", "jpg", "jpeg", "gif", "bmp", "zip", "rar", "7z",
            ],
        )
        .pick_files(move |paths| {
            let picked = paths
                .map(|list| list.into_iter().map(|p| p.to_string()).collect::<Vec<_>>())
                .unwrap_or_default();
            let _ = tx.send(picked);
        });
    rx.recv().map_err(|e| format!("文件选择对话框异常：{e}"))
}

/// 用系统默认程序打开本地文件（不复制）。文件缺失时返回错误信息供前端兜底提示
#[tauri::command]
fn open_attachment(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        let name = p
            .file_name()
            .map(|f| f.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.clone());
        return Err(format!("文件不存在或已被移动：{name}"));
    }
    tauri_plugin_opener::open_path(p, None::<&str>).map_err(|e| format!("打开文件失败：{e}"))
}

// ── 原生通知（P2）──────────────────────────────────────────

/// 发送系统通知（Windows 为 Toast）；失败返回错误信息
#[tauri::command]
fn notify(title: String, body: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

// ── 开机自启（P2）──────────────────────────────────────────

#[tauri::command]
fn set_autostart(enabled: bool, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let launcher = app.autolaunch();
    let result = if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    };
    result.map_err(|e| e.to_string())
}

#[tauri::command]
fn autostart_enabled(app: tauri::AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

// ── 桌面挂件（第二个透明置顶窗口）────────────────────────────

/// 挂件位置记忆文件（应用数据目录，文本格式 "x,y"；零依赖，无需额外插件）
fn widget_pos_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join("widget-pos.txt")
}

/// 应用挂件位置：有记忆则恢复，否则定位当前显示器右上角
fn apply_widget_position(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("widget") {
        if let Ok(text) = std::fs::read_to_string(widget_pos_path(app)) {
            if let Some((x, y)) = text.trim().split_once(',') {
                if let (Ok(x), Ok(y)) = (x.parse::<i32>(), y.parse::<i32>()) {
                    let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
                    return;
                }
            }
        }
        // 无记忆 → 当前显示器右上角
        if let Ok(Some(mon)) = w.current_monitor() {
            let size = w.outer_size().unwrap_or_default();
            let msize = mon.size();
            let x = (msize.width as i32 - size.width as i32 - 24).max(0);
            let _ = w.set_position(tauri::PhysicalPosition::new(x, 48));
        }
    }
}

/// 显示/隐藏桌面月历挂件；显示时恢复记忆位置（无记忆则右上角）
#[tauri::command]
fn toggle_widget(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("widget") {
        if w.is_visible().unwrap_or(false) {
            w.hide().map_err(|e| e.to_string())?;
        } else {
            apply_widget_position(&app);
            let _ = w.show();
            let _ = w.set_always_on_top(true);
        }
    }
    Ok(())
}

/// 切换挂件鼠标穿透（true = 点击穿透到桌面，挂件不可交互）
#[tauri::command]
fn set_widget_passthrough(enabled: bool, app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("widget") {
        w.set_ignore_cursor_events(enabled).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 挂件「贴桌面」（Windows）：置于所有窗口之下、壁纸之上（bottom-most）。
/// 贴桌面需取消置顶（二者互斥）；取消贴桌面恢复置顶。
#[cfg(target_os = "windows")]
#[tauri::command]
fn set_widget_stick(stick: bool, app: tauri::AppHandle) -> Result<(), String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };
    if let Some(w) = app.get_webview_window("widget") {
        let _ = w.set_always_on_top(!stick);
        if stick {
            let Ok(handle) = w.window_handle() else { return Ok(()); };
            let RawWindowHandle::Win32(h) = handle.as_raw() else { return Ok(()); };
            const HWND_BOTTOM: HWND = 1 as HWND;
            unsafe {
                SetWindowPos(
                    h.hwnd.get() as *mut core::ffi::c_void,
                    HWND_BOTTOM,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
        }
    }
    Ok(())
}

/// 非 Windows：贴桌面无对应 API，静默成功（前端开关仍可显示）
#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn set_widget_stick(_stick: bool, _app: tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

/// 从挂件唤起主窗口
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 开始拖拽调整挂件窗口大小（右下角手柄；无边框窗口无系统 resize 边缘，需手动调用）
#[tauri::command]
fn start_widget_resize(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_runtime::ResizeDirection;
    // start_resize_dragging 仅在 tauri::window::Window 上提供（WebviewWindow 无此方法）
    if let Some(w) = app.get_window("widget") {
        w.start_resize_dragging(ResizeDirection::SouthEast)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 设置挂件窗口整体透明度（0.0~1.0）。
/// 注：tauri 2.11.x（当前最新）在 Rust/JS 两侧均无运行时透明度 API（无 set_opacity /
/// window-opacity feature，docs.rs 与 @tauri-apps/api 源码已确认），
/// 故用 Windows 原生 SetLayeredWindowAttributes 实现窗口级透明度（方案 A 的等价实现）。
#[cfg(target_os = "windows")]
#[tauri::command]
fn set_widget_opacity(value: f64, app: tauri::AppHandle) -> Result<(), String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, GWL_EXSTYLE, LWA_ALPHA,
        WS_EX_LAYERED,
    };
    if let Some(w) = app.get_webview_window("widget") {
        let Ok(handle) = w.window_handle() else { return Ok(()); };
        let RawWindowHandle::Win32(h) = handle.as_raw() else { return Ok(()); };
        let hwnd = h.hwnd.get() as *mut core::ffi::c_void;
        unsafe {
            // 分层窗口（layered）是 SetLayeredWindowAttributes 生效的前提
            let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style | WS_EX_LAYERED as isize);
            // 透明度：1.0 → 255（完全不透明），0.0 → 0（完全透明）
            let alpha = (value.clamp(0.0, 1.0) * 255.0).round() as u8;
            SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA);
        }
    }
    Ok(())
}

/// 非 Windows：透明度无对应原生 API，静默成功（前端开关仍可显示）
#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn set_widget_opacity(_value: f64, _app: tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

// ── 应用信息 / 自动更新（P2，更新需 updater 特性）────────────

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// 检查并安装更新。未启用 updater 特性时返回明确提示（前端 toast 展示）
#[tauri::command]
async fn check_for_update(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(feature = "updater")]
    {
        use tauri_plugin_updater::UpdaterExt;
        let updater = app.updater().map_err(|e| e.to_string())?;
        let update = updater.check().await.map_err(|e| e.to_string())?;
        match update {
            Some(u) => {
                u.download_and_install(|_, _| {}, |_| {})
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(format!("已下载新版本 v{}，重启应用后生效", u.version))
            }
            None => Ok("已是最新版本".to_string()),
        }
    }
    #[cfg(not(feature = "updater"))]
    {
        let _ = app;
        Err("未启用自动更新（需生成更新签名密钥并开启 updater 特性）".to_string())
    }
}

// ── 托盘（P2）──────────────────────────────────────────────

#[cfg(desktop)]
fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};

    let show_item = MenuItem::with_id(app, "show", "打开主界面", true, None::<&str>)?;
    let widget_item = MenuItem::with_id(app, "widget", "显示/隐藏桌面挂件", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &widget_item, &quit_item])?;

    let icon = app
        .default_window_icon()
        .expect("缺少默认窗口图标")
        .clone();

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("工作计划管理工作台")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "widget" => {
                let _ = toggle_widget(app.clone());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            {
                if let Some(w) = tray.app_handle().get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}

// ── 入口 ───────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .invoke_handler(tauri::generate_handler![
            pick_attachment_paths,
            open_attachment,
            notify,
            set_autostart,
            autostart_enabled,
            app_version,
            check_for_update,
            toggle_widget,
            set_widget_passthrough,
            set_widget_stick,
            show_main_window,
            start_widget_resize,
            set_widget_opacity,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            setup_tray(app.handle())?;
            // 恢复挂件记忆位置（无记忆时由 apply_widget_position 落右上角）
            apply_widget_position(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            // 关闭窗口 → 隐藏到托盘（退出请用托盘菜单）
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
            // 挂件移动 → 节流记忆位置（>800ms 才写盘，避免拖动时高频 IO）
            if window.label() == "widget" {
                if let tauri::WindowEvent::Moved(pos) = event {
                    use std::sync::atomic::{AtomicU64, Ordering};
                    static LAST_MS: AtomicU64 = AtomicU64::new(0);
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;
                    if now.saturating_sub(LAST_MS.load(Ordering::Relaxed)) > 800 {
                        LAST_MS.store(now, Ordering::Relaxed);
                        let app = window.app_handle();
                        let text = format!("{},{}", pos.x, pos.y);
                        let _ = std::fs::write(widget_pos_path(app), text);
                    }
                }
            }
        });

    // 自动更新为可选特性：开启时用影子变量追加插件，关闭时零开销（避免 unused_mut 警告）
    #[cfg(feature = "updater")]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("工作计划管理工作台启动失败");
}
