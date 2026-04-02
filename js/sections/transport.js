"use strict";
import { fetchData } from '../utils/fetch-handler.js';
import { formatNumber } from '../utils/format.js';
import { createCard, updateCard, setCardError, setCardFreshness, getCardValueEl } from '../utils/dom.js';
import { getFreshness } from '../utils/freshness.js';
import { CountUp } from '../utils/counter.js';

export const sectionId = 'transport';

let counter = null;

export async function init() {
  const grid = document.querySelector('#transport .card-grid');
  grid.appendChild(createCard({ id: 'transport-flights', label: 'Flights in the Air Right Now', featured: true }));
  await refresh();
}

export async function refresh() {
  const res = await fetchData('data/flight-count.json', { timeout: 5000, retries: 0 });

  if (res.error || !res.data || typeof res.data.count !== 'number') {
    setCardError('transport-flights', () => refresh());
    return;
  }

  const { data, stale } = res;
  const inAir = data.count;

  if (counter) {
    counter.update(inAir);
  } else {
    const el = getCardValueEl('transport-flights');
    if (el) {
      counter = new CountUp(el, inAir);
      counter.start();
    }
  }

  // Build context showing tracking source breakdown
  const stats = data.stats;
  let breakdown = '';
  if (stats) {
    const adsb = stats['ads-b'] || 0;
    const sat = stats.satellite || 0;
    breakdown = ` | ${formatNumber(adsb)} ADS-B, ${formatNumber(sat)} satellite`;
  }

  updateCard('transport-flights', {
    context: `Tracked by Flightradar24${breakdown} (live)`,
    state: 'success',
  });
  setCardFreshness('transport-flights', getFreshness('transport-flights', stale));
}
