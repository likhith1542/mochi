#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Global cursor position in physical pixels. The frontend polls this to decide
/// when the overlay should capture the mouse (cursor over the pet) versus
/// letting clicks pass through to whatever is underneath.
#[tauri::command]
fn cursor_pos(app: tauri::AppHandle) -> Result<(f64, f64), String> {
    app.cursor_position()
        .map(|p| (p.x, p.y))
        .map_err(|e| e.to_string())
}

/// Bounds of the frontmost window (not ours), in top-left-origin screen
/// coordinates. The pet uses its top edge as a ledge to sit on.
#[tauri::command]
fn active_window_rect() -> Option<(f64, f64, f64, f64)> {
    let w = active_win_pos_rs::get_active_window().ok()?;
    if w.process_id == std::process::id() as u64 {
        return None;
    }
    let p = w.position;
    if p.width < 160.0 || p.height < 100.0 {
        return None;
    }
    Some((p.x, p.y, p.width, p.height))
}

/// Fetch an iCal (ICS) feed for calendar sync. Runs in Rust because the
/// webview's fetch is blocked by CORS on calendar servers.
#[tauri::command]
async fn fetch_ics(url: String) -> Result<String, String> {
    let url = url.trim().replacen("webcal://", "https://", 1);
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("invalid url".into());
    }
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.text().await.map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            cursor_pos,
            active_window_rect,
            fetch_ics
        ])
        .setup(|_app| {
            // No Dock icon / app switcher entry on macOS — it's an overlay, not an app window.
            #[cfg(target_os = "macos")]
            _app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running pet");
}
