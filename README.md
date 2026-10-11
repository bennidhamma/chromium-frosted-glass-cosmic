# Chromium Frosted Glass for COSMIC

An unofficial Chromium build whose window is frosted glass: the desktop behind the
tab strip, toolbar, menus and `chrome://` pages (settings, history, the new tab
page, …) shows through, blurred, the way COSMIC's own apps look.

It uses the Wayland [`ext-background-effect-v1`][protocol] protocol, so the blur is
done by the compositor. It was developed and tested on COSMIC; other compositors
that implement the protocol should work too.

> **Unofficial.** Not affiliated with the Chromium project or Google. It is built
> from Chromium's source plus the patches in this repository.

## What you get

- **Glass window frame.** The tab strip, toolbar and bookmarks bar are a single
  frosted pane. The active tab and toolbar stay a slightly lighter surface, like
  cards in COSMIC Settings.
- **Frosted menus.** The app menu, context menus and bookmark menus blur what is
  behind them.
- **See-through `chrome://` pages.** Settings, history, downloads, extensions and
  the new tab page show the frosted desktop behind semi-opaque cards.
- **Frosted web pages, opt-in.** A web page can ask to be see-through too; see
  [Frosted pages](#frosted-pages-for-web-developers). All other sites stay opaque.
- Every window is frosted. Glass builds on Chrome's [Glass Frame][glass-frame]
  and, like it, turns off in fullscreen, with battery saver, or with an extension
  theme. It can be turned off in *Settings → Appearance → Tab styling*.
- On compositors without blur support (or on X11), it looks like regular Chromium.

## Install (Ubuntu 24.04 / Pop!_OS 24.04, amd64)

```bash
sudo curl -fsSLo /usr/share/keyrings/chromium-frosted-glass-cosmic.asc \
  https://raw.githubusercontent.com/bennidhamma/chromium-frosted-glass-cosmic/main/packaging/chromium-frosted-glass-cosmic.asc
echo "deb [signed-by=/usr/share/keyrings/chromium-frosted-glass-cosmic.asc] https://github.com/bennidhamma/chromium-frosted-glass-cosmic/releases/download/apt ./" \
  | sudo tee /etc/apt/sources.list.d/chromium-frosted-glass-cosmic.list
sudo apt update
sudo apt install chromium-frosted-glass-stable
```

It installs to `/opt/chromium-frosted-glass` and shows up as **Chromium Frosted
Glass**. Run it from the terminal with `chromium-frosted-glass-stable`.

The packages live as assets on the [`apt` release][apt-release]; there is no
server. The repository signing key's fingerprint is
`AC34 3387 E3A4 9BFD C8D5  B431 3A84 2D10 64D9 9A73`. You can also download the
`.deb` from there and install it with `sudo apt install ./chromium-frosted-glass-stable_*.deb`.

Unlike Google's packages, this one doesn't add an apt source, signing key or cron
job to your system: the key and source list above are the only setup. To uninstall:
`sudo apt remove chromium-frosted-glass-stable`, then delete the `.list` and `.asc`
files.

Things to know:

- **Updates lag behind Chromium.** This is a personal build. `apt upgrade` picks up
  a new version when the patches are rebased onto a newer Chromium and a package is
  published, not on Chromium's schedule, so security fixes arrive late.
- **No proprietary codecs.** Like most redistributed Chromium builds, it can't
  play H.264/AAC media.
- **Profile.** It uses the regular Chromium profile directory (`~/.config/chromium`).
  If you also use another Chromium build, start this one with
  `--user-data-dir=<dir>` to keep their profiles apart.

## Tuning

Everything is controlled by parameters of the `GlassFrame` feature, set on the
command line:

```bash
chromium-frosted-glass-stable --enable-features='GlassFrame:GlassFrameToolbarOpacity/0.3/GlassFrameMenuOpacity/0.8'
```

| Parameter | Default (Linux) | Meaning |
|---|---|---|
| `GlassFrameLinuxTintOpacityLight` / `…Dark` | 0.35 / 0.45 | Tint of the frame over the blurred desktop |
| `GlassFrameMaxWindows` | 0 (no limit) | Only frost the N most recently active windows (Chrome on macOS uses 1) |
| `GlassFrameToolbarOpacity` | 0.35 | Toolbar, bookmarks bar and active tab. `1` keeps them opaque (macOS-style) |
| `GlassFrameMenuOpacity` | 0.7 | Menu background. `1` turns frosted menus off |
| `GlassFrameTransparentWebUI` | true | See-through `chrome://` pages |
| `GlassFrameTransparentWebContentsOptIn` | true | Let pages opt into being see-through (see below) |
| `GlassFrameTransparentWebContents` | false | Make *every* page see-through where it doesn't paint its own background. Fun for demos, bad for reading most sites |

To turn glass off entirely: `--disable-features=GlassFrame`.

## Frosted pages (for web developers)

A page can show the user's frosted desktop behind it. Declare a transparent theme
color, and don't paint a background on the root:

```html
<meta name="theme-color" content="transparent">
<style>
  html, body { background: transparent; }
  .card {
    background: rgb(255 255 255 / 0.12);
    border: 1px solid rgb(255 255 255 / 0.2);
    border-radius: 16px;
  }
</style>
```

- The desktop behind the window is blurred by the compositor and tinted with the
  frame color, so text needs the same care as on any frosted surface. Put content on
  translucent cards rather than directly on the backdrop.
- CSS `backdrop-filter` can't see the desktop: the page itself is transparent, and
  the blur happens outside the browser. Use plain translucent colors on top.
- Only the top-level page's theme color counts. Adding or removing the `<meta>` tag
  at runtime switches the effect on and off.
- It applies while the window shows glass: not in fullscreen or with battery saver.
  In those cases, and in every other browser, the page is shown on the browser's
  normal background. Add
  `color-scheme: dark` (or light) so that fallback matches your design.
- Users can turn the opt-in off with `GlassFrameTransparentWebContentsOptIn/false`.

## COSMIC's blur offset

cosmic-comp currently places blur regions relative to the window geometry rather
than the surface, and misplaces the blur behind popups. Apps that draw their own
shadows (like Chromium) would get blur shifted by the shadow size. This build
compensates through the `WaylandBlurRegionRelativeToWindowGeometry` feature, which
is turned on automatically when `XDG_CURRENT_DESKTOP` contains `COSMIC`.

The real fix belongs in cosmic-comp: [`cosmic-comp/`](cosmic-comp/) has a patch for
it. Once cosmic-comp ships a fix, start the browser with
`--disable-features=WaylandBlurRegionRelativeToWindowGeometry` (and a later build of
this package will drop the workaround).

## The patches

[`patches/`](patches/) is a `git format-patch` series against the Chromium revision
in [`patches/BASE_REVISION`](patches/BASE_REVISION):

1. **[Ozone/Wayland] Support ext-background-effect-v1 background blur.** Protocol
   support, per-surface blur regions, `PlatformWindow::SetBackgroundBlurRegion()`,
   fake-server unit tests. Written with upstreaming in mind.
2. **[Views] Blur behind translucent menus; grayscale text on glass.**
3. **[Linux] Glass frame on Wayland compositors with background blur.** Enables
   Chrome's Glass Frame on Linux and adds the frosted toolbar, menus and see-through
   `chrome://` pages.
4. **[COSMIC] Work around cosmic-comp blur region placement.** Local only; not for
   upstream.
5. **[COSMIC] Follow COSMIC's glass opacity setting.** Work in progress.
6. **[Packaging] Enable the glass frame by default; unofficial branding.** Local
   only.

The series is tested as a whole; individual commits are split for review and are
not each build-tested.

## Building from source

You need a Linux machine with ~150 GB free disk and a few hours. Follow
[Chromium's checkout instructions][checkout], check out the base revision, install
`fakeroot` and `dpkg-dev`, then:

```bash
packaging/build-deb.sh ~/chromium/src
```

That applies the patches, builds with [`packaging/args.gn`](packaging/args.gn) and
produces `out/Release/dist/chromium-frosted-glass-stable_<version>-1_amd64.deb`.
[`packaging/publish-apt.sh`](packaging/publish-apt.sh) signs and publishes packages
to the `apt` release.

## Demo

[`demo/frosted-glass.html`](demo/frosted-glass.html) shows frosted glass *inside* a
page with CSS `backdrop-filter`, which works in any current browser. Its *Desktop
mode* button (or `?desktop` in the URL) uses the opt-in above, so in this build the
cards float on your frosted desktop.

## License

The patches modify Chromium and are under Chromium's
[BSD-3-Clause license](https://chromium.googlesource.com/chromium/src/+/main/LICENSE).
The cosmic-comp patch is under cosmic-comp's GPL-3.0 license.

[protocol]: https://gitlab.freedesktop.org/wayland/wayland-protocols/-/tree/main/staging/ext-background-effect
[glass-frame]: https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/ui/views/frame/glass_frame_service.h
[apt-release]: https://github.com/bennidhamma/chromium-frosted-glass-cosmic/releases/tag/apt
[checkout]: https://chromium.googlesource.com/chromium/src/+/main/docs/linux/build_instructions.md
