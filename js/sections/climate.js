import { fetchData } from '../utils/fetch-handler.js';
import { formatPPM, formatPPB, formatDegC, formatNumber } from '../utils/format.js';
import { createCard, createSubCategory, updateCard, setCardError, setCardStale, getCardValueEl, getCardContextEl } from '../utils/dom.js';

export const sectionId = 'climate';

const FUEL_COLORS = {
  gas: '#f97316',
  coal: '#6b7280',
  nuclear: '#8b5cf6',
  wind: '#06b6d4',
  solar: '#eab308',
  biomass: '#22c55e',
  hydro: '#3b82f6',
  imports: '#ec4899',
  other: '#9ca3af',
};

export async function init() {
  const grid = document.querySelector('#climate .card-grid');

  const groups = [
    {
      title: 'Emissions',
      cards: [
        { id: 'climate-co2', label: 'Atmospheric CO2', featured: true },
        { id: 'climate-methane', label: 'Atmospheric Methane' },
        { id: 'climate-temp', label: 'Temperature Anomaly' },
      ],
    },
    {
      title: 'Energy',
      cards: [
        { id: 'climate-carbon', label: 'Grid Carbon Intensity (UK)' },
        { id: 'climate-fuelmix', label: 'Electricity Fuel Mix (UK)', featured: true },
      ],
    },
  ];

  for (const group of groups) {
    grid.appendChild(createSubCategory(group.title));
    for (const cfg of group.cards) {
      grid.appendChild(createCard(cfg));
    }
  }

  await refresh();
}

export async function refresh() {
  const results = await Promise.allSettled([
    fetchData('https://global-warming.org/api/co2-api'),
    fetchData('https://global-warming.org/api/methane-api'),
    fetchData('https://global-warming.org/api/temperature-api'),
    fetchData('https://api.carbonintensity.org.uk/intensity'),
    fetchData('https://api.carbonintensity.org.uk/generation'),
  ]);

  // CO2
  if (results[0].status === 'fulfilled' && !results[0].value.error) {
    const { data, stale } = results[0].value;
    const entries = data.co2 || [];
    if (entries.length > 0) {
      const latest = entries[entries.length - 1];
      const val = parseFloat(latest.cycle);
      updateCard('climate-co2', { value: formatPPM(val), state: stale ? 'stale' : 'success' });

      // Find same month last year for delta
      const latestMonth = parseInt(latest.month);
      const latestYear = parseInt(latest.year);
      const lastYear = entries.find(e => parseInt(e.year) === latestYear - 1 && parseInt(e.month) === latestMonth);
      if (lastYear) {
        const delta = (val - parseFloat(lastYear.cycle)).toFixed(1);
        const sign = delta > 0 ? '+' : '';
        updateCard('climate-co2', {
          context: `${sign}${delta} ppm vs last year`,
          contextClass: delta > 0 ? 'negative' : 'positive',
          state: stale ? 'stale' : 'success',
        });
      }
      if (stale) setCardStale('climate-co2');
    }
  } else {
    setCardError('climate-co2', () => refresh());
  }

  // Methane
  if (results[1].status === 'fulfilled' && !results[1].value.error) {
    const { data, stale } = results[1].value;
    const entries = data.methane || [];
    if (entries.length > 0) {
      const latest = entries[entries.length - 1];
      updateCard('climate-methane', {
        value: formatPPB(parseFloat(latest.average)),
        context: 'NOAA global monthly average',
        state: stale ? 'stale' : 'success',
      });
      if (stale) setCardStale('climate-methane');
    }
  } else {
    setCardError('climate-methane', () => refresh());
  }

  // Temperature anomaly
  if (results[2].status === 'fulfilled' && !results[2].value.error) {
    const { data, stale } = results[2].value;
    const entries = data.result || [];
    if (entries.length > 0) {
      const latest = entries[entries.length - 1];
      const val = parseFloat(latest.station);
      updateCard('climate-temp', {
        value: formatDegC(val),
        context: 'vs 1951-1980 average',
        contextClass: val > 0 ? 'negative' : 'positive',
        state: stale ? 'stale' : 'success',
      });
      if (stale) setCardStale('climate-temp');
    }
  } else {
    setCardError('climate-temp', () => refresh());
  }

  // UK carbon intensity
  if (results[3].status === 'fulfilled' && !results[3].value.error) {
    const { data, stale } = results[3].value;
    if (data.data && data.data.length > 0) {
      const intensity = data.data[0].intensity;
      const actual = intensity.actual || intensity.forecast;
      const index = intensity.index || 'unknown';
      updateCard('climate-carbon', {
        value: `${actual} gCO2/kWh`,
        context: `Index: ${index}`,
        state: stale ? 'stale' : 'success',
      });
      if (stale) setCardStale('climate-carbon');
    }
  } else {
    setCardError('climate-carbon', () => refresh());
  }

  // UK fuel mix
  if (results[4].status === 'fulfilled' && !results[4].value.error) {
    const { data, stale } = results[4].value;
    if (data.data && data.data.generationmix) {
      renderFuelMix(data.data.generationmix, stale);
    }
  } else {
    setCardError('climate-fuelmix', () => refresh());
  }
}

function renderFuelMix(mix, stale) {
  const card = document.getElementById('climate-fuelmix');
  if (!card) return;

  card.dataset.state = stale ? 'stale' : 'success';

  const valEl = card.querySelector('.stat-value');
  valEl.textContent = '';
  valEl.classList.add('stat-value--embed');

  // Build the bar
  const bar = document.createElement('div');
  bar.className = 'fuel-mix-bar';
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', 'Electricity fuel mix bar chart — see legend below for breakdown');

  // Build legend
  const legend = document.createElement('div');
  legend.className = 'fuel-mix-legend';

  for (const item of mix) {
    if (item.perc <= 0) continue;
    const fuel = item.fuel.toLowerCase();
    const color = FUEL_COLORS[fuel] || FUEL_COLORS.other;

    const segment = document.createElement('div');
    segment.className = 'fuel-segment';
    segment.style.flex = String(item.perc);
    segment.style.backgroundColor = color;
    if (item.perc >= 5) {
      segment.textContent = `${item.perc.toFixed(0)}%`;
    }
    bar.appendChild(segment);

    const legendItem = document.createElement('span');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.backgroundColor = color;
    legendItem.appendChild(dot);
    legendItem.appendChild(document.createTextNode(` ${item.fuel} ${item.perc.toFixed(1)}%`));
    legend.appendChild(legendItem);
  }

  valEl.appendChild(bar);
  valEl.appendChild(legend);

  if (stale) setCardStale('climate-fuelmix');
}
