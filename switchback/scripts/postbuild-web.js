#!/usr/bin/env node
'use strict';

/**
 * Post-build PWA injection for the web export.
 *
 * `expo export -p web` writes dist/index.html without manifest/theme/SW tags.
 * This script injects them after every build:
 *   - <head>: manifest link, theme-color, favicons, apple-touch-icon, iOS
 *     standalone metas, and a description meta (only when the export didn't
 *     emit one). The viewport meta gains viewport-fit=cover.
 *   - <body>: an inline script that registers /sw.js on window load.
 *
 * Idempotent: a marker comment guards against double injection, so running
 * the script twice over the same dist/ is a no-op.
 *
 * Plain Node, no dependencies. Run via: npm run build:web
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');

// Single marker for the whole injection — head and body tags are written in
// one atomic pass, so one guard is enough for idempotency.
const MARKER = '<!-- switchback:pwa -->';

function fail(message) {
  console.error(`[postbuild-web] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(indexPath)) {
  fail(`${indexPath} not found — run "expo export -p web" first.`);
}

let html = fs.readFileSync(indexPath, 'utf8');

if (html.includes(MARKER)) {
  console.log('[postbuild-web] PWA tags already present; skipping injection.');
  process.exit(0);
}

if (!html.includes('</head>')) {
  fail('no </head> tag found in dist/index.html — unexpected export output.');
}
if (!html.includes('</body>')) {
  fail('no </body> tag found in dist/index.html — unexpected export output.');
}

const headTags = [
  MARKER,
  '<link rel="manifest" href="/site.webmanifest">',
  '<meta name="theme-color" content="#0A0C18">',
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">',
  '<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">',
  '<link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="Switchback">',
];

// Only add a description if the export didn't already emit one.
if (!/<meta[^>]*\bname=["']description["']/i.test(html)) {
  headTags.push(
    '<meta name="description" content="Park charades for the standby line.">'
  );
}

const swScript = [
  '<script>',
  "  if ('serviceWorker' in navigator) {",
  "    window.addEventListener('load', function () {",
  "      navigator.serviceWorker.register('/sw.js').catch(function (err) {",
  "        console.error('Service worker registration failed:', err);",
  '      });',
  '    });',
  '  }',
  '</script>',
].join('\n');

// The play screen runs edge to edge behind the notch, which only works if the
// viewport opts into the full display cutout area.
html = html.replace(
  /(<meta[^>]*\bname=["']viewport["'][^>]*content=["'])([^"']*)(["'])/i,
  (match, head, content, tail) =>
    content.includes('viewport-fit')
      ? match
      : `${head}${content},viewport-fit=cover${tail}`
);

html = html.replace('</head>', `${headTags.join('\n')}\n</head>`);
html = html.replace('</body>', `${swScript}\n</body>`);

fs.writeFileSync(indexPath, html);
console.log('[postbuild-web] Injected PWA tags and service worker registration into dist/index.html');
