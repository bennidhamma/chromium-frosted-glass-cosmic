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
  the new tab page show the frosted desktop behind semi-opaque cards. Regular
  websites stay opaque.
- Glass follows Chrome's [Glass Frame][glass-frame] design: it is shown on the most
  recently active window, and turned off in fullscreen, with battery saver, or with
  an extension theme. It can be turned off in *Settings → Appearance → Tab
  styling*.
- On compositors without blur support (or on X11), it looks like regular Chromium.

## Install (Ubuntu 24.04 / Pop!_OS 24.04, amd64)

```bash
sudo curl -fsSLo /usr/share/keyrings/chromium-frosted-glass-cosmic.asc \
  https://raw.githubusercontent.com/bennidhamma/chromium-frosted-glass-cosmic/main/packaging/chromium-frosted-glass-cosmic.asc
echo "deb [signed-by=/usr/share/keyrings/chromium-frosted-glass-cosmic.asc] https://github.com/bennidhamma/chromium-frosted-glass-cosmic/releases/download/apt ./" \
  | sudo tee /etc/apt/sources.list.d/chromium-frosted-glass-cosmic.list
sudo apt update
sudo apt install chromium-frosted-glass
```

It installs to `/opt/chromium-frosted-glass` and shows up as **Chromium Frosted
Glass**. Run it from the terminal with `chromium-frosted-glass-stable`.

The packages live as assets on the [`apt` release][apt-release]; there is no
server. The repository signing key's fingerprint is
`AC34 3387 E3A4 9BFD C8D5  B431 3A84 2D10 64D9 9A73`.

Things to know:

- **Updates are manual.** This is a personal build. Security fixes arrive when the
  patches are rebased onto a newer Chromium and a new package is published, not on
  Chromium's schedule.
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
| `GlassFrameToolbarOpacity` | 0.2 | Toolbar, bookmarks bar and active tab. `1` keeps them opaque (macOS-style) |
| `GlassFrameMenuOpacity` | 0.7 | Menu background. `1` turns frosted menus off |
| `GlassFrameTransparentWebUI` | true | See-through `chrome://` pages |
| `GlassFrameTransparentWebContents` | false | Make *every* page see-through where it doesn't paint its own background. Fun for demos, bad for reading most sites |

To turn glass off entirely: `--disable-features=GlassFrame`.

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
5. **[Packaging] Enable the glass frame by default; unofficial branding.** Local
   only.

The series is tested as a whole; individual commits are split for review and are
not each build-tested.

## Building from source

You need a Linux machine with ~150 GB free disk and a few hours. Follow
[Chromium's checkout instructions][checkout], check out the base revision, then:

```bash
packaging/build-deb.sh ~/chromium/src
```

That applies the patches, builds with [`packaging/args.gn`](packaging/args.gn) and
produces `out/Release/chromium-frosted-glass_<version>-1_amd64.deb`.
[`packaging/publish-apt.sh`](packaging/publish-apt.sh) signs and publishes packages
to the `apt` release.

## Demo

[`demo/frosted-glass.html`](demo/frosted-glass.html) shows frosted glass *inside* a
page with CSS `backdrop-filter`, which works in any current browser. To have a page
frost the desktop itself, run this build with `GlassFrameTransparentWebContents/true`
and give the page a transparent background.

## License

The patches modify Chromium and are under Chromium's
[BSD-3-Clause license](https://chromium.googlesource.com/chromium/src/+/main/LICENSE).
The cosmic-comp patch is under cosmic-comp's GPL-3.0 license.

[protocol]: https://gitlab.freedesktop.org/wayland/wayland-protocols/-/tree/main/staging/ext-background-effect
[glass-frame]: https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/ui/views/frame/glass_frame_service.h
[apt-release]: https://github.com/bennidhamma/chromium-frosted-glass-cosmic/releases/tag/apt
[checkout]: https://chromium.googlesource.com/chromium/src/+/main/docs/linux/build_instructions.md
