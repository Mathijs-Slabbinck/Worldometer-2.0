// ISS Live Telemetry via NASA's Lightstreamer endpoint
// Telemetry IDs from ISS-Mimic project: https://github.com/ISS-Mimic/Mimic
// Connection approach from pISSStream: https://github.com/Jaennaet/pISSStream

import { LightstreamerClient, Subscription } from '../vendor/lightstreamer.esm.js';

const ITEMS = {
  urineTank: 'NODE3000005',     // Urine Tank [%]
  signal: 'TIME_000001',         // Signal status
};

const FIELDS = ['Value', 'Status', 'TimeStamp'];
const SIGNAL_FIELDS = ['Status.Class', 'Status', 'TimeStamp'];

let client = null;
let listeners = [];
let lastValues = {};
let connected = false;
let hasSignal = false;

// Track usage/flush events by watching value changes
let lastUrineTankValue = null;
let lastFlushTime = null;
let lastUseTime = null;
let initializedFromPersisted = false;
let firstLiveReading = true;

// Load persisted state from TOILET_DATA.md (called before connect)
export function setInitialState(state) {
  if (state.lastUseTime && !lastUseTime) {
    lastUseTime = new Date(state.lastUseTime);
  }
  if (state.lastFlushTime && !lastFlushTime) {
    lastFlushTime = new Date(state.lastFlushTime);
  }
  if (state.tankLevel !== null && state.tankLevel !== undefined && lastUrineTankValue === null) {
    lastUrineTankValue = state.tankLevel;
    initializedFromPersisted = true;
  }
}

export function getState() {
  return {
    connected,
    hasSignal,
    urineTankPercent: lastValues.urineTank || null,
    lastFlushTime,
    lastUseTime,
  };
}

export function onUpdate(fn) {
  listeners.push(fn);
}

function notify() {
  const state = getState();
  for (const fn of listeners) {
    fn(state);
  }
}

export function connect() {
  if (client) return;

  client = new LightstreamerClient(
    'https://push.lightstreamer.com',
    'ISSLIVE'
  );

  client.addListener({
    onStatusChange(status) {
      connected = status.startsWith('CONNECTED');
      notify();
    },
  });

  // Subscribe to urine tank telemetry
  const urineSub = new Subscription(
    'MERGE',
    [ITEMS.urineTank],
    FIELDS
  );

  urineSub.addListener({
    onItemUpdate(update) {
      const val = update.getValue('Value');

      if (val !== null && val !== undefined) {
        const numVal = parseFloat(val);
        lastValues.urineTank = val;

        // Detect flush: significant drop in tank level (>3%)
        // Note: detection only works while page is open. A reconnection after
        // a gap may cause false positives if the tank changed significantly
        // while disconnected. 3% threshold balances sensitivity vs noise.
        // Skip detection on the first live reading if baseline came from
        // persisted data — the gap between sessions causes false positives
        if (lastUrineTankValue !== null) {
          if (firstLiveReading && initializedFromPersisted) {
            firstLiveReading = false;
          } else {
            const diff = numVal - lastUrineTankValue;
            if (diff < -3) {
              lastFlushTime = new Date();
            }
            // Detect use: tank level increase (>0.5%)
            if (diff > 0.5) {
              lastUseTime = new Date();
            }
          }
        }
        lastUrineTankValue = numVal;
      }

      notify();
    },
  });

  // Subscribe to signal status
  const signalSub = new Subscription(
    'MERGE',
    [ITEMS.signal],
    SIGNAL_FIELDS
  );

  signalSub.addListener({
    onItemUpdate(update) {
      const statusClass = update.getValue('Status.Class');
      // Status.Class "24" = has signal, "1" = no signal
      hasSignal = statusClass === '24';
      notify();
    },
  });

  client.subscribe(urineSub);
  client.subscribe(signalSub);
  client.connect();
}
