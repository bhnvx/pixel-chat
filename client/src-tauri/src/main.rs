#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use serde::Serialize;
use base64::Engine;
use std::io::Cursor;

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

#[tauri::command]
fn take_screenshot(window: tauri::Window) -> Result<String, String> {
    let _ = window.hide();
    std::thread::sleep(std::time::Duration::from_millis(200));

    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let monitor = monitors.into_iter().next().ok_or("No monitor found")?;
    let img = monitor.capture_image().map_err(|e| e.to_string())?;

    let _ = window.show();

    let rgba = image::DynamicImage::from(img);
    let small = rgba.resize(640, 360, image::imageops::FilterType::Triangle);

    let mut buf = Vec::new();
    small.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
    Ok(format!("data:image/png;base64,{}", b64))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            set_ignore_cursor_events,
            get_cursor_position,
            close_app,
            take_screenshot,
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
