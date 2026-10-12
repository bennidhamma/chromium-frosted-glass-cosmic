//! A few facts about the machine, read the way native code can and a web page
//! can't.

use serde::Serialize;

#[derive(Serialize)]
pub struct SystemInfo {
    pub os: Option<String>,
    pub kernel: Option<String>,
    pub hostname: Option<String>,
    pub desktop: Option<String>,
    pub session: Option<String>,
    pub cpus: usize,
    pub memory_gib: Option<f64>,
    pub uptime_hours: Option<f64>,
    pub tauri: &'static str,
}

fn read(path: &str) -> Option<String> {
    std::fs::read_to_string(path).ok().map(|s| s.trim().to_string())
}

fn os_name() -> Option<String> {
    let release = read("/etc/os-release")?;
    let line = release.lines().find(|line| line.starts_with("PRETTY_NAME="))?;
    Some(line["PRETTY_NAME=".len()..].trim_matches('"').to_string())
}

fn memory_gib() -> Option<f64> {
    let meminfo = read("/proc/meminfo")?;
    let kib: f64 = meminfo.lines().find(|l| l.starts_with("MemTotal:"))?.split_whitespace().nth(1)?.parse().ok()?;
    Some((kib / 1024.0 / 1024.0 * 10.0).round() / 10.0)
}

fn uptime_hours() -> Option<f64> {
    let seconds: f64 = read("/proc/uptime")?.split_whitespace().next()?.parse().ok()?;
    Some((seconds / 3600.0 * 10.0).round() / 10.0)
}

pub fn read_info() -> SystemInfo {
    SystemInfo {
        os: os_name(),
        kernel: read("/proc/sys/kernel/osrelease"),
        hostname: read("/proc/sys/kernel/hostname"),
        desktop: std::env::var("XDG_CURRENT_DESKTOP").ok(),
        session: std::env::var("XDG_SESSION_TYPE").ok(),
        cpus: std::thread::available_parallelism().map_or(1, |n| n.get()),
        memory_gib: memory_gib(),
        uptime_hours: uptime_hours(),
        tauri: tauri::VERSION,
    }
}
