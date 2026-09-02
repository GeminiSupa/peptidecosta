#!/usr/bin/env node
/**
 * Generates PRODUCT-AND-SALES-GUIDE.pdf using Chrome headless.
 */
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, 'PRODUCT-AND-SALES-GUIDE.html');
const pdfPath = path.join(__dirname, 'PRODUCT-AND-SALES-GUIDE.pdf');

const chromePaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

const chrome = chromePaths.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error('No Chrome/Chromium/Edge found for PDF generation.');
  process.exit(1);
}

execFileSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--print-to-pdf=' + pdfPath,
  '--no-pdf-header-footer',
  `file://${htmlPath}`,
], { stdio: 'inherit' });

const stat = fs.statSync(pdfPath);
console.log(`PDF written: ${pdfPath} (${(stat.size / 1024).toFixed(0)} KB)`);
