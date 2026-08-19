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
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

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
        ])
        .setup(|app| {
            #[cfg(desktop)]
            setup_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // 关闭窗口 → 隐藏到托盘（退出请用托盘菜单）
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        });

    // 自动更新为可选特性：开启时用影子变量追加插件，关闭时零开销（避免 unused_mut 警告）
    #[cfg(feature = "updater")]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("工作计划管理工作台启动失败");
}
