"use strict";
import { fetchData } from '../utils/fetch-handler.js';
import { formatPPM, formatPPB, formatDegC, formatNumber } from '../utils/format.js';
import { createCard, createSubCategory, updateCard, setCardError, setCardFreshness, getCardValueEl, getCardContextEl } from '../utils/dom.js';
import { getFreshness } from '../utils/freshness.js';
import { WAQI_TOKEN } from '../config.js';

export const sectionId = 'climate';

// AQI city state
let aqiCity = null; // null = auto-detect from IP
let aqiPickerBuilt = false;
let aqiSearchTimer = null;

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
        { id: 'climate-arctic', label: 'Arctic Sea Ice Extent' },
        { id: 'climate-ocean', label: 'Ocean Warming Anomaly' },
      ],
    },
    {
      title: 'Air Quality',
      cards: [
        { id: 'climate-aqi', label: 'Air Quality Index', featured: true },
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

  // AQI has its own fetch cycle (city-dependent)
  refreshAQI().catch(function (err) { console.error('[climate] AQI refresh failed:', err); });
}

export async function refresh() {
  const results = await Promise.allSettled([
    fetchData('https://global-warming.org/api/co2-api'),
    fetchData('https://global-warming.org/api/methane-api'),
    fetchData('https://global-warming.org/api/temperature-api'),
    fetchData('https://api.carbonintensity.org.uk/intensity'),
    fetchData('https://api.carbonintensity.org.uk/generation'),
    fetchData('https://global-warming.org/api/arctic-api'),
    fetchData('https://global-warming.org/api/ocean-warming-api'),
  ]);

  // CO2
  if (results[0].status === 'fulfilled' && !results[0].value.error) {
    const { data, stale } = results[0].value;
    const entries = data.co2 || [];
    if (entries.length > 0) {
      const latest = entries[entries.length - 1];
      const val = parseFloat(latest.cycle);
      const co2Date = `${String(latest.day).padStart(2, '0')}-${String(latest.month).padStart(2, '0')}-${latest.year}`;
      updateCard('climate-co2', { value: formatPPM(val), state: 'success' });

      // Find same month last year for delta
      const latestMonth = parseInt(latest.month);
      const latestYear = parseInt(latest.year);
      const lastYear = entries.find(e => parseInt(e.year) === latestYear - 1 && parseInt(e.month) === latestMonth);
      if (lastYear) {
        const delta = (val - parseFloat(lastYear.cycle)).toFixed(1);
        const sign = delta > 0 ? '+' : '';
        updateCard('climate-co2', {
          context: `${sign}${delta} ppm vs last year (${co2Date})`,
          contextClass: delta > 0 ? 'negative' : 'positive',
          state: 'success',
        });
      } else {
        updateCard('climate-co2', {
          context: `NOAA ESRL data (${co2Date})`,
          state: 'success',
        });
      }
      setCardFreshness('climate-co2', getFreshness('climate-co2', stale));
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
      const rawDate = latest.date || '';
      const methaneMonthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      let methaneDate = rawDate;
      if (rawDate.includes('.')) {
        const [yr, mo] = rawDate.split('.');
        const moIdx = parseInt(mo, 10) - 1;
        methaneDate = `${methaneMonthNames[moIdx] || mo} ${yr}`;
      }
      updateCard('climate-methane', {
        value: formatPPB(parseFloat(latest.average)),
        context: `NOAA global monthly average (${methaneDate || 'unknown'})`,
        state: 'success',
      });
      setCardFreshness('climate-methane', getFreshness('climate-methane', stale));
    }
  } else {
    setCardError('climate-methane', () => refresh());
  }

  // Temperature anomaly
  if (results[2].status === 'fulfilled' && !results[2].value.error) {
    const { data, stale } = results[2].value;
    // API may return array or object keyed by decimal year
    let entries;
    const rawResult = data.result;
    if (Array.isArray(rawResult)) {
      entries = rawResult;
    } else if (rawResult && typeof rawResult === 'object') {
      entries = Object.keys(rawResult).sort().map(function (key) {
        const e = rawResult[key];
        return { time: key, station: e.station, land: e.land };
      });
    } else {
      entries = [];
    }
    if (entries.length > 0) {
      const latest = entries[entries.length - 1];
      const val = parseFloat(latest.station);
      const decYear = parseFloat(latest.time);
      const tempYear = Math.floor(decYear);
      const tempMonthIdx = Math.round((decYear - tempYear) * 12);
      const tempMonthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const tempMonthLabel = tempMonthNames[Math.min(tempMonthIdx, 11)] || '';
      updateCard('climate-temp', {
        value: formatDegC(val),
        context: `vs 1951-1980 average (${tempMonthLabel} ${tempYear})`,
        contextClass: val > 0 ? 'negative' : 'positive',
        state: 'success',
      });
      setCardFreshness('climate-temp', getFreshness('climate-temp', stale));
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
        context: `Index: ${index} (live)`,
        state: 'success',
      });
      setCardFreshness('climate-carbon', getFreshness('climate-carbon', stale));
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

  // Arctic sea ice extent
  if (results[5].status === 'fulfilled' && !results[5].value.error) {
    const { data, stale } = results[5].value;
    // API returns { arcticData: { data: { "YYYYMM": { value, anom, monthlyMean } } } }
    const arcticObj = (data.arcticData && data.arcticData.data) || {};
    const keys = Object.keys(arcticObj).sort();
    if (keys.length > 0) {
      const latestKey = keys[keys.length - 1]; // e.g. "202602"
      const latest = arcticObj[latestKey];
      const extent = parseFloat(latest.value);
      const anomaly = parseFloat(latest.anom);
      const mean = parseFloat(latest.monthlyMean);
      const extentStr = !isNaN(extent) ? extent.toFixed(2) + ' M km\u00B2' : '\u2014';

      const year = latestKey.substring(0, 4);
      const monthIdx = parseInt(latestKey.substring(4, 6), 10) - 1;
      const arcticMonthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const monthLabel = arcticMonthNames[monthIdx] || latestKey.substring(4, 6);

      let ctx = '';
      if (!isNaN(anomaly) && !isNaN(mean)) {
        const sign = anomaly >= 0 ? '+' : '';
        ctx = `${sign}${anomaly.toFixed(2)} M km\u00B2 vs mean ${mean.toFixed(2)} (${monthLabel} ${year})`;
      } else {
        ctx = `Arctic sea ice extent (${monthLabel} ${year})`;
      }

      updateCard('climate-arctic', {
        value: extentStr,
        context: ctx,
        contextClass: (!isNaN(anomaly) && anomaly < 0) ? 'negative' : 'positive',
        state: 'success',
      });
      setCardFreshness('climate-arctic', getFreshness('climate-arctic', stale));
    } else {
      setCardError('climate-arctic', () => refresh());
    }
  } else {
    setCardError('climate-arctic', () => refresh());
  }

  // Ocean warming anomaly
  if (results[6].status === 'fulfilled' && !results[6].value.error) {
    const { data, stale } = results[6].value;
    // API returns { result: { "1851": { anomaly: 0.01 }, "1852": ... } }
    const resultObj = data.result || {};
    const keys = Object.keys(resultObj).sort();
    if (keys.length > 0) {
      const latestYear = keys[keys.length - 1];
      const latest = resultObj[latestYear];
      const val = parseFloat(latest.anomaly);
      if (!isNaN(val)) {
        updateCard('climate-ocean', {
          value: formatDegC(val),
          context: `Ocean temperature anomaly (${latestYear})`,
          contextClass: val > 0 ? 'negative' : 'positive',
          state: 'success',
        });
        setCardFreshness('climate-ocean', getFreshness('climate-ocean', stale));
      } else {
        setCardError('climate-ocean', () => refresh());
      }
    } else {
      setCardError('climate-ocean', () => refresh());
    }
  } else {
    setCardError('climate-ocean', () => refresh());
  }
}

function renderFuelMix(mix, stale) {
  const card = document.getElementById('climate-fuelmix');
  if (!card) return;

  card.dataset.state = 'success';

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
    segment.style.flexGrow = String(item.perc);
    segment.style.backgroundColor = color;
    if (item.perc >= 5) {
      segment.textContent = `${item.perc.toFixed(0)}%`;
    }
    bar.appendChild(segment);

    const legendItem = document.createElement('span');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.backgroundColor = color;
    dot.setAttribute('aria-hidden', 'true');
    legendItem.appendChild(dot);
    legendItem.appendChild(document.createTextNode(` ${item.fuel} ${item.perc.toFixed(1)}%`));
    legend.appendChild(legendItem);
  }

  valEl.appendChild(bar);
  valEl.appendChild(legend);

  updateCard('climate-fuelmix', { context: 'Current generation mix (live)', state: 'success' });
  setCardFreshness('climate-fuelmix', getFreshness('climate-fuelmix', stale));
}

