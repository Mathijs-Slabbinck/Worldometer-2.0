"use strict";

// Fetches the global flight count from Flightradar24's undocumented feed endpoint.
// Runs every 15 min via the ISS toilet GH Action (no gate — always fresh).
// Writes to data/flight-count.json for the frontend to read.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '..', 'data');
const OUTPUT_FILE = resolve(DATA_DIR, 'flight-count.json');

const FR24_FEED_URL = 'https://data-cloud.flightradar24.com/zones/fcgi/feed.js?faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=0&air=1&vehicles=0&estimated=1&maxage=14400&gliders=0&stats=1';

async function fetchJSON(url, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log('[flight-count] Fetching FR24 flight count...');

  try {
    const data = await fetchJSON(FR24_FEED_URL, 15000);
    const fullCount = data.full_count;

    if (typeof fullCount !== 'number' || fullCount <= 0) {
      throw new Error('Invalid full_count: ' + fullCount);
    }

    const result = {
      lastUpdated: new Date().toISOString(),
      count: fullCount,
      stats: data.stats && data.stats.total ? data.stats.total : null,
    };

    writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2) + '\n', 'utf-8');
    console.log(`[flight-count] Flights tracked: ${fullCount}`);
  } catch (err) {
    console.error('[flight-count] Fetch failed, keeping previous value:', err.message);
    // Ensure file exists so the frontend doesn't 404
    if (!existsSync(OUTPUT_FILE)) {
      writeFileSync(OUTPUT_FILE, JSON.stringify({ lastUpdated: null, count: null, stats: null }, null, 2) + '\n', 'utf-8');
    }
  }
}

main().catch(function (err) {
  console.error('[flight-count] Fatal error:', err);
  process.exit(1);
});
