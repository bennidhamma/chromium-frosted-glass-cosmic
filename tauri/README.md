# Frosted Glass, a Tauri app

The [frosted glass demo](../demo/frosted-glass.html) as a native app: a
[Tauri](https://tauri.app) window that COSMIC frosts like its own, by blurring
the desktop behind it.

- **Compositor blur from Rust.** Tauri draws with GTK, which has no API for
  blur behind a window, and Tauri's own window effects are macOS and Windows
  only. So [`src-tauri/src/blur.rs`](src-tauri/src/blur.rs) joins GTK's Wayland
  connection with its own event queue and asks for blur behind GTK's
  `wl_surface` with the [`ext-background-effect-v1`][protocol] protocol, as a
  rounded rectangle that follows the window's size.
- **Follows COSMIC's glass settings.** The window is tinted with COSMIC's window
  color, and moving *Frost thickness* or *Glass opacity* in *Settings → Desktop
  → Appearance* changes the tint live.
- **A little of what Tauri does.** The page calls Rust commands (system info,
  turning the blur on and off), Rust sends it events (COSMIC's settings
  changing), and it uses native notifications and window controls: a custom
  title bar, minimize, maximize, close and keep on top.

The window is transparent and undecorated, so the page draws everything,
including the title bar. The draggable cards use CSS `backdrop-filter`, which
blurs only within the page: switch on *Page backdrop* to see it.

It needs a compositor that supports `ext-background-effect-v1`, like COSMIC.
Elsewhere, the window shows the desktop through it, unblurred.

## Build

Install the build dependencies and Rust once:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
```

Then, in this folder, with Node.js:

```bash
npm install
```

```bash
npm run dev
```

`npm run build` makes an optimized build and a `.deb` (about 4 MB: Tauri uses
the system's WebKitGTK rather than shipping a browser engine) in
`src-tauri/target/release/bundle/deb/`.

[protocol]: https://gitlab.freedesktop.org/wayland/wayland-protocols/-/tree/main/staging/ext-background-effect
