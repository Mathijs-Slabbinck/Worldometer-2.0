// Update Tracker — checks non-live APIs for data year changes
// Runs inside the ISS toilet GH Action, gated to once per day.
// Extensible: add new checker functions to CHECKERS array.

import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = resolve(__dirname, '..', 'data', 'last-updated.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readTracker() {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { lastChecked: null, cards: {} };
  }
}

function writeTracker(tracker) {
  writeFileSync(DATA_FILE, JSON.stringify(tracker, null, 2) + '\n', 'utf-8');
}

function hoursSinceLastCheck(tracker) {
  if (!tracker.lastChecked) return Infinity;
  const diff = Date.now() - new Date(tracker.lastChecked).getTime();
  return diff / (1000 * 60 * 60);
}

async function fetchJSON(url, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Checkers — each returns { cardId, year } or null if no update detected
// ---------------------------------------------------------------------------

// REST Countries: detect data year by comparing India's population against
// known UN estimates. The API doesn't include a year field.
// UN World Population Prospects (medium variant) for India:
//   2022: 1,417,173,000  |  2023: 1,428,628,000  |  2024: 1,440,068,000
//   2025: 1,451,484,000  |  2026: 1,462,812,000
// We check which range the returned value falls into.
const INDIA_POP_THRESHOLDS = [
  { year: 2026, min: 1_455_000_000 },
  { year: 2025, min: 1_444_000_000 },
  { year: 2024, min: 1_433_000_000 },
  { year: 2023, min: 1_422_000_000 },
  { year: 2022, min: 1_410_000_000 },
];

async function checkRestCountries() {
  console.log('[update-tracker] Checking REST Countries API...');
  try {
    const data = await fetchJSON('https://restcountries.com/v3.1/name/india?fields=name,population');
    if (!Array.isArray(data) || data.length === 0) return null;

    const pop = data[0].population;
    console.log(`[update-tracker] India population: ${pop.toLocaleString()}`);

    let detectedYear = 2022; // fallback
    for (const threshold of INDIA_POP_THRESHOLDS) {
      if (pop >= threshold.min) {
        detectedYear = threshold.year;
        break;
      }
    }

    console.log(`[update-tracker] Detected data year: ${detectedYear}`);
    return [
      { cardId: 'pop-countries', year: detectedYear },
      { cardId: 'pop-most-populous', year: detectedYear },
      { cardId: 'pop-dense', year: detectedYear },
      { cardId: 'pop-largest', year: detectedYear },
    ];
  } catch (err) {
    console.error('[update-tracker] REST Countries check failed:', err.message);
    return null;
  }
}

// Add more checker functions here as needed:
// async function checkSomeOtherAPI() { ... }

const CHECKERS = [
  checkRestCountries,
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const tracker = readTracker();
  const hours = hoursSinceLastCheck(tracker);

  if (hours < 23) {
    console.log(`[update-tracker] Last checked ${hours.toFixed(1)}h ago — skipping (gate: 23h)`);
    return false; // no update
  }

  console.log('[update-tracker] Running daily update checks...');
  let changed = false;

  for (const checker of CHECKERS) {
    const results = await checker();
    if (!results) continue;

    for (const result of results) {
      const existing = tracker.cards[result.cardId];
      if (!existing || existing.year !== result.year) {
        console.log(`[update-tracker] ${result.cardId}: ${existing?.year || '?'} → ${result.year}`);
        tracker.cards[result.cardId] = {
          ...existing,
          year: result.year,
        };
        changed = true;
      }
    }
  }

  tracker.lastChecked = new Date().toISOString();
  writeTracker(tracker);

  if (changed) {
    console.log('[update-tracker] Tracker updated with new data.');
  } else {
    console.log('[update-tracker] No changes detected.');
  }

  return changed;
}

main().catch((err) => {
  console.error('[update-tracker] Fatal error:', err);
  process.exit(1);
});
