// Asks Chromium Frosted Glass to show the frosted desktop behind this page.
//
// The browser makes a page see-through when its theme color is transparent,
// and the theme color comes from the first <meta name="theme-color"> in the
// document. Most sites declare their own, so this keeps a transparent one at
// the start of <head>, ahead of theirs, also when the site rewrites its head
// (GitHub does on every navigation) or updates the first theme color tag,
// which is this one (Claude does).
//
// This is the only script the extension runs in pages. Site styles are CSS.
(() => {
  // Injected again when a site is turned back on in an open tab.
  if (globalThis.frostedGlassOptIn) {
    globalThis.frostedGlassOptIn.on();
    return;
  }

  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = 'transparent';
  // Sites that cache and restore their <head> (GitHub) can copy the tag.
  meta.dataset.frostedGlass = '';
  const tags = 'meta[data-frosted-glass]';

  // Gives up if the page keeps removing or changing the tag, rather than
  // fight it.
  const maxMovesPerSecond = 20;
  let moves = 0;
  let movesSince = 0;

  // The <head> being watched; null while waiting for one.
  let observedHead;
  const observer = new MutationObserver(() => place());

  function place() {
    const head = document.head;
    if (head !== observedHead) {
      observer.disconnect();
      if (head) {
        // Sites can replace <head>, or remove the tag from it.
        observer.observe(document.documentElement, { childList: true });
        observer.observe(head, { childList: true });
        observer.observe(meta, { attributes: true });
      } else {
        // At document_start, not even <html> may be there yet.
        observer.observe(document, { childList: true, subtree: true });
      }
      observedHead = head;
    }
    if (!head) {
      return;
    }
    for (const tag of head.querySelectorAll(tags)) {
      if (tag !== meta) {
        tag.remove();
      }
    }
    const changed = meta.name !== 'theme-color' ||
        meta.content !== 'transparent' || meta.hasAttribute('media');
    const first = head.querySelector('meta[name="theme-color" i]') === meta;
    if (!changed && first) {
      return;
    }
    const now = performance.now();
    if (now - movesSince > 1000) {
      movesSince = now;
      moves = 0;
    }
    if (++moves > maxMovesPerSecond) {
      off();
      return;
    }
    if (changed) {
      meta.name = 'theme-color';
      meta.content = 'transparent';
      meta.removeAttribute('media');
    }
    if (!first) {
      head.prepend(meta);
    }
  }

  function on() {
    observedHead = undefined;
    place();
  }

  function off() {
    observer.disconnect();
    for (const tag of document.querySelectorAll(tags)) {
      tag.remove();
    }
  }

  globalThis.frostedGlassOptIn = { on };

  // Sent when the user turns the site off. The site's CSS stays until the
  // page is reloaded, but without the tag the page is opaque again.
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'frosted-glass:off' &&
        message.origins.includes(location.origin)) {
      off();
    }
  });

  on();
})();
