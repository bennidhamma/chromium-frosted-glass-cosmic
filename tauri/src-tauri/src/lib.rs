mod cosmic;
mod sysinfo;
#[cfg(target_os = "linux")]
mod blur;

use std::sync::Mutex;

use serde::Serialize;
use tauri::{Manager, WebviewWindow, WindowEvent};

/// The window's corner radius, matching the page's CSS. Square when maximized.
const CORNER_RADIUS: i32 = 12;

/// Blur behind the window. None if the platform or compositor can't.
#[derive(Default)]
struct BlurState {
    #[cfg(target_os = "linux")]
    blur: Mutex<Option<blur::Blur>>,
    error: Mutex<Option<String>>,
}

#[derive(Serialize)]
struct BlurStatus {
    supported: bool,
    enabled: bool,
    error: Option<String>,
}

#[tauri::command]
fn system_info() -> sysinfo::SystemInfo {
    sysinfo::read_info()
}

#[tauri::command]
fn cosmic_glass() -> Option<cosmic::Glass> {
    cosmic::read_glass()
}

#[tauri::command]
fn blur_status(state: tauri::State<BlurState>) -> BlurStatus {
    #[cfg(target_os = "linux")]
    if let Some(blur) = state.blur.lock().unwrap().as_mut() {
        let status = blur.status();
        return BlurStatus { supported: status.supported, enabled: status.enabled, error: None };
    }
    BlurStatus { supported: false, enabled: false, error: state.error.lock().unwrap().clone() }
}

#[tauri::command]
fn set_blur(state: tauri::State<BlurState>, enabled: bool) -> Result<BlurStatus, String> {
    #[cfg(target_os = "linux")]
    if let Some(blur) = state.blur.lock().unwrap().as_mut() {
        blur.set_enabled(enabled)?;
    }
    let _ = enabled;
    Ok(blur_status(state))
}

/// Keeps the blur region the shape of the window.
fn update_blur_shape(window: &WebviewWindow) {
    #[cfg(target_os = "linux")]
    {
        let state = window.state::<BlurState>();
        let mut blur = state.blur.lock().unwrap();
        let (Some(blur), Ok(size), Ok(scale)) = (blur.as_mut(), window.inner_size(), window.scale_factor()) else {
            return;
        };
        let size = size.to_logical::<f64>(scale);
        let radius = if window.is_maximized().unwrap_or(false) { 0 } else { CORNER_RADIUS };
        let _ = blur.set_shape(size.width.round() as i32, size.height.round() as i32, radius);
    }
    let _ = window;
}

/// Asks for blur once GTK has the window on screen, which is when it has a
/// Wayland surface.
#[cfg(target_os = "linux")]
fn set_up_blur(window: &WebviewWindow) -> Result<(), String> {
    use gtk::prelude::*;

    let gtk_window = window.gtk_window().map_err(|e| e.to_string())?;
    let start = {
        let window = window.clone();
        move || {
            let state = window.state::<BlurState>();
            match blur::Blur::new(&window.gtk_window().unwrap()) {
                Ok(mut blur) => {
                    let _ = blur.set_enabled(true);
                    *state.blur.lock().unwrap() = Some(blur);
                    update_blur_shape(&window);
                }
                Err(error) => {
                    eprintln!("no blur: {error}");
                    *state.error.lock().unwrap() = Some(error);
                }
            }
        }
    };
    if gtk_window.is_mapped() {
        start();
    } else {
        let start = std::cell::Cell::new(Some(start));
        gtk_window.connect_map(move |_| {
            if let Some(start) = start.take() {
                start();
            }
        });
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(BlurState::default())
        .invoke_handler(tauri::generate_handler![system_info, cosmic_glass, blur_status, set_blur])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("the main window");
            #[cfg(target_os = "linux")]
            if let Err(error) = set_up_blur(&window) {
                *app.state::<BlurState>().error.lock().unwrap() = Some(error);
            }
            cosmic::watch(app.handle().clone());

            let resized = window.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } = event {
                    update_blur_shape(&resized);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
