# Frosted Glass Sites

A browser extension that turns on frosted glass for sites like GitHub, Google
Search, Claude and Gmail in [Chromium Frosted Glass](../README.md). The page's
background becomes the frosted desktop, with the site's panels and cards on top.

Sites only take part in [frosted pages](../README.md#frosted-pages-for-web-developers)
if they opt in themselves. This extension opts in for them and adds a small
stylesheet per site that turns its opaque backgrounds translucent. The styles
are contributed by pull request, so if a site you use is missing or looks off,
[you can fix it](#adding-or-improving-a-site).

## Install

The extension isn't in the Chrome Web Store yet. To install it:

1. Download `frosted-glass-sites-<version>.zip` from the newest
   [extension release](https://github.com/bennidhamma/chromium-frosted-glass-cosmic/releases?q=extension)
   and unpack it somewhere it can stay. Or clone this repository and use its
   `extension` folder.
2. Open `chrome://extensions` and turn on *Developer mode*.
3. Click *Load unpacked* and pick the unpacked folder.

## Use

Click the extension's toolbar button and turn a site on. Chrome asks for access
to that site; once you allow it, open tabs of the site turn frosted right away.
Turning a site off gives the access back. Pages that are already open become
opaque again at once, and lose the rest of the style when reloaded.

| Site | Status |
|---|---|
| GitHub | Checked signed out on repositories, code, issues, pull requests and gists, light and dark |
| Google Search | Experimental: home page checked in the light theme, results pages not yet |
| Claude | Experimental: not yet checked on a live page |
| Gmail | Experimental: only the page background so far |

*Experimental* sites haven't been checked on the live site yet, so they may
need fixing. The popup marks them.

Pages are only see-through in Chromium Frosted Glass while the window shows
glass. Elsewhere, including other browsers, the sites look as usual.

## Privacy and permissions

- **Nothing runs on a site until you turn it on.** The extension asks for access
  to a site only when you turn it on, and only to that site's hosts. You can see
  and revoke access in `chrome://extensions`; revoking turns the site off.
- **`activeTab`** lets the popup see which site the current tab is on, when you
  click the toolbar button.
- **`scripting`** adds the styles to the sites you turned on.
- The extension makes no network requests, stores nothing and collects nothing.
  Site styles ship inside the extension; it never downloads them.

## How it works

Chromium Frosted Glass makes a page see-through when the first
`<meta name="theme-color">` in it is `transparent`. On sites you turn on,
[`frost/opt-in.js`](frost/opt-in.js) keeps such a tag at the start of `<head>`,
ahead of the site's own. It is the only script the extension runs in pages.

The page is then drawn straight onto the frosted desktop, so it must not paint an
opaque background. [`frost/base.css`](frost/base.css) clears the root's, and each
site's stylesheet in [`sites/`](sites/) turns the site's own backgrounds
translucent. [`sites.json`](sites.json) lists the sites and which URLs each one
covers.

## Adding or improving a site

You need Chromium Frosted Glass to see the result, and the site's light and dark
themes if it has both.

1. Add the site to [`sites.json`](sites.json), keeping the list sorted by `id`:

   ```json
   {
     "id": "example",
     "name": "Example",
     "matches": ["https://example.com/*", "https://docs.example.com/*"],
     "experimental": true
   }
   ```

   `matches` are [match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns):
   `https://`, exact hosts (no `*.example.com`), any path. A host can only belong
   to one site. Keep `"experimental": true` until the style has been checked on
   the live site.
2. Add the site's hosts to `optional_host_permissions` in
   [`manifest.json`](manifest.json). The check below prints the exact list.
3. Write `sites/<id>.css`. It's often quickest to try rules in DevTools first.
4. Load the extension unpacked (see [Install](#install)) and turn the site on.
   After changing a stylesheet, click the reload button on the extension in
   `chrome://extensions`, then reload the site.
5. Run the checks: `node extension/tools/check.mjs`.
6. Open a pull request with before and after screenshots, light and dark, and
   say which pages you checked.

### Writing a site style

- **Keep some of the site's color behind text.** Fully clear backgrounds are
  unreadable on busy wallpapers. Mix the site's colors with transparency using
  the shares in `frost/base.css`: `--frost-alpha-page` for the page background,
  `--frost-alpha-surface` for panels on top of it.
- **Prefer the site's theme variables to its class names.** Variables cover
  every theme and survive redesigns better. When a site defines its colors on
  `<html>`, copy them there and redefine them below it, as
  [`sites/github.css`](sites/github.css) does:

  ```css
  html {
    --frost-example-bg: var(--example-bg);
  }
  body {
    --example-bg: color-mix(in srgb, var(--frost-example-bg) calc(var(--frost-alpha-page) * 100%), transparent) !important;
  }
  ```

  For sites with generated class names, look for hooks that mean something,
  like `[role="contentinfo"]`.
- **Leave anything that floats over content opaque:** menus, dialogs, tooltips,
  sticky headers. On a see-through page, the content under them would show
  through, and `backdrop-filter` can't hide it: the blurred copy is drawn on top
  of the sharp original.
- **Use `!important`.** The site's own stylesheets come after the extension's.
- **No backslash escapes.** For classes with special characters, like
  Tailwind's `md:flex`, use an attribute selector: `[class~="md:flex"]`.

### What the checks allow

Site styles run on pages with people's mail, code and conversations, so
[`tools/check.mjs`](tools/check.mjs) limits them to restyling:

- **CSS only.** `sites/` can't contain scripts.
- **Nothing that loads a URL:** no `url()`, `@import`, `@font-face`, `image()`,
  `image-set()` and the like. CSS can send what's on a page to a server, for
  example by loading a different URL for each value of an input.
- **No added text:** `content` may only be `none`, `normal` or `""`, so a
  style can't put fake messages on a trusted page.
- **No backslash escapes,** which could spell the above in disguise.
- **Access only to the listed hosts:** the manifest asks for exactly the hosts
  in `sites.json`, so a change that adds one shows it in review.

On pull requests, CI also runs the checker from the branch being merged into,
so a pull request can't relax the rules it is checked against.

## Why pull requests

Every style is reviewed before it's merged and ships inside a versioned
extension, which only changes when you update it. The alternative of fetching
community styles at runtime, like userstyle sites do, would let any style
reach every user's Gmail without review, and the checks above show how much a
stylesheet can do on a page.

Anyone can still take part:

- **Request a site** from the popup, which opens a
  [site request](https://github.com/bennidhamma/chromium-frosted-glass-cosmic/issues/new?template=site-request.yml)
  for the site in the current tab. 👍 on requests decides what gets styled first.
- **Write or fix a style** by pull request, as above.
