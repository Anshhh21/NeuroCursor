// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[tauri::command]
fn move_mouse(x: f64, y: f64) {
    use enigo::{Enigo, Mouse, Settings, Coordinate};
    let mut enigo = Enigo::new(&Settings::default()).unwrap();
    let _ = enigo.move_mouse(x as i32, y as i32, Coordinate::Abs);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![move_mouse]) 
        .setup(|app| {
            let handle = app.handle().clone();

            // ──────────────────────────────────────────────────────────────────
            // DEV MODE: Run Python directly from the .venv.
            //
            // Why: The PyInstaller one-file binary extracts 114MB to /tmp on
            // every cold start, causing a ~60 second delay. In dev mode, we
            // bypass it entirely and launch the Python source directly.
            // CARGO_MANIFEST_DIR is set at *compile time* to the src-tauri dir,
            // so the paths are always correct regardless of CWD at runtime.
            // ──────────────────────────────────────────────────────────────────
            #[cfg(debug_assertions)]
            {
                use tauri::Emitter;

                std::thread::spawn(move || {
                    use std::io::{BufRead, BufReader};
                    use std::process::{Command, Stdio};

                    // CARGO_MANIFEST_DIR → .../desktop/app/src-tauri (compile-time)
                    let manifest_dir = env!("CARGO_MANIFEST_DIR");
                    let python = format!("{}/../../engine/.venv/bin/python3", manifest_dir);
                    let engine_src = format!("{}/../../engine/src", manifest_dir);

                    println!("[DEV] Python:      {}", python);
                    println!("[DEV] Engine src:  {}", engine_src);

                    let mut child = Command::new(&python)
                        .args(["-m", "neurocursor"])
                        .current_dir(&engine_src)
                        // Ensure the neurocursor package is on sys.path
                        .env("PYTHONPATH", &engine_src)
                        .stdout(Stdio::piped())
                        .spawn()
                        .expect("[DEV] Failed to spawn Python engine. Is .venv built?");

                    if let Some(stdout) = child.stdout.take() {
                        let reader = BufReader::new(stdout);
                        for line in reader.lines() {
                            if let Ok(line) = line {
                                let trimmed = line.trim().to_string();
                                if !trimmed.is_empty() {
                                    println!("PYTHON ENGINE: {}", trimmed);
                                    let _ = handle.emit("engine-event", trimmed);
                                }
                            }
                        }
                    }
                    let _ = child.wait();
                    println!("[DEV] Python engine process exited.");
                });
            }

            // ──────────────────────────────────────────────────────────────────
            // RELEASE MODE: Use the PyInstaller sidecar binary.
            //
            // In a packaged .dmg / .exe, the binary is bundled alongside the
            // app and PyInstaller's extraction is a one-time cost on first run
            // (results are cached in ~/Library/... on macOS).
            // ──────────────────────────────────────────────────────────────────
            #[cfg(not(debug_assertions))]
            {
                use tauri::Emitter;
                use tauri_plugin_shell::ShellExt;
                use tauri_plugin_shell::process::CommandEvent;

                let sidecar_command = app.shell().sidecar("neurocursor-engine").unwrap();

                tauri::async_runtime::spawn(async move {
                    let (mut rx, child) =
                        sidecar_command.spawn().expect("Failed to spawn sidecar");
                    let _child_process = child; // Keep alive — dropping kills the process

                    while let Some(event) = rx.recv().await {
                        if let CommandEvent::Stdout(line) = event {
                            if let Ok(line_str) = String::from_utf8(line) {
                                let trimmed = line_str.trim();
                                if !trimmed.is_empty() {
                                    println!("PYTHON ENGINE: {}", trimmed);
                                    let _ = handle.emit("engine-event", trimmed);
                                }
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}