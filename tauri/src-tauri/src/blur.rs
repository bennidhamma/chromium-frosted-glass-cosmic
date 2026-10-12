//! Asks the Wayland compositor to blur what is behind the window, with the
//! ext-background-effect-v1 protocol (COSMIC, KDE Plasma, ...).
//!
//! Tauri draws its window with GTK, which has no API for this. So this joins
//! GTK's own Wayland connection with a separate event queue, and asks for blur
//! behind GTK's wl_surface. The window is transparent and undecorated, so its
//! surface is exactly the window: no shadows around it.

use std::ffi::c_void;

use gtk::glib::translate::ToGlibPtr;
use gtk::prelude::*;
use serde::Serialize;
use wayland_backend::client::{Backend, ObjectId};
use wayland_client::globals::{registry_queue_init, GlobalListContents};
use wayland_client::protocol::wl_compositor::WlCompositor;
use wayland_client::protocol::wl_region::WlRegion;
use wayland_client::protocol::wl_registry::WlRegistry;
use wayland_client::protocol::wl_surface::WlSurface;
use wayland_client::{delegate_noop, Connection, Dispatch, EventQueue, Proxy, QueueHandle, WEnum};

#[allow(dead_code, non_upper_case_globals, clippy::all)]
mod protocol {
    use wayland_client;
    use wayland_client::protocol::*;

    pub mod __interfaces {
        use wayland_client::protocol::__interfaces::*;
        wayland_scanner::generate_interfaces!("protocols/ext-background-effect-v1.xml");
    }
    use self::__interfaces::*;

    wayland_scanner::generate_client_code!("protocols/ext-background-effect-v1.xml");
}

use protocol::ext_background_effect_manager_v1::{self, ExtBackgroundEffectManagerV1};
use protocol::ext_background_effect_surface_v1::ExtBackgroundEffectSurfaceV1;

extern "C" {
    // From GDK's Wayland backend (libgdk-3), which GTK already links.
    fn gdk_wayland_display_get_wl_display(display: *mut gtk::gdk::ffi::GdkDisplay) -> *mut c_void;
    fn gdk_wayland_window_get_wl_surface(window: *mut gtk::gdk::ffi::GdkWindow) -> *mut c_void;
}

#[derive(Default)]
struct State {
    supports_blur: bool,
}

impl Dispatch<WlRegistry, GlobalListContents> for State {
    fn event(_: &mut Self, _: &WlRegistry, _: <WlRegistry as Proxy>::Event, _: &GlobalListContents, _: &Connection, _: &QueueHandle<Self>) {}
}

impl Dispatch<ExtBackgroundEffectManagerV1, ()> for State {
    fn event(state: &mut Self, _: &ExtBackgroundEffectManagerV1, event: ext_background_effect_manager_v1::Event, _: &(), _: &Connection, _: &QueueHandle<Self>) {
        if let ext_background_effect_manager_v1::Event::Capabilities { flags: WEnum::Value(flags) } = event {
            state.supports_blur = flags.contains(ext_background_effect_manager_v1::Capability::Blur);
        }
    }
}

delegate_noop!(State: ignore WlCompositor);
delegate_noop!(State: ignore WlRegion);
delegate_noop!(State: ignore ExtBackgroundEffectSurfaceV1);

/// What the frontend is told about the blur.
#[derive(Clone, Serialize)]
pub struct Status {
    /// The compositor can blur (it may turn blur off, e.g. on battery).
    pub supported: bool,
    /// This window asks for blur.
    pub enabled: bool,
}

pub struct Blur {
    conn: Connection,
    queue: EventQueue<State>,
    state: State,
    compositor: WlCompositor,
    surface: WlSurface,
    effect: ExtBackgroundEffectSurfaceV1,
    enabled: bool,
    /// The window's size and corner radius, in surface (logical) pixels.
    size: (i32, i32),
    radius: i32,
}

