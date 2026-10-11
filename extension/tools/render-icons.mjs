#!/usr/bin/env node
// Renders icons/icon.svg to the PNG sizes in manifest.json. Needs the
// playwright package and its Chromium (npm install playwright).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const icons = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'icons');
const svg = fs.readFileSync(path.join(icons, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: path.join(icons, `${size}.png`), omitBackground: true });
}
await browser.close();
