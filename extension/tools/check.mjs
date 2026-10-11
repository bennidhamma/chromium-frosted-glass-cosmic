#!/usr/bin/env node
// Checks the extension before a site change is merged. CI runs it on every
// pull request; run it locally with `node extension/tools/check.mjs`.
//
// Site styles run on pages like Gmail, so they are held to rules that keep
// them from doing anything but restyling the page:
// - Only CSS. The one script that runs in pages is frost/opt-in.js.
// - Nothing that loads a URL: CSS can send what's on the page to a server
//   (`input[value^="a"] { background: url(...) }`).
// - No text: `content` could put fake messages on a trusted page.
// - Each site only gets access to the hosts it lists, and the manifest asks
//   for exactly those, so the permissions a change adds show up in review.
//
// Usage: check.mjs [extension directory]

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ??
    path.join(path.dirname(new URL(import.meta.url).pathname), '..'));
const errors = [];
const error = (file, message) => errors.push(`${file}: ${message}`);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  } catch (e) {
    error(file, e.message);
    return undefined;
  }
}

// sites.json
const siteKeys = new Set(['id', 'name', 'matches', 'experimental']);
const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// https, an exact host (no wildcards), any path.
const matchPattern = /^https:\/\/([a-z0-9-]+\.)+[a-z]{2,}\/\S*$/;

const sites = readJson('sites.json')?.sites ?? [];
const origins = new Map();
for (const [i, site] of sites.entries()) {
  const where = `sites.json: site ${site?.id ?? i}`;
  for (const key of Object.keys(site)) {
    if (!siteKeys.has(key)) {
      errors.push(`${where}: unknown key "${key}"`);
    }
  }
  if (typeof site.id !== 'string' || !idPattern.test(site.id)) {
    errors.push(`${where}: id must be lowercase words joined by dashes`);
  }
  if (i > 0 && sites[i - 1].id >= site.id) {
    errors.push(`${where}: sites must be sorted by id, without duplicates`);
  }
  if (typeof site.name !== 'string' || !site.name.trim()) {
    errors.push(`${where}: name is missing`);
  }
  if ('experimental' in site && typeof site.experimental !== 'boolean') {
    errors.push(`${where}: experimental must be true or false`);
  }
  if (!Array.isArray(site.matches) || !site.matches.length) {
    errors.push(`${where}: matches must list at least one URL pattern`);
    continue;
  }
  for (const pattern of site.matches) {
    if (typeof pattern !== 'string' || !matchPattern.test(pattern)) {
      errors.push(`${where}: "${pattern}" must be https:// and an exact host, like "https://example.com/*"`);
      continue;
    }
    // A site is on when the extension has access to its hosts, so two sites
    // can't share one.
    const origin = new URL(pattern.replaceAll('*', '')).origin;
    if (origins.has(origin) && origins.get(origin) !== site.id) {
      errors.push(`${where}: ${origin} is already used by ${origins.get(origin)}`);
    }
    origins.set(origin, site.id);
  }
  if (!fs.existsSync(path.join(root, 'sites', `${site.id}.css`))) {
    errors.push(`${where}: sites/${site.id}.css is missing`);
  }
}

for (const file of fs.readdirSync(path.join(root, 'sites'))) {
  if (!file.endsWith('.css')) {
    error(`sites/${file}`, 'sites/ may only contain CSS');
  } else if (!sites.some(site => `${site.id}.css` === file)) {
    error(`sites/${file}`, 'not used by any site in sites.json');
  }
}

// manifest.json
const manifest = readJson('manifest.json');
if (manifest) {
  for (const key of ['host_permissions', 'content_scripts']) {
    if (key in manifest) {
      error('manifest.json', `"${key}" would apply to sites the user didn't turn on; sites are registered at runtime`);
    }
  }
  const wanted = [...origins.keys()].map(origin => `${origin}/*`).sort();
  const listed = [...(manifest.optional_host_permissions ?? [])].sort();
  if (JSON.stringify(wanted) !== JSON.stringify(listed)) {
    error('manifest.json', `optional_host_permissions must list exactly the hosts in sites.json:\n  ${JSON.stringify(wanted, null, 2).replaceAll('\n', '\n  ')}`);
  }
}

// CSS
const forbidden = [
  [/\\/, 'backslash escapes (they can spell the functions below)'],
  [/url\s*\(/i, 'url()'],
  [/@import/i, '@import'],
  [/@font-face/i, '@font-face'],
  [/(?<![\w-])(-webkit-)?image(-set)?\s*\(/i, 'image() and image-set()'],
  [/cross-fade\s*\(/i, 'cross-fade()'],
  [/element\s*\(/i, 'element()'],
  [/(?<![\w-])src\s*\(/i, 'src()'],
  [/attr\s*\(/i, 'attr()'],
  [/expression\s*\(|-moz-binding|(?<![\w-])behavior\s*:/i, 'legacy scripting in CSS'],
];
const allowedContent = /^\s*(none|normal|""|'')\s*(!important\s*)?$/i;
const maxCssBytes = 32 * 1024;

function checkCss(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (Buffer.byteLength(source) > maxCssBytes) {
    error(file, `larger than ${maxCssBytes / 1024} KB; keep site styles small enough to review`);
  }
  const css = source.replace(/\/\*[\s\S]*?(\*\/|$)/g, ' ');
  const line = index => css.slice(0, index).split('\n').length;
  for (const [pattern, what] of forbidden) {
    const match = pattern.exec(css);
    if (match) {
      error(`${file}:${line(match.index)}`, `${what} not allowed`);
    }
  }
  // Declarations only, not selectors like .content:hover.
  for (const match of css.matchAll(/(?<=[{;]\s*)content\s*:([^;}]*)/gi)) {
    if (!allowedContent.test(match[1])) {
      error(`${file}:${line(match.index)}`, 'content may only be none, normal or ""');
    }
  }
  let depth = 0;
  for (const char of css.replace(/"[^"\n]*"|'[^'\n]*'/g, '""')) {
    depth += char === '{' ? 1 : char === '}' ? -1 : 0;
    if (depth < 0) {
      break;
    }
  }
  if (depth !== 0) {
    error(file, 'unbalanced { }');
  }
}

checkCss('frost/base.css');
for (const site of sites) {
  if (fs.existsSync(path.join(root, 'sites', `${site.id}.css`))) {
    checkCss(`sites/${site.id}.css`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${sites.length} sites OK`);