// ========================
// AQI (Air Quality Index)
// ========================

async function refreshAQI() {
  // Resolve city: user-selected or auto-detect via IP
  let cityName = aqiCity;
  if (!cityName) {
    try {
      const ipRes = await fetchData('https://ipinfo.io/json', { retries: 0 });
      if (!ipRes.error && ipRes.data && ipRes.data.city) {
        cityName = ipRes.data.city;
        aqiCity = cityName;
      } else {
        cityName = 'London'; // fallback
      }
    } catch {
      cityName = 'London';
    }
  }

  const res = await fetchData(`https://api.waqi.info/feed/${encodeURIComponent(cityName)}/?token=${WAQI_TOKEN}`, { retries: 1 });

  if (res.error || !res.data || res.data.status !== 'ok' || !res.data.data) {
    setCardError('climate-aqi', () => refreshAQI());
    if (!aqiPickerBuilt) {
      buildAQIPicker();
      aqiPickerBuilt = true;
    }
    return;
  }

  const d = res.data.data;
  const aqi = d.aqi;
  const level = getAQILevel(aqi);
  const dominant = d.dominentpol || d.dominantpol || '';
  const station = d.city ? d.city.name : cityName;

  // Build value with AQI number + badge
  const valEl = getCardValueEl('climate-aqi');
  if (valEl) {
    valEl.textContent = '';
    const numSpan = document.createElement('span');
    numSpan.textContent = String(aqi);
    valEl.appendChild(numSpan);

    const badge = document.createElement('span');
    badge.className = `aqi-badge ${level.cssClass}`;
    badge.textContent = level.label;
    valEl.appendChild(badge);
  }

  // Build context with pollutants
  const card = document.getElementById('climate-aqi');
  if (card) {
    card.dataset.state = 'success';
    const ctxEl = card.querySelector('.stat-context');
    if (ctxEl) {
      ctxEl.textContent = '';

      const stationText = document.createElement('div');
      stationText.textContent = station + ' (live)';
      if (dominant) {
        stationText.textContent = `${station} | Dominant: ${dominant.toUpperCase()} (live)`;
      }
      ctxEl.appendChild(stationText);

      // Show PM2.5 and O3 if available
      if (d.iaqi) {
        const pollDiv = document.createElement('div');
        pollDiv.className = 'aqi-pollutants';
        const pollutants = ['pm25', 'pm10', 'o3', 'no2', 'so2', 'co'];
        const labels = { pm25: 'PM2.5', pm10: 'PM10', o3: 'O₃', no2: 'NO₂', so2: 'SO₂', co: 'CO' };
        for (const p of pollutants) {
          if (d.iaqi[p] && d.iaqi[p].v !== undefined) {
            const span = document.createElement('span');
            const lbl = document.createElement('span');
            lbl.className = 'aqi-pollutant-label';
            lbl.textContent = labels[p] || p.toUpperCase();
            span.appendChild(lbl);
            span.appendChild(document.createTextNode(` ${d.iaqi[p].v}`));
            pollDiv.appendChild(span);
          }
        }
        if (pollDiv.children.length > 0) {
          ctxEl.appendChild(pollDiv);
        }
      }
    }
    setCardFreshness('climate-aqi', getFreshness('climate-aqi', res.stale));
  }

  // Build picker once
  if (!aqiPickerBuilt) {
    buildAQIPicker();
    aqiPickerBuilt = true;
  }
}

