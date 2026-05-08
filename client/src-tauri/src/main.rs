#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use serde::Serialize;

#[derive(Serialize)]
struct CursorPos {
    x: f64,
    y: f64,
}

#[tauri::command]
fn set_ignore_cursor_events(window: tauri::Window, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}

#[tauri::command]
fn get_cursor_position(window: tauri::Window) -> Result<CursorPos, String> {
    let pos = window.cursor_position().map_err(|e| e.to_string())?;
    Ok(CursorPos { x: pos.x, y: pos.y })
}

#[tauri::command]
fn close_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            set_ignore_cursor_events,
            get_cursor_position,
            close_app,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let monitor = window.current_monitor().unwrap().unwrap();
            let size = monitor.size();
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: size.width,
                height: size.height,
            }));
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: 0,
                y: 0,
            }));
            let _ = window.set_ignore_cursor_events(true);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
