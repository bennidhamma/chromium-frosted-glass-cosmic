//! Reads the COSMIC desktop's frosted glass settings (Settings > Desktop >
//! Appearance) and watches them, so the window can look like COSMIC's own.
//!
//! In COSMIC's theme config, "frost thickness" picks an entry of the
//! "alpha_map", the alpha of window backgrounds, and "glass opacity" shifts the
//! whole map. Entries live in ~/.config/cosmic/<id>/v<version>/<key>, with the
//! defaults under /usr/share/cosmic.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// The alpha of COSMIC's default glass, from libcosmic's default AlphaMap.
const DEFAULT_ALPHA: f64 = 0.76154;

#[derive(Clone, PartialEq, Serialize)]
pub struct Glass {
    pub is_dark: bool,
    /// The "frost thickness" setting, like "Medium2".
    pub frosted: String,
    /// The alpha of COSMIC's window backgrounds with the user's settings...
    pub alpha: f64,
    /// ...and with the default ones.
    pub default_alpha: f64,
    /// The theme's window background color, as #rrggbb.
    pub background: Option<String>,
    pub frosted_windows: bool,
}

fn config_dir() -> PathBuf {
    std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| Path::new(&home).join(".config")))
        .unwrap_or_default()
        .join("cosmic")
}

fn data_dirs() -> Vec<PathBuf> {
    std::env::var("XDG_DATA_DIRS")
        .ok()
        .filter(|dirs| !dirs.is_empty())
        .unwrap_or_else(|| "/usr/local/share:/usr/share".into())
        .split(':')
        .map(|dir| Path::new(dir).join("cosmic"))
        .collect()
}

fn read_default(entry: &str) -> Option<String> {
    data_dirs().into_iter().find_map(|dir| std::fs::read_to_string(dir.join(entry)).ok())
}

fn read(entry: &str) -> Option<String> {
    std::fs::read_to_string(config_dir().join(entry)).ok().or_else(|| read_default(entry))
}

/// "ExtremelyLow2" -> "extremely_low_2", the matching alpha_map field.
fn field_name(variant: &str) -> String {
    let mut name = String::new();
    for c in variant.chars() {
        if c.is_ascii_uppercase() || c.is_ascii_digit() {
            if !name.is_empty() {
                name.push('_');
            }
            name.push(c.to_ascii_lowercase());
        } else {
            name.push(c);
        }
    }
    name
}

/// Parses a RON struct of numbers like "(low: 0.8, medium: 0.76,)".
fn parse_numbers(ron: &str) -> HashMap<String, f64> {
    let ron = ron.trim().trim_start_matches('(').trim_end_matches(')');
    ron.split(',')
        .filter_map(|field| {
            let (name, value) = field.split_once(':')?;
            Some((name.trim().to_string(), value.trim().parse().ok()?))
        })
        .collect()
}

/// The first `base: "#rrggbb..."` color of a theme container.
fn base_color(ron: &str) -> Option<String> {
    let start = ron.find("base:")? + 5;
    let rest = ron[start..].trim_start().strip_prefix('"')?;
    let hex = rest.get(..7)?;
    hex.starts_with('#').then(|| hex.to_lowercase())
}

/// Reads the settings. None if COSMIC's theme config isn't there.
pub fn read_glass() -> Option<Glass> {
    let is_dark = read("com.system76.CosmicTheme.Mode/v1/is_dark").map_or(true, |v| v.trim() != "false");
    let theme = if is_dark { "com.system76.CosmicTheme.Dark" } else { "com.system76.CosmicTheme.Light" };
    let frosted = read(&format!("{theme}/v2/frosted"))?.trim().to_string();
    let alphas = parse_numbers(&read(&format!("{theme}/v2/alpha_map"))?);
    let alpha = *alphas.get(&field_name(&frosted))?;
    let default_alpha = read_default(&format!("{theme}/v2/alpha_map"))
        .and_then(|map| parse_numbers(&map).get("medium").copied())
        .unwrap_or(DEFAULT_ALPHA);
    Some(Glass {
        is_dark,
        frosted,
        alpha: alpha.clamp(0.0, 1.0),
        default_alpha,
        background: read(&format!("{theme}/v2/background")).as_deref().and_then(base_color),
        frosted_windows: read(&format!("{theme}/v2/frosted_windows")).map_or(false, |v| v.trim() == "true"),
    })
}

/// Sends a "cosmic-glass" event to the frontend whenever the settings change.
/// COSMIC Settings rewrites the files as you drag its sliders, so a cheap poll
/// keeps up.
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = read_glass();
        loop {
            std::thread::sleep(Duration::from_millis(300));
            let glass = read_glass();
            if glass != last {
                let _ = app.emit("cosmic-glass", &glass);
                last = glass;
            }
        }
    });
}