impl Blur {
    /// Sets up blur for a mapped GTK window. Fails without Wayland or without
    /// a compositor that supports the protocol.
    pub fn new(window: &gtk::ApplicationWindow) -> Result<Self, String> {
        let gdk_window = window.window().ok_or("the window isn't realized yet")?;
        let display = gdk_window.display();
        if display.type_().name() != "GdkWaylandDisplay" {
            return Err("not running on Wayland".into());
        }
        let (display_ptr, surface_ptr) = unsafe {
            (
                gdk_wayland_display_get_wl_display(display.to_glib_none().0),
                gdk_wayland_window_get_wl_surface(gdk_window.to_glib_none().0),
            )
        };
        if display_ptr.is_null() || surface_ptr.is_null() {
            return Err("GTK has no Wayland surface for the window".into());
        }

        // GTK keeps owning the connection and the surface.
        let conn = Connection::from_backend(unsafe { Backend::from_foreign_display(display_ptr.cast()) });
        let surface_id = unsafe { ObjectId::from_ptr(WlSurface::interface(), surface_ptr.cast()) }
            .map_err(|e| e.to_string())?;
        let surface = WlSurface::from_id(&conn, surface_id).map_err(|e| e.to_string())?;

        let (globals, mut queue) = registry_queue_init::<State>(&conn).map_err(|e| e.to_string())?;
        let qh = queue.handle();
        let compositor: WlCompositor = globals.bind(&qh, 1..=4, ()).map_err(|e| e.to_string())?;
        let manager: ExtBackgroundEffectManagerV1 = globals
            .bind(&qh, 1..=1, ())
            .map_err(|_| "the compositor doesn't support ext-background-effect-v1".to_string())?;
        let effect = manager.get_background_effect(&surface, &qh, ());
        // The manager announces its capabilities right after it's bound.
        let mut state = State::default();
        queue.roundtrip(&mut state).map_err(|e| e.to_string())?;

        Ok(Self { conn, queue, state, compositor, surface, effect, enabled: false, size: (0, 0), radius: 0 })
    }

    pub fn status(&mut self) -> Status {
        // Picks up capability changes, e.g. blur turned off in the compositor.
        let _ = self.queue.dispatch_pending(&mut self.state);
        Status { supported: self.state.supports_blur, enabled: self.enabled }
    }

    pub fn set_enabled(&mut self, enabled: bool) -> Result<(), String> {
        self.enabled = enabled;
        self.apply()
    }

    /// Follows the window's size and corner radius, in logical pixels.
    pub fn set_shape(&mut self, width: i32, height: i32, radius: i32) -> Result<(), String> {
        if (width, height, radius) == (self.size.0, self.size.1, self.radius) {
            return Ok(());
        }
        self.size = (width, height);
        self.radius = radius;
        if self.enabled { self.apply() } else { Ok(()) }
    }

    fn apply(&mut self) -> Result<(), String> {
        if self.enabled {
            let region = self.compositor.create_region(&self.queue.handle(), ());
            for (x, y, w, h) in rounded_rect(self.size.0, self.size.1, self.radius) {
                region.add(x, y, w, h);
            }
            self.effect.set_blur_region(Some(&region));
            region.destroy();
        } else {
            self.effect.set_blur_region(None);
        }
        // The region is double-buffered: it applies with the surface's next
        // commit. An empty commit doesn't disturb GTK's drawing.
        self.surface.commit();
        self.conn.flush().map_err(|e| e.to_string())
    }
}

/// A rounded rectangle as rows of rectangles, which is what a wl_region can
/// hold: one per pixel row in the corners, and one for the middle.
fn rounded_rect(width: i32, height: i32, radius: i32) -> Vec<(i32, i32, i32, i32)> {
    let radius = radius.clamp(0, width.min(height) / 2);
    let mut rects = Vec::new();
    for row in 0..radius {
        let dy = radius as f64 - row as f64 - 0.5;
        let inset = radius - ((radius as f64).powi(2) - dy * dy).max(0.0).sqrt().round() as i32;
        rects.push((inset, row, width - 2 * inset, 1));
        rects.push((inset, height - 1 - row, width - 2 * inset, 1));
    }
    rects.push((0, radius, width, height - 2 * radius));
    rects
}
