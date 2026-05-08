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
    let cursor = window.cursor_position().map_err(|e| e.to_string())?;
    let win_pos = window.outer_position().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    Ok(CursorPos {
        x: (cursor.x - win_pos.x as f64) / scale,
        y: (cursor.y - win_pos.y as f64) / scale,
    })
}

#[tauri::command]
fn close_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn start_dragging(window: tauri::Window) {
    let _ = window.start_dragging();
}

#[tauri::command]
fn enter_overlay(window: tauri::Window) {
    if let Some(monitor) = window.current_monitor().ok().flatten() {
        let size = monitor.size();
        let pos = monitor.position();
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: pos.x,
            y: pos.y,
        }));
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: size.width,
            height: size.height,
        }));
    }
    let _ = window.set_resizable(false);
    let _ = window.set_ignore_cursor_events(true);
}

#[tauri::command]
fn switch_monitor(window: tauri::Window) {
    if let Ok(monitors) = window.available_monitors() {
        if monitors.len() < 2 { return; }

        let _ = window.set_ignore_cursor_events(false);

        let current_pos = window.outer_position().unwrap_or(tauri::PhysicalPosition { x: 0, y: 0 });

        let mut current_idx = 0;
        for (i, m) in monitors.iter().enumerate() {
            let pos = m.position();
            let size = m.size();
            if current_pos.x >= pos.x && current_pos.x < pos.x + size.width as i32 {
                current_idx = i;
                break;
            }
        }

        let next_idx = (current_idx + 1) % monitors.len();
        let next = &monitors[next_idx];
        let size = next.size();
        let pos = next.position();

        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: pos.x,
            y: pos.y,
        }));
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: size.width,
            height: size.height,
        }));

        let _ = window.set_ignore_cursor_events(true);
    }
}

#[tauri::command]
fn exit_overlay(window: tauri::Window) {
    let _ = window.set_ignore_cursor_events(false);
    let _ = window.set_resizable(true);
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: 900.0,
        height: 750.0,
    }));
    let _ = window.center();
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
            start_dragging,
            enter_overlay,
            switch_monitor,
            exit_overlay,
            take_screenshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
