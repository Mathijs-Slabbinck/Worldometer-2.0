// ISS Toilet Monitor — GitHub Actions script
// Connects to NASA Lightstreamer, reads urine tank level,
// detects flush events by comparing with stored values,
// and updates TOILET_DATA.md.

import { LightstreamerClient, Subscription } from 'lightstreamer-client-node';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = resolve(__dirname, '..', 'TOILET_DATA.md');

const TIMEOUT_MS = 90_000;
const FLUSH_THRESHOLD = -3;  // Tank drop > 3% = flush

// ---------------------------------------------------------------------------
// Parse existing TOILET_DATA.md
// ---------------------------------------------------------------------------

function parseData() {
  try {
    const content = readFileSync(DATA_FILE, 'utf-8');

    const get = (key) => {
      const match = content.match(new RegExp(`<!-- ${key}: (.+?) -->`));
      if (!match) return null;
      const val = match[1].trim();
      return val === 'null' ? null : val;
    };

    const rawTank = get('TANK_LEVEL');
    const rawPrev = get('PREV_TANK_LEVEL');

    return {
      tankLevel: rawTank !== null ? parseFloat(rawTank) : null,
      lastUpdated: get('LAST_UPDATED'),
      lastFlush: get('LAST_FLUSH'),
      prevTankLevel: rawPrev !== null ? parseFloat(rawPrev) : null,
      history: parseHistory(content),
    };
  } catch {
    return {
      tankLevel: null,
      lastUpdated: null,
      lastFlush: null,
      prevTankLevel: null,
      history: [],
    };
  }
}

function parseHistory(content) {
  const history = [];
  const section = content.split('## Recent History');
  if (section.length < 2) return history;

  const lines = section[1].trim().split('\n');
  // Skip the header row and separator row (first 2 lines after split)
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) continue;
    const parts = line.split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 3 && parts[0] !== '—') {
      history.push({ time: parts[0], event: parts[1], change: parts[2] });
    }
  }
  return history;
}

// ---------------------------------------------------------------------------
// Write updated TOILET_DATA.md
// ---------------------------------------------------------------------------

function writeData(data) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const fmtDate = (iso) => {
    if (!iso) return 'None detected yet';
    return iso.replace('T', ' ').replace('Z', ' UTC');
  };

  // Keep last 50 history entries
  const history = data.history.slice(0, 50);
  const historyRows = history.length > 0
    ? history.map(h => `| ${h.time} | ${h.event} | ${h.change} |`).join('\n')
    : '| — | No events recorded yet | — |';

  const tankStr = data.tankLevel !== null ? data.tankLevel.toFixed(1) : 'null';
  const prevStr = data.prevTankLevel !== null ? data.prevTankLevel.toFixed(1) : 'null';

  const content = `# ISS Toilet Telemetry

<!-- Machine-readable data — do not edit manually -->
<!-- TANK_LEVEL: ${tankStr} -->
<!-- LAST_UPDATED: ${now} -->
<!-- LAST_FLUSH: ${data.lastFlush || 'null'} -->
<!-- PREV_TANK_LEVEL: ${prevStr} -->

## Current Status

| Metric | Value |
|---|---|
| Tank Level | ${data.tankLevel !== null ? data.tankLevel.toFixed(1) + '%' : 'Unknown'} |
| Last Updated | ${fmtDate(now)} |
| Last Flush Detected | ${fmtDate(data.lastFlush)} |

## Recent History

| Time (UTC) | Event | Change |
|---|---|---|
${historyRows}
`;

  writeFileSync(DATA_FILE, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Connect to Lightstreamer and get current tank level
// ---------------------------------------------------------------------------

function fetchTankLevel() {
  return new Promise((resolve, reject) => {
    const client = new LightstreamerClient(
      'https://push.lightstreamer.com',
      'ISSLIVE'
    );

    const timeout = setTimeout(() => {
      client.disconnect();
      reject(new Error('Timeout waiting for ISS telemetry data'));
    }, TIMEOUT_MS);

    const sub = new Subscription('MERGE', ['NODE3000005'], ['Value']);

    sub.addListener({
      onItemUpdate(update) {
        const val = update.getValue('Value');
        if (val !== null && val !== undefined) {
          clearTimeout(timeout);
          client.unsubscribe(sub);
          client.disconnect();
          resolve(parseFloat(val));
        }
      },
    });

    client.addListener({
      onStatusChange(status) {
        console.log('[iss-monitor] Lightstreamer:', status);
      },
      onServerError(code, message) {
        clearTimeout(timeout);
        client.disconnect();
        reject(new Error(`Lightstreamer error ${code}: ${message}`));
      },
    });

    client.subscribe(sub);
    client.connect();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Reading existing data...');
  const data = parseData();
  console.log('Stored tank level:', data.tankLevel !== null ? data.tankLevel.toFixed(1) + '%' : 'none');

  console.log('Connecting to ISS Lightstreamer...');
  let newLevel;
  try {
    newLevel = await fetchTankLevel();
  } catch (err) {
    console.error('Failed to get tank level:', err.message);
    process.exit(1);
  }

  console.log('Live tank level:', newLevel.toFixed(1) + '%');

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const fmtNow = now.replace('T', ' ').replace('Z', '').trim();

  // Compare with stored level to detect flush events
  if (data.tankLevel !== null) {
    const diff = newLevel - data.tankLevel;

    // Detect flush: significant drop (>3%)
    if (diff < FLUSH_THRESHOLD) {
      console.log(`FLUSH detected! Tank dropped ${diff.toFixed(1)}%`);
      data.lastFlush = now;
      data.history.unshift({
        time: fmtNow,
        event: 'Flush detected',
        change: `${data.tankLevel.toFixed(1)}% → ${newLevel.toFixed(1)}%`,
      });
    } else {
      console.log(`No significant change (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%)`);
    }
  } else {
    console.log('No previous data — recording initial level');
  }

  data.prevTankLevel = data.tankLevel;
  data.tankLevel = newLevel;

  console.log('Writing updated data...');
  writeData(data);
  console.log('Done.');
}

main();
