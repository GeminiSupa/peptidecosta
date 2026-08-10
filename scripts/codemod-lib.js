/**
 * Shared safety rails for the one-shot `patch-*.js` codemods at the repo root.
 *
 * Two of those codemods silently corrupted files they had already been run
 * against, and because `src/app/admin/page.js` imports every CRM component, a
 * single unbalanced brace took the WHOLE /admin route to a 500 — not just the
 * one tab. The rules below exist to make that outcome impossible:
 *
 *   replaceBlock()  replaces a brace-BALANCED block. The bug was a
 *                   /\{[\s\S]*?\}/ pattern, which is non-greedy and therefore
 *                   stops at the first inner `}` — swapping a partial block for
 *                   a complete one and orphaning the original's closing brace.
 *
 *   requireAnchor() throws when an anchor is missing instead of letting
 *                   `String.replace` no-op. Three steps of patch_leads.js had
 *                   rotted this way: their anchors no longer matched, so the
 *                   state and filter logic were never inserted while the step
 *                   that adds the UI reading them still ran.
 *
 *   writeChecked()  parses the result before writing. Nothing that fails to
 *                   parse ever reaches disk.
 */

const fs = require('fs');
const path = require('path');
const espree = require('espree');

const PARSE_OPTS = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  ecmaFeatures: { jsx: true },
};

/** Parse `source` as JSX, returning an error message or null. */
function parseError(source) {
  try {
    espree.parse(source, PARSE_OPTS);
    return null;
  } catch (e) {
    return `${e.message}${e.lineNumber ? ` (line ${e.lineNumber})` : ''}`;
  }
}

/**
 * Find the balanced `{...}` block that starts at the first match of `startRe`,
 * and return { start, end, text } spanning from the match through its matching
 * close brace. Returns null when `startRe` does not match.
 *
 * Braces inside strings, template literals, comments and regex literals are
 * skipped, so `if (x) { s = "}" }` is counted correctly.
 */
function findBalancedBlock(source, startRe) {
  const m = source.match(startRe);
  if (!m) return null;

  const start = m.index;
  const open = source.indexOf('{', start);
  if (open === -1) return null;

  let depth = 0;
  let i = open;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];

    if (c === '/' && next === '/') {
      i = source.indexOf('\n', i);
      if (i === -1) break;
      continue;
    }
    if (c === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      i = close === -1 ? source.length : close + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === quote) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1, text: source.slice(start, i + 1) };
    }
    i += 1;
  }
  return null;
}

/**
 * Replace the balanced block beginning at `startRe` with `replacement`.
 * Throws when the block cannot be located, rather than leaving the file half
 * edited.
 */
function replaceBlock(source, startRe, replacement, label) {
  const block = findBalancedBlock(source, startRe);
  if (!block) {
    throw new Error(`replaceBlock: no balanced block found for ${label || startRe}`);
  }
  return source.slice(0, block.start) + replacement + source.slice(block.end);
}

/** Throw unless `re` matches — turns a silent no-op into a loud failure. */
function requireAnchor(source, re, label) {
  if (!re.test(source)) {
    throw new Error(
      `anchor not found: ${label}\n` +
      `  pattern: ${re}\n` +
      `  The file has drifted from what this codemod expects. Update the anchor ` +
      `(or delete the step if it is already applied) instead of ignoring this.`
    );
  }
  return source;
}

/**
 * Write `source` to `file` only if it parses. On failure the original file is
 * left untouched and the process exits non-zero.
 */
function writeChecked(file, source, { label = path.basename(file) } = {}) {
  const err = parseError(source);
  if (err) {
    console.error(`\n✖ ${label}: refusing to write — result does not parse.`);
    console.error(`  ${err}`);
    console.error(`  ${file} left unchanged.\n`);
    process.exit(1);
  }
  const before = fs.readFileSync(file, 'utf8');
  if (before === source) {
    console.log(`• ${label}: already up to date, nothing written.`);
    return false;
  }
  fs.writeFileSync(file, source);
  console.log(`✔ ${label}: written and parsed clean.`);
  return true;
}

/** Guard for a codemod that should only ever apply once. */
function alreadyApplied(source, sentinel, label) {
  if (source.includes(sentinel)) {
    console.log(`• ${label}: already applied (found "${sentinel}"), skipping.`);
    return true;
  }
  return false;
}

module.exports = {
  parseError,
  findBalancedBlock,
  replaceBlock,
  requireAnchor,
  writeChecked,
  alreadyApplied,
};
