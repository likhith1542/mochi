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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![cursor_pos])
        .setup(|_app| {
            // No Dock icon / app switcher entry on macOS — it's an overlay, not an app window.
            #[cfg(target_os = "macos")]
            _app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running pet");
}
