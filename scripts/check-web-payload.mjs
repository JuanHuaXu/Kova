#!/usr/bin/env node
/**
 * check-web-payload.mjs — guard that every release JSON in
 * `web/src/content/releases/` conforms to the shared
 * `src/web-payload-contract.mjs` schema.
 *
 * Run by `npm run check:web-payload` and CI. Fails fast on the first
 * invalid file so the publish pipeline cannot land malformed JSON.
 *
 * This is the *consumer-side* drift guard. The publish pipeline runs
 * the same schema on the producer side before writing.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  safeParseRelease,
  WEB_PAYLOAD_SCHEMA_VERSION,
} from "../src/web-payload-contract.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RELEASES_DIR = resolve(HERE, "..", "web", "src", "content", "releases");

const files = readdirSync(RELEASES_DIR).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.error(`no release JSONs found in ${RELEASES_DIR}`);
  process.exit(1);
}

let okCount = 0;
let failCount = 0;
for (const f of files) {
  const full = join(RELEASES_DIR, f);
  let raw;
  try {
    raw = JSON.parse(readFileSync(full, "utf8"));
  } catch (e) {
    failCount++;
    console.error(`✗ ${f}: invalid JSON — ${e.message}`);
    continue;
  }
  const result = safeParseRelease(raw);
  if (result.ok) {
    okCount++;
  } else {
    failCount++;
    console.error(`✗ ${f}:`);
    for (const issue of result.errors) {
      console.error(`    ${issue.path}: ${issue.message}`);
    }
  }
}

console.log(
  `check:web-payload (${WEB_PAYLOAD_SCHEMA_VERSION}) — ${okCount} ok / ${failCount} fail`,
);
process.exit(failCount === 0 ? 0 : 1);
