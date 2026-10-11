import * as sites from '../lib/sites.js';

const repo = chrome.runtime.getManifest().homepage_url;
const list = document.getElementById('sites');
const template = document.getElementById('site');

// The popup gets the active tab's URL through the activeTab permission.
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const current = await sites.siteForUrl(tab?.url);

const all = [...await sites.getSites()].sort((a, b) =>
    (b === current) - (a === current) || a.name.localeCompare(b.name));

const toggles = new Map();
for (const site of all) {
  const row = template.content.firstElementChild.cloneNode(true);
  row.classList.toggle('current', site === current);
  row.querySelector('.name').textContent = site.name;
  row.querySelector('.hosts').textContent =
      sites.originsOf(site).map(origin => new URL(origin).host).join(', ');
  const badges = row.querySelector('.badges');
  if (site === current) {
    addBadge(badges, 'this tab', 'Frost the site in this tab');
  }
  if (site.experimental) {
    addBadge(badges, 'experimental',
        'Not yet checked on the live site. Fixes welcome.',
        'experimental');
  }
  const toggle = row.querySelector('input');
  toggle.checked = await sites.isOn(site);
  toggle.addEventListener('change', async () => {
    const note = row.querySelector('.note');
    note.hidden = true;
    if (toggle.checked) {
      // The background worker frosts the site once access is granted.
      toggle.checked = await sites.requestAccess(site).catch(() => false);
    } else {
      await chrome.runtime.sendMessage({ type: 'turn-off', id: site.id });
      toggle.checked = await sites.isOn(site);
      note.hidden = toggle.checked;
    }
  });
  toggles.set(site, toggle);
  list.append(row);
}

function addBadge(parent, text, title, className = '') {
  const badge = document.createElement('span');
  badge.className = `badge ${className}`;
  badge.textContent = text;
  badge.title = title;
  parent.append(badge);
}

// Access can also change in Chrome's own menus while the popup is open.
async function refresh() {
  for (const [site, toggle] of toggles) {
    toggle.checked = await sites.isOn(site);
  }
}
chrome.permissions.onAdded.addListener(refresh);
chrome.permissions.onRemoved.addListener(refresh);

// Offer to request the site in this tab if it isn't supported.
if (!current && tab?.url?.startsWith('https://')) {
  const host = new URL(tab.url).host;
  const url = new URL(`${repo}/issues/new`);
  url.searchParams.set('template', 'site-request.yml');
  url.searchParams.set('title', `Site request: ${host}`);
  // Only the host: the rest of the URL can be private.
  url.searchParams.set('site', host);
  document.getElementById('request-host').textContent = host;
  document.getElementById('request-link').href = url;
  document.getElementById('request').hidden = false;
}

document.getElementById('contribute').href =
    `${repo}/tree/main/extension#adding-or-improving-a-site`;