function getAQILevel(aqi) {
  if (aqi <= 50) return { label: 'Good', cssClass: 'aqi-good' };
  if (aqi <= 100) return { label: 'Moderate', cssClass: 'aqi-moderate' };
  if (aqi <= 150) return { label: 'Unhealthy for Sensitive', cssClass: 'aqi-sensitive' };
  if (aqi <= 200) return { label: 'Unhealthy', cssClass: 'aqi-unhealthy' };
  if (aqi <= 300) return { label: 'Very Unhealthy', cssClass: 'aqi-very-unhealthy' };
  return { label: 'Hazardous', cssClass: 'aqi-hazardous' };
}

function buildAQIPicker() {
  const card = document.getElementById('climate-aqi');
  if (!card) return;

  const existing = card.querySelector('.location-picker');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.className = 'location-picker';

  const btnChange = document.createElement('button');
  btnChange.className = 'location-picker-toggle';
  btnChange.setAttribute('type', 'button');
  btnChange.textContent = 'Change city';
  btnChange.setAttribute('aria-expanded', 'false');
  btnChange.setAttribute('aria-controls', 'aqi-picker-panel');

  const panel = document.createElement('div');
  panel.className = 'location-picker-panel';
  panel.id = 'aqi-picker-panel';

  const input = document.createElement('input');
  input.id = 'aqi-city-search';
  input.className = 'location-picker-input';
  input.setAttribute('type', 'text');
  input.setAttribute('placeholder', 'Search city (e.g. Beijing, Paris)...');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-label', 'Search city for air quality');

  const resultsList = document.createElement('ul');
  resultsList.className = 'location-picker-results';
  resultsList.setAttribute('role', 'listbox');

  panel.appendChild(input);
  panel.appendChild(resultsList);

  wrapper.appendChild(btnChange);
  wrapper.appendChild(panel);
  card.appendChild(wrapper);

  let panelOpen = false;

  btnChange.addEventListener('click', function () {
    panelOpen = !panelOpen;
    btnChange.setAttribute('aria-expanded', String(panelOpen));
    if (panelOpen) {
      panel.classList.add('open');
      btnChange.textContent = 'Cancel';
      input.value = '';
      resultsList.replaceChildren();
      requestAnimationFrame(function () { input.focus(); });
    } else {
      panel.classList.remove('open');
      btnChange.textContent = 'Change city';
    }
  });

  input.addEventListener('input', function () {
    clearTimeout(aqiSearchTimer);
    const query = input.value.trim();
    if (query.length < 2) {
      resultsList.replaceChildren();
      return;
    }
    aqiSearchTimer = setTimeout(function () {
      searchAQICity(query, resultsList, panel, btnChange);
    }, 400);
  });
}

