"use strict";

// SATCAT Update — fetches CelesTrak SATCAT catalog + Launch Library 2 failure counts.
// Runs inside the ISS toilet GH Action, gated to once per 6 hours.
// Writes summary counts to data/satellite-stats.json and browse files per object type.

import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '..', 'data');
const STATS_FILE = resolve(DATA_DIR, 'satellite-stats.json');

const GATE_HOURS = 6;
const SATCAT_URL = 'https://celestrak.org/pub/satcat.csv';
const LL2_BASE = 'https://ll.thespacedevs.com/2.2.0/launch';

// CSV column indices (0-based)
const COL = Object.freeze({
  OBJECT_NAME: 0,
  OBJECT_ID: 1,
  NORAD_CAT_ID: 2,
  OBJECT_TYPE: 3,
  OPS_STATUS_CODE: 4,
  OWNER: 5,
  LAUNCH_DATE: 6,
  LAUNCH_SITE: 7,
  DECAY_DATE: 8,
  PERIOD: 9,
  INCLINATION: 10,
  APOGEE: 11,
  PERIGEE: 12,
  RCS: 13,
  DATA_STATUS_CODE: 14,
  ORBIT_CENTER: 15,
  ORBIT_TYPE: 16,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readStats() {
  try {
    return JSON.parse(readFileSync(STATS_FILE, 'utf-8'));
  } catch {
    return { lastUpdated: null };
  }
}

function writeJSON(filePath, data, compact) {
  const json = compact ? JSON.stringify(data) : JSON.stringify(data, null, 2);
  writeFileSync(filePath, json + '\n', 'utf-8');
}

function hoursSince(isoString) {
  if (!isoString) return Infinity;
  const diff = Date.now() - new Date(isoString).getTime();
  return diff / (1000 * 60 * 60);
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function fetchText(url, timeout = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

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

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

function parseCSV(csvText) {
  const lines = csvText.split('\n');
  // Skip header row
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(',');
    // SATCAT has exactly 17 columns — if more, the name had a comma; rejoin
    if (cols.length > 17) {
      const extra = cols.length - 17;
      const nameParts = cols.slice(0, extra + 1);
      cols.splice(0, extra + 1, nameParts.join(','));
    }
    if (cols.length < 17) continue;

    records.push(cols);
  }

  return records;
}

// ---------------------------------------------------------------------------
// Trimmed browse record
// ---------------------------------------------------------------------------

function toBrowseRecord(cols) {
  return {
    n: cols[COL.OBJECT_NAME].trim(),
    id: parseInt(cols[COL.NORAD_CAT_ID], 10) || 0,
    intl: cols[COL.OBJECT_ID].trim(),
    owner: cols[COL.OWNER].trim(),
    launch: cols[COL.LAUNCH_DATE].trim(),
    perigee: parseInt(cols[COL.PERIGEE], 10) || 0,
    apogee: parseInt(cols[COL.APOGEE], 10) || 0,
  };
}

function toPayloadBrowseRecord(cols) {
  const rec = toBrowseRecord(cols);
  rec.status = cols[COL.OPS_STATUS_CODE].trim();
  return rec;
}

// ---------------------------------------------------------------------------
// Launch Library 2 failure counts
// ---------------------------------------------------------------------------

async function fetchLaunchCounts(previousStats) {
  const result = {
    failures: previousStats?.overview?.launchFailures ?? 0,
    partialFailures: previousStats?.overview?.partialFailures ?? 0,
    starlinkFailures: previousStats?.starlink?.launchFailures ?? 0,
  };

  try {
    console.log('[satcat-update] Fetching LL2 launch failure counts...');

    const failData = await fetchJSON(`${LL2_BASE}/?status=4&limit=1&mode=list`);
    result.failures = failData.count ?? result.failures;
    console.log(`[satcat-update] Total launch failures: ${result.failures}`);

    await sleep(2000);

    const partialData = await fetchJSON(`${LL2_BASE}/?status=7&limit=1&mode=list`);
    result.partialFailures = partialData.count ?? result.partialFailures;
    console.log(`[satcat-update] Partial failures: ${result.partialFailures}`);

    await sleep(2000);

    const starlinkData = await fetchJSON(`${LL2_BASE}/?search=starlink&status=4&limit=1&mode=list`);
    result.starlinkFailures = starlinkData.count ?? result.starlinkFailures;
    console.log(`[satcat-update] Starlink launch failures: ${result.starlinkFailures}`);
  } catch (err) {
    console.error('[satcat-update] LL2 fetch failed, using previous values:', err.message);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const previousStats = readStats();
  const hours = hoursSince(previousStats.lastUpdated);

  if (hours < GATE_HOURS) {
    console.log(`[satcat-update] Last updated ${hours.toFixed(1)}h ago — skipping (gate: ${GATE_HOURS}h)`);
    return;
  }

  console.log('[satcat-update] Fetching SATCAT catalog...');

  let csvText;
  try {
    csvText = await fetchText(SATCAT_URL, 60000);
  } catch (err) {
    console.error('[satcat-update] SATCAT fetch failed:', err.message);
    return;
  }

  console.log(`[satcat-update] Downloaded ${(csvText.length / 1024 / 1024).toFixed(1)} MB`);

  const records = parseCSV(csvText);
  console.log(`[satcat-update] Parsed ${records.length} records`);

  // Categorise by object type
  const byType = { PAY: [], 'R/B': [], DEB: [], UNK: [] };
  for (const cols of records) {
    const objType = cols[COL.OBJECT_TYPE].trim();
    if (byType[objType]) {
      byType[objType].push(cols);
    } else {
      // Anything else goes into UNK
      byType.UNK.push(cols);
    }
  }

  // Count helper
  function countStats(arr) {
    let total = arr.length;
    let inOrbit = 0;
    let decayed = 0;
    let active = 0;

    for (const cols of arr) {
      const decay = cols[COL.DECAY_DATE].trim();
      const status = cols[COL.OPS_STATUS_CODE].trim();

      if (decay) {
        decayed++;
      } else {
        inOrbit++;
      }

      if (status === '+' || status === 'P' || status === 'B' || status === 'S' || status === 'X') {
        active++;
      }
    }

    return { total, inOrbit, decayed, active };
  }

  // Compute stats per type
  const payStats = countStats(byType.PAY);
  const rbStats = countStats(byType['R/B']);
  const debStats = countStats(byType.DEB);
  const unkStats = countStats(byType.UNK);

  // Starlink subset (from payloads)
  const starlinkRecords = byType.PAY.filter(function (cols) {
    return cols[COL.OBJECT_NAME].trim().toUpperCase().startsWith('STARLINK');
  });
  const starlinkStats = countStats(starlinkRecords);

  // Fetch launch failure counts from LL2
  const launchCounts = await fetchLaunchCounts(previousStats);

  // Build stats object
  const stats = {
    lastUpdated: new Date().toISOString(),
    overview: {
      totalLaunched: records.length,
      payloads: payStats.total,
      inOrbit: payStats.inOrbit + rbStats.inOrbit + debStats.inOrbit + unkStats.inOrbit,
      decayed: payStats.decayed + rbStats.decayed + debStats.decayed + unkStats.decayed,
      launchFailures: launchCounts.failures,
      partialFailures: launchCounts.partialFailures,
    },
    payloads: payStats,
    starlink: {
      ...starlinkStats,
      launchFailures: launchCounts.starlinkFailures,
    },
    rocketBodies: rbStats,
    debris: debStats,
    unknown: unkStats,
  };

  // Write stats
  writeJSON(STATS_FILE, stats);
  console.log('[satcat-update] Wrote satellite-stats.json');

  // Build browse files — in-orbit records only, sorted by launch date descending
  function sortByLaunchDesc(a, b) {
    const dateA = a[COL.LAUNCH_DATE].trim();
    const dateB = b[COL.LAUNCH_DATE].trim();
    if (dateA > dateB) return -1;
    if (dateA < dateB) return 1;
    return 0;
  }

  // Payloads (in-orbit, non-Starlink + Starlink separate)
  const payInOrbit = byType.PAY
    .filter(function (cols) { return !cols[COL.DECAY_DATE].trim(); })
    .sort(sortByLaunchDesc)
    .map(toPayloadBrowseRecord);

  const starlinkInOrbit = starlinkRecords
    .filter(function (cols) { return !cols[COL.DECAY_DATE].trim(); })
    .sort(sortByLaunchDesc)
    .map(toPayloadBrowseRecord);

  const rbInOrbit = byType['R/B']
    .filter(function (cols) { return !cols[COL.DECAY_DATE].trim(); })
    .sort(sortByLaunchDesc)
    .map(toBrowseRecord);

  const debInOrbit = byType.DEB
    .filter(function (cols) { return !cols[COL.DECAY_DATE].trim(); })
    .sort(sortByLaunchDesc)
    .map(toBrowseRecord);

  const unkInOrbit = byType.UNK
    .filter(function (cols) { return !cols[COL.DECAY_DATE].trim(); })
    .sort(sortByLaunchDesc)
    .map(toBrowseRecord);

  writeJSON(resolve(DATA_DIR, 'satcat-pay.json'), payInOrbit, true);
  writeJSON(resolve(DATA_DIR, 'satcat-starlink.json'), starlinkInOrbit, true);
  writeJSON(resolve(DATA_DIR, 'satcat-rb.json'), rbInOrbit, true);
  writeJSON(resolve(DATA_DIR, 'satcat-deb.json'), debInOrbit, true);
  writeJSON(resolve(DATA_DIR, 'satcat-unk.json'), unkInOrbit, true);

  console.log(`[satcat-update] Browse files written:`);
  console.log(`  PAY: ${payInOrbit.length} | Starlink: ${starlinkInOrbit.length} | R/B: ${rbInOrbit.length} | DEB: ${debInOrbit.length} | UNK: ${unkInOrbit.length}`);
  console.log('[satcat-update] Done.');
}

main().catch(function (err) {
  console.error('[satcat-update] Fatal error:', err);
  process.exit(1);
});
