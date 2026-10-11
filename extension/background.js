import * as sites from './lib/sites.js';

// Syncs run one at a time; registering a script twice is an error.
let syncing = Promise.resolve();
function sync() {
  syncing = syncing.then(sites.syncContentScripts).catch(console.error);
  return syncing;
}

chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);

// Access is granted from the popup, or from Chrome's site access menu.
chrome.permissions.onAdded.addListener(async ({ origins = [] }) => {
  await sync();
  for (const site of await sites.sitesWithOrigins(origins)) {
    if (await sites.isOn(site)) {
      await sites.frostOpenTabs(site);
    }
  }
});

// Access is removed by turnOff() below, or in Chrome's extension settings.
chrome.permissions.onRemoved.addListener(async ({ origins = [] }) => {
  await sync();
  await sites.stopOptIn(origins.map(sites.originOf));
});

async function turnOff(id) {
  const site = (await sites.getSites()).find(site => site.id === id);
  if (site) {
    await sites.unfrostOpenTabs(site);
    await sites.removeAccess(site);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // From the popup; content scripts have a tab.
  if (message?.type === 'turn-off' && !sender.tab) {
    turnOff(message.id).finally(() => sendResponse());
    return true;
  }
});
