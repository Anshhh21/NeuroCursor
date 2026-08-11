// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[tauri::command]
fn move_mouse(x: f64, y: f64) {
    use enigo::{Enigo, Mouse, Settings, Coordinate};
    let mut enigo = Enigo::new(&Settings::default()).unwrap();
    let _ = enigo.move_mouse(x as i32, y as i32, Coordinate::Abs);
}
#[tauri::command]
fn mouse_click(button: String) {
    use enigo::{Enigo, Mouse, Settings, Button, Direction};
    let mut enigo = Enigo::new(&Settings::default()).unwrap();
    let btn = match button.as_str() {
        "right" => Button::Right,
        _ => Button::Left,
    };
    let _ = enigo.button(btn, Direction::Click);
}

#[tauri::command]
fn mouse_scroll(length: i32) {
    use enigo::{Enigo, Mouse, Settings, Axis};
    let mut enigo = Enigo::new(&Settings::default()).unwrap();
    let _ = enigo.scroll(length, Axis::Vertical);
}

use std::sync::atomic::{AtomicBool, Ordering};
static ENGINE_STARTED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
async fn start_engine(app: tauri::AppHandle) -> Result<(), String> {
    // Only start once
    if ENGINE_STARTED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    #[cfg(debug_assertions)]
    {
        use tauri::Emitter;
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            use std::process::{Command, Stdio};
            let manifest_dir = env!("CARGO_MANIFEST_DIR");
            let python = format!("{}/../../engine/.venv/bin/python3", manifest_dir);
            let engine_src = format!("{}/../../engine/src", manifest_dir);
            let mut child = Command::new(&python)
                .args(["-m", "neurocursor"])
                .current_dir(&engine_src)
                .env("PYTHONPATH", &engine_src)
                .stdout(Stdio::piped())
                .spawn()
                .expect("[DEV] Failed to spawn Python engine");

            if let Some(stdout) = child.stdout.take() {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let trimmed = line.trim().to_string();
                        if !trimmed.is_empty() {
                            let _ = app.emit("engine-event", trimmed);
                        }
                    }
                }
            }
            if let Some(stderr) = child.stderr.take() {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let trimmed = line.trim().to_string();
                        if !trimmed.is_empty() {
                            let _ = app.emit("engine-error", trimmed);
                        }
                    }
                }
            }
        });
    }

    #[cfg(not(debug_assertions))]
    {
        use tauri::Emitter;
        use tauri_plugin_shell::ShellExt;
        use tauri_plugin_shell::process::CommandEvent;

        let sidecar_command = app.shell().sidecar("neurocursor-engine").map_err(|e| e.to_string())?;

        tauri::async_runtime::spawn(async move {
            let (mut rx, child) = sidecar_command.spawn().expect("Failed to spawn sidecar");
            let _child_process = child;
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        if let Ok(line_str) = String::from_utf8(line) {
                            let trimmed = line_str.trim();
                            if !trimmed.is_empty() {
                                let _ = app.emit("engine-event", trimmed);
                            }
                        }
                    }
                    CommandEvent::Stderr(line) => {
                        if let Ok(line_str) = String::from_utf8(line) {
                            let trimmed = line_str.trim();
                            if !trimmed.is_empty() {
                                let _ = app.emit("engine-error", trimmed);
                            }
                        }
                    }
                    _ => {}
                }
            }
        });
    }

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![move_mouse, mouse_click, mouse_scroll, start_engine]) 
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}