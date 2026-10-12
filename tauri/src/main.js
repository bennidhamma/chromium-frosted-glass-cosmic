// The app's frontend. Tauri's API is on window.__TAURI__ (withGlobalTauri), so
// there's no bundler.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;
const notification = window.__TAURI__.notification;

const appWindow = getCurrentWindow();
const root = document.documentElement;
const $ = id => document.getElementById(id);

// --- The glass tint, following COSMIC ---------------------------------------

let glass = null;
let followCosmic = true;

// COSMIC's default glass gives the default tint; the ranges on either side
// stretch to fit, so all of COSMIC's settings have an effect.
function cosmicTint(glass) {
  const base = glass.is_dark ? 0.45 : 0.35;
  const { alpha, default_alpha: def } = glass;
  return alpha <= def ? base * alpha / def
                      : base + (1 - base) * (alpha - def) / (1 - def);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`;
}

function setTint(alpha) {
  root.style.setProperty('--glass-alpha', alpha.toFixed(2));
  $('tint').value = Math.round(alpha * 100);
  $('tint-out').textContent = alpha.toFixed(2);
}

function applyGlass() {
  const dark = glass ? glass.is_dark : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.setProperty('--glass-rgb',
      glass?.background ? hexToRgb(glass.background) : dark ? '27 29 34' : '242 242 242');
  if (followCosmic && glass) {
    setTint(cosmicTint(glass));
  }
  const rows = glass ? [
    ['Theme', glass.is_dark ? 'Dark' : 'Light'],
    ['Frost thickness', glass.frosted.replace(/(\d)$/, ' $1')],
    ['Window alpha', `${glass.alpha.toFixed(3)} (default ${glass.default_alpha.toFixed(3)})`],
    ['Frosted windows', glass.frosted_windows ? 'On' : 'Off'],
  ] : [['Theme', 'COSMIC settings not found']];
  $('cosmic').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', k), el('dd', v)]));
}

function el(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function log(text) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  $('log').prepend(el('li', `${time}  ${text}`));
  while ($('log').children.length > 5) $('log').lastChild.remove();
}

$('follow-cosmic').addEventListener('change', e => {
  followCosmic = e.target.checked;
  applyGlass();
});
$('tint').addEventListener('input', e => {
  followCosmic = false;
  $('follow-cosmic').checked = false;
  setTint(e.target.value / 100);
});

// Rust watches COSMIC's config and sends an event when it changes.
listen('cosmic-glass', ({ payload }) => {
  const before = glass;
  glass = payload;
  applyGlass();
  if (!before || !glass) {
    log('COSMIC settings changed');
  } else if (before.is_dark !== glass.is_dark) {
    log(`Event from Rust: ${glass.is_dark ? 'dark' : 'light'} mode`);
  } else {
    log(`Event from Rust: window alpha ${glass.alpha.toFixed(3)}`);
  }
});

// --- Compositor blur -----------------------------------------------------------

function showBlur(status) {
  $('blur-toggle').checked = status.enabled;
  $('blur-toggle').disabled = !status.supported && !status.enabled;
  $('blur-status').textContent = status.error ? `No blur: ${status.error}.`
      : !status.supported ? 'The compositor has blur turned off.'
      : status.enabled ? 'COSMIC is blurring behind this window.'
      : 'Blur off: the desktop shows through sharp.';
}

$('blur-toggle').addEventListener('change', async e => {
  showBlur(await invoke('set_blur', { enabled: e.target.checked }));
  log(`Rust command: set_blur(${e.target.checked})`);
});

// --- Window controls -----------------------------------------------------------

$('minimize').addEventListener('click', () => appWindow.minimize());
$('maximize').addEventListener('click', () => appWindow.toggleMaximize());
$('close').addEventListener('click', () => appWindow.close());

let onTop = false;
async function setOnTop(value) {
  onTop = value;
  await appWindow.setAlwaysOnTop(onTop);
  for (const id of ['pin', 'on-top']) $(id).setAttribute('aria-pressed', onTop);
  $('on-top').textContent = onTop ? 'Kept on top' : 'Keep on top';
}
$('pin').addEventListener('click', () => setOnTop(!onTop));
$('on-top').addEventListener('click', () => setOnTop(!onTop));

async function updateMaximized() {
  root.classList.toggle('maximized', await appWindow.isMaximized());
}
appWindow.onResized(updateMaximized);

// --- Notifications ---------------------------------------------------------------

$('notify').addEventListener('click', async () => {
  let granted = await notification.isPermissionGranted();
  if (!granted) granted = (await notification.requestPermission()) === 'granted';
  if (granted) {
    notification.sendNotification({
      title: 'Frosted Glass',
      body: glass ? `COSMIC's windows are at alpha ${glass.alpha.toFixed(2)} right now.`
                  : 'Hello from Tauri.',
    });
    log('Sent a desktop notification');
  }
});

// --- Page backdrop, for CSS backdrop-filter ----------------------------------------

$('backdrop-toggle').addEventListener('change', e => {
  root.classList.toggle('backdrop-on', e.target.checked);
});

// --- Dragging cards ------------------------------------------------------------

for (const card of document.querySelectorAll('.card')) {
  let start = null;
  card.addEventListener('pointerdown', e => {
    if (e.target.closest('input, button, label')) return;
    start = { x: e.clientX - card.offsetLeft, y: e.clientY - card.offsetTop };
    card.setPointerCapture(e.pointerId);
  });
  card.addEventListener('pointermove', e => {
    if (!start) return;
    const stage = $('stage').getBoundingClientRect();
    card.style.left = `${Math.max(0, Math.min(e.clientX - start.x, stage.width - 80))}px`;
    card.style.top = `${Math.max(0, Math.min(e.clientY - start.y, stage.height - 40))}px`;
  });
  card.addEventListener('pointerup', () => { start = null; });
}

// --- Start ---------------------------------------------------------------------------

(async () => {
  glass = await invoke('cosmic_glass');
  applyGlass();
  updateMaximized();
  showBlur(await invoke('blur_status'));

  const info = await invoke('system_info');
  const rows = [
    ['System', info.os],
    ['Kernel', info.kernel],
    ['Desktop', [info.desktop, info.session].filter(Boolean).join(' on ')],
    ['Processors', info.cpus],
    ['Memory', info.memory_gib && `${info.memory_gib} GiB`],
    ['Up for', info.uptime_hours && `${info.uptime_hours} h`],
    ['Tauri', info.tauri],
    ['Web engine', navigator.userAgent.match(/AppleWebKit\/[\d.]+/)?.[0].replace('/', ' ')],
  ].filter(([, v]) => v);
  $('system').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', k), el('dd', String(v))]));
})();
