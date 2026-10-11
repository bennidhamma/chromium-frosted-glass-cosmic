// The site registry (sites.json) and the content scripts that frost sites.
//
// A site is on exactly when the extension has host access to it: turning it
// on asks for access, turning it off gives it back. So the extension can only
// see the sites the user turned on, and revoking access in Chrome's settings
// turns the site off too.

const BASE_CSS = 'frost/base.css';
const OPT_IN_JS = 'frost/opt-in.js';

let sites;

export async function getSites() {
  sites ??= fetch(chrome.runtime.getURL('sites.json'))
      .then(response => response.json())
      .then(registry => registry.sites);
  return sites;
}

// The origin of a match pattern or host permission, like "https://github.com".
// Hosts in sites.json have no wildcards.
export function originOf(pattern) {
  return new URL(pattern.replaceAll('*', '')).origin;
}

export function originsOf(site) {
  return [...new Set(site.matches.map(originOf))];
}

function permissionsOf(site) {
  return { origins: originsOf(site).map(origin => `${origin}/*`) };
}

export function isOn(site) {
  return chrome.permissions.contains(permissionsOf(site));
}

// Must be called from a user gesture, like a click in the popup.
export function requestAccess(site) {
  return chrome.permissions.request(permissionsOf(site));
}

export function removeAccess(site) {
  return chrome.permissions.remove(permissionsOf(site));
}

export async function sitesWithOrigins(origins) {
  const wanted = new Set(origins.map(originOf));
  return (await getSites()).filter(
      site => originsOf(site).some(origin => wanted.has(origin)));
}

function cssOf(site) {
  return [BASE_CSS, `sites/${site.id}.css`];
}

function contentScriptOf(site) {
  return {
    id: site.id,
    matches: site.matches,
    css: cssOf(site),
    js: [OPT_IN_JS],
    runAt: 'document_start',
    persistAcrossSessions: true,
  };
}

// Registers content scripts for the sites that are on and removes the rest.
export async function syncContentScripts() {
  const on = [];
  for (const site of await getSites()) {
    if (await isOn(site)) {
      on.push(site);
    }
  }
  const registered = new Set(
      (await chrome.scripting.getRegisteredContentScripts()).map(script => script.id));
  const stale = [...registered].filter(id => !on.some(site => site.id === id));
  if (stale.length) {
    await chrome.scripting.unregisterContentScripts({ ids: stale });
  }
  // Existing ones are updated too, in case an extension update changed them.
  const update = on.filter(site => registered.has(site.id));
  if (update.length) {
    await chrome.scripting.updateContentScripts(update.map(contentScriptOf));
  }
  const add = on.filter(site => !registered.has(site.id));
  if (add.length) {
    await chrome.scripting.registerContentScripts(add.map(contentScriptOf));
  }
}

// Content scripts only run on page load, so frost already open tabs directly.
export async function frostOpenTabs(site) {
  const tabs = await chrome.tabs.query({ url: site.matches });
  await Promise.allSettled(tabs.map(async tab => {
    const target = { tabId: tab.id };
    await chrome.scripting.insertCSS({ target, files: cssOf(site) });
    await chrome.scripting.executeScript({ target, files: [OPT_IN_JS] });
  }));
}

// Undoes frostOpenTabs(). Needs access to the site, so call it before
// removeAccess(). CSS from content scripts stays until the tab reloads.
export async function unfrostOpenTabs(site) {
  const tabs = await chrome.tabs.query({ url: site.matches });
  await Promise.allSettled(tabs.map(tab => chrome.scripting.removeCSS(
      { target: { tabId: tab.id }, files: cssOf(site) })));
}

// Takes back the opt-in in open tabs of these origins, which makes them
// opaque. Messaging tabs needs no access, so this works after it's gone.
export async function stopOptIn(origins) {
  const message = { type: 'frosted-glass:off', origins };
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, message)));
}

function matchPatternToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replaceAll('*', '.*')}$`);
}

export async function siteForUrl(url) {
  if (!url) {
    return undefined;
  }
  return (await getSites()).find(site => site.matches.some(
      pattern => matchPatternToRegExp(pattern).test(url)));
}
