import { fetchData } from '../utils/fetch-handler.js';
import { formatNumber } from '../utils/format.js';
import { createCard, updateCard, setCardError, setCardStale, getCardValueEl } from '../utils/dom.js';
import { CountUp } from '../utils/counter.js';

export const sectionId = 'transport';

let counter = null;

export async function init() {
  const grid = document.querySelector('#transport .card-grid');
  grid.appendChild(createCard({ id: 'transport-flights', label: 'Flights in the Air Right Now', featured: true }));
  await refresh();
}

export async function refresh() {
  // Try global first
  let res = await fetchData('https://opensky-network.org/api/states/all', { timeout: 15000, retries: 0 });

  let qualifier = '';

  // Fallback to Europe region
  if (res.error || !res.data) {
    res = await fetchData('https://opensky-network.org/api/states/all?lamin=35&lomin=-10&lamax=60&lomax=30', { timeout: 15000, retries: 0 });
    qualifier = ' over Europe';
  }

  if (res.error || !res.data) {
    setCardError('transport-flights', () => refresh());
    return;
  }

  const { data, stale } = res;
  const states = data.states || [];

  // Count flights not on ground (index 8 is on_ground)
  let inAir = 0;
  for (const s of states) {
    if (!s[8]) inAir++;
  }

  if (counter) {
    counter.update(inAir);
  } else {
    const el = getCardValueEl('transport-flights');
    if (el) {
      counter = new CountUp(el, inAir);
      counter.start();
    }
  }

  updateCard('transport-flights', {
    context: `Based on ADS-B data from OpenSky Network${qualifier}`,
    state: stale ? 'stale' : 'success',
  });
  if (stale) setCardStale('transport-flights');
}