async function searchAQICity(query, resultsList, panel, btnChange) {
  resultsList.replaceChildren();

  const res = await fetchData(
    `https://api.waqi.info/search/?keyword=${encodeURIComponent(query)}&token=${WAQI_TOKEN}`,
    { retries: 0 }
  );

  if (res.error || !res.data || res.data.status !== 'ok' || !res.data.data || res.data.data.length === 0) {
    const li = document.createElement('li');
    li.className = 'location-picker-empty';
    li.textContent = 'No results found';
    resultsList.appendChild(li);
    return;
  }

  for (const station of res.data.data.slice(0, 10)) {
    const li = document.createElement('li');
    li.className = 'location-picker-result';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'location-result-name';
    nameSpan.textContent = station.station.name || 'Unknown';

    const aqiSpan = document.createElement('span');
    aqiSpan.className = 'location-result-detail';
    aqiSpan.textContent = station.aqi ? `AQI: ${station.aqi}` : '';

    li.appendChild(nameSpan);
    li.appendChild(aqiSpan);
    li.setAttribute('tabindex', '0');
    li.setAttribute('role', 'option');

    const selectStation = function () {
      // Use the station URL uid to fetch exact data
      const uid = station.uid;
      aqiCity = `@${uid}`;
      panel.classList.remove('open');
      btnChange.textContent = 'Change city';
      btnChange.setAttribute('aria-expanded', 'false');
      btnChange.focus();
      refreshAQI();
    };

    li.addEventListener('click', selectStation);
    li.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectStation();
      }
    });

    resultsList.appendChild(li);
  }
}
