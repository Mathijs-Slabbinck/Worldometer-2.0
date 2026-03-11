import { fetchData } from '../utils/fetch-handler.js';
import { formatNumber } from '../utils/format.js';
import { createCard, createSubCategory, updateCard, setCardError, setCardFreshness, getCardValueEl } from '../utils/dom.js';
import { getFreshness } from '../utils/freshness.js';
import { openModal } from '../utils/modal.js';
import { CountUp } from '../utils/counter.js';

export const sectionId = 'earth';

const counters = {};
let allQuakes = [];
let hourlyQuakes = [];
let significantQuakes = [];

// Weather location state
let weatherLocation = null; // { lat, lon, city, country } — null means "detect via IP"
let locationPickerBuilt = false;
let geocodeTimer = null;

// Pre-industrial baseline (~14°C) to convert anomaly to estimated global avg temp
const GLOBAL_TEMP_BASELINE = 14.0;

const WEATHER_CODES = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Slight showers', 81: 'Moderate showers', 82: 'Violent showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};

export async function init() {
  const grid = document.querySelector('#earth .card-grid');

  const groups = [
    {
      title: 'Earthquakes',
      cards: [
        { id: 'earth-quakes-hour', label: 'Earthquakes in the Last Hour', featured: true },
        { id: 'earth-quakes-significant', label: 'Significant Quakes This Month' },
        { id: 'earth-quakes-browse', label: 'Browse Recent Earthquakes' },
      ],
    },
    {
      title: 'Natural Events',
      cards: [
        { id: 'earth-events', label: 'Active Natural Events', featured: true },
      ],
    },
    {
      title: 'Weather',
      cards: [
        { id: 'earth-global-temp', label: 'Estimated Global Average Temperature' },
        { id: 'earth-weather', label: 'Weather at Your Location', featured: true },
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
    fetchData('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson'),
    fetchData('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson'),
    fetchData('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'),
    fetchData('https://global-warming.org/api/temperature-api'),
    resolveWeatherLocation(),
    fetchData('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50', { retries: 0 }),
  ]);

  // Earthquakes last hour
  if (results[0].status === 'fulfilled' && !results[0].value.error) {
    const { data, stale } = results[0].value;
    const count = data.metadata.count;
    let strongest = null;

    for (const f of data.features) {
      if (!strongest || f.properties.mag > strongest.mag) {
        strongest = { mag: f.properties.mag, place: f.properties.place };
      }
    }

    if (counters['earth-quakes-hour']) {
      counters['earth-quakes-hour'].update(count);
    } else {
      const el = getCardValueEl('earth-quakes-hour');
      if (el) {
        counters['earth-quakes-hour'] = new CountUp(el, count);
        counters['earth-quakes-hour'].start();
      }
    }

    const ctx = strongest && strongest.mag ? `Strongest: M${strongest.mag.toFixed(1)} — ${strongest.place} (live)` : 'No significant activity (live)';
    updateCard('earth-quakes-hour', { context: ctx, state: 'success' });
    setCardFreshness('earth-quakes-hour', getFreshness('earth-quakes-hour', stale));

    hourlyQuakes = [...data.features].sort((a, b) => b.properties.time - a.properties.time);
    buildQuakeList(hourlyQuakes, 'earth-quakes-hour', 'quake-hour-panel');
  } else {
    setCardError('earth-quakes-hour', () => refresh());
  }

  // Significant quakes this month
  if (results[1].status === 'fulfilled' && !results[1].value.error) {
    const { data, stale } = results[1].value;
    const count = data.metadata.count;

    if (counters['earth-quakes-significant']) {
      counters['earth-quakes-significant'].update(count);
    } else {
      const el = getCardValueEl('earth-quakes-significant');
      if (el) {
        counters['earth-quakes-significant'] = new CountUp(el, count);
        counters['earth-quakes-significant'].start();
      }
    }

    const sorted = [...data.features].sort((a, b) => b.properties.mag - a.properties.mag);
    const top3 = sorted.slice(0, 3).map(f => `M${f.properties.mag.toFixed(1)} ${f.properties.place}`).join(' | ');
    updateCard('earth-quakes-significant', { context: (top3 || 'None') + ' (live)', state: 'success' });
    setCardFreshness('earth-quakes-significant', getFreshness('earth-quakes-significant', stale));

    significantQuakes = [...data.features].sort((a, b) => b.properties.time - a.properties.time);
    buildQuakeList(significantQuakes, 'earth-quakes-significant', 'quake-sig-panel');
  } else {
    setCardError('earth-quakes-significant', () => refresh());
  }

  // Browse recent earthquakes (all_day feed)
  if (results[2].status === 'fulfilled' && !results[2].value.error) {
    const { data, stale } = results[2].value;
    allQuakes = [...data.features].sort((a, b) => b.properties.time - a.properties.time);
    const count = allQuakes.length;

    updateCard('earth-quakes-browse', {
      value: `${formatNumber(count)} today`,
      context: 'Select an earthquake below to view details (live)',
      state: 'success',
    });
    setCardFreshness('earth-quakes-browse', getFreshness('earth-quakes-browse', stale));

    buildQuakeList(allQuakes, 'earth-quakes-browse', 'quake-browse-panel');
  } else {
    setCardError('earth-quakes-browse', () => refresh());
  }

  // Global temperature (from Global Warming API)
  if (results[3].status === 'fulfilled' && !results[3].value.error) {
    const { data, stale } = results[3].value;
    renderGlobalTemp(data, stale);
  } else {
    setCardError('earth-global-temp', () => refresh());
  }

  // Weather at location
  if (results[4].status === 'fulfilled' && results[4].value) {
    const loc = results[4].value;
    await fetchAndRenderWeather(loc);
  } else {
    setCardError('earth-weather', () => refresh());
  }

  // Build location picker once (after weather card exists)
  if (!locationPickerBuilt) {
    buildLocationPicker();
    locationPickerBuilt = true;
  }

  // EONET Natural Events
  if (results[5].status === 'fulfilled' && !results[5].value.error) {
    const { data, stale } = results[5].value;
    const events = data.events || [];
    const count = events.length;

    if (counters['earth-events']) {
      counters['earth-events'].update(count);
    } else {
      const el = getCardValueEl('earth-events');
      if (el) {
        counters['earth-events'] = new CountUp(el, count);
        counters['earth-events'].start();
      }
    }

    // Count by category
    const catCounts = {};
    for (const evt of events) {
      const cat = (evt.categories && evt.categories.length > 0) ? evt.categories[0].title : 'Other';
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    }
    const catSummary = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([cat, n]) => `${cat}: ${n}`)
      .join(' | ');

    const contextText = catSummary
      ? `${catSummary} (live)`
      : `Active global natural events (live)`;

    updateCard('earth-events', {
      context: contextText,
      state: 'success',
    });
    setCardFreshness('earth-events', getFreshness('earth-events', stale));

    buildEventList(events);
  } else {
    setCardError('earth-events', () => refresh());
  }
}

function renderGlobalTemp(data, stale) {
  // API may return an array or an object keyed by decimal year
  const resultData = data ? data.result : null;
  if (!resultData) {
    setCardError('earth-global-temp', () => refresh());
    return;
  }

  let entries;
  if (Array.isArray(resultData)) {
    entries = resultData;
  } else if (typeof resultData === 'object') {
    entries = Object.keys(resultData).sort().map(function (key) {
      const entry = resultData[key];
      return { time: key, station: entry.station, land: entry.land };
    });
  } else {
    entries = [];
  }

  if (entries.length === 0) {
    setCardError('earth-global-temp', () => refresh());
    return;
  }

  // Get latest entry with valid station data
  let latest = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.station && entry.station !== '') {
      latest = entry;
      break;
    }
  }

  if (!latest) {
    setCardError('earth-global-temp', () => refresh());
    return;
  }

  const anomaly = parseFloat(latest.station);
  const estimatedTemp = GLOBAL_TEMP_BASELINE + anomaly;

  // Convert decimal year to readable date (e.g. 2026.04 -> ~Jan 2026)
  const decimalYear = parseFloat(latest.time);
  const year = Math.floor(decimalYear);
  const monthFraction = decimalYear - year;
  const monthIndex = Math.round(monthFraction * 12);
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthLabel = monthNames[Math.min(monthIndex, 11)] || 'jan';

  const sign = anomaly >= 0 ? '+' : '';
  const ctx = `${sign}${anomaly.toFixed(2)}\u00B0C anomaly vs pre-industrial baseline (${monthLabel} ${year})`;

  updateCard('earth-global-temp', {
    value: `${estimatedTemp.toFixed(1)}\u00B0C`,
    context: ctx,
    state: 'success',
  });
  setCardFreshness('earth-global-temp', getFreshness('earth-global-temp', stale));
}

async function fetchAndRenderWeather(loc) {
  const weatherRes = await fetchData(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current_weather=true`
  );
  if (!weatherRes.error && weatherRes.data) {
    const w = weatherRes.data.current_weather;
    const temp = w.temperature;
    const wind = w.windspeed;
    const code = w.weathercode;
    const condition = WEATHER_CODES[code] || 'Unknown';

    updateCard('earth-weather', {
      value: `${temp}\u00B0C`,
      context: `${condition} | Wind: ${wind} km/h | ${loc.city}, ${loc.country} (live)`,
      state: 'success',
    });
    setCardFreshness('earth-weather', getFreshness('earth-weather', weatherRes.stale));
  } else {
    setCardError('earth-weather', () => refresh());
  }
}

// Resolve the weather location: use user-selected location or fall back to IP detection
async function resolveWeatherLocation() {
  if (weatherLocation) {
    return weatherLocation;
  }

  // Auto-detect via IP
  const res = await fetchData('https://ipapi.co/json/', { retries: 0 });
  if (!res.error && res.data) {
    const detected = {
      lat: res.data.latitude,
      lon: res.data.longitude,
      city: res.data.city || 'Unknown',
      country: res.data.country_name || '',
    };
    // Store as default so we don't re-detect every refresh
    if (!weatherLocation) {
      weatherLocation = detected;
    }
    return detected;
  }

  return null;
}

// Build the location picker UI below the weather card
function buildLocationPicker() {
  const card = document.getElementById('earth-weather');
  if (!card) return;

  // Remove existing picker if present
  const existing = card.querySelector('.location-picker');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.className = 'location-picker';

  // Current location display + change button
  const btnChange = document.createElement('button');
  btnChange.className = 'location-picker-toggle';
  btnChange.setAttribute('type', 'button');
  btnChange.textContent = 'Change location';
  btnChange.setAttribute('aria-expanded', 'false');
  btnChange.setAttribute('aria-controls', 'location-picker-panel');

  // Search panel (hidden by default)
  const panel = document.createElement('div');
  panel.className = 'location-picker-panel';
  panel.id = 'location-picker-panel';

  const input = document.createElement('input');
  input.className = 'location-picker-input';
  input.setAttribute('type', 'text');
  input.setAttribute('placeholder', 'Search city (e.g. Tokyo, Paris, New York)...');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-label', 'Search city or location');

  const resultsList = document.createElement('ul');
  resultsList.className = 'location-picker-results';
  resultsList.setAttribute('role', 'listbox');
  resultsList.setAttribute('aria-label', 'Location search results');

  const btnMyLocation = document.createElement('button');
  btnMyLocation.className = 'location-picker-myloc';
  btnMyLocation.setAttribute('type', 'button');
  btnMyLocation.textContent = 'Use my detected location';

  panel.appendChild(input);
  panel.appendChild(resultsList);
  panel.appendChild(btnMyLocation);

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
      requestAnimationFrame(function () {
        input.focus();
      });
    } else {
      panel.classList.remove('open');
      btnChange.textContent = 'Change location';
    }
  });

  // Debounced geocoding search
  input.addEventListener('input', function () {
    clearTimeout(geocodeTimer);
    const query = input.value.trim();
    if (query.length < 2) {
      resultsList.replaceChildren();
      return;
    }
    geocodeTimer = setTimeout(function () {
      searchGeocode(query, resultsList, panel, btnChange);
    }, 350);
  });

  // "Use my detected location" resets to IP-based
  btnMyLocation.addEventListener('click', function () {
    weatherLocation = null;
    panelOpen = false;
    panel.classList.remove('open');
    btnChange.textContent = 'Change location';
    btnChange.setAttribute('aria-expanded', 'false');
    // Re-fetch weather with IP location
    refreshWeatherOnly();
  });
}

async function searchGeocode(query, resultsList, panel, btnChange) {
  resultsList.replaceChildren();

  const res = await fetchData(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en`,
    { retries: 0 }
  );

  if (res.error || !res.data || !res.data.results || res.data.results.length === 0) {
    const li = document.createElement('li');
    li.className = 'location-picker-empty';
    li.textContent = 'No results found';
    resultsList.appendChild(li);
    return;
  }

  for (const place of res.data.results) {
    const li = document.createElement('li');
    li.className = 'location-picker-result';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'location-result-name';
    nameSpan.textContent = place.name;

    const detailSpan = document.createElement('span');
    detailSpan.className = 'location-result-detail';
    const parts = [];
    if (place.admin1) parts.push(place.admin1);
    if (place.country) parts.push(place.country);
    detailSpan.textContent = parts.join(', ');

    li.appendChild(nameSpan);
    li.appendChild(detailSpan);
    li.setAttribute('tabindex', '0');
    li.setAttribute('role', 'option');

    const selectPlace = function () {
      weatherLocation = {
        lat: place.latitude,
        lon: place.longitude,
        city: place.name,
        country: place.country || '',
      };
      panel.classList.remove('open');
      btnChange.textContent = 'Change location';
      btnChange.setAttribute('aria-expanded', 'false');
      refreshWeatherOnly();
    };

    li.addEventListener('click', selectPlace);
    li.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectPlace();
      }
    });

    resultsList.appendChild(li);
  }
}

// Refresh only the weather card (when user changes location)
async function refreshWeatherOnly() {
  const loc = await resolveWeatherLocation();
  if (loc) {
    await fetchAndRenderWeather(loc);
  } else {
    setCardError('earth-weather', () => refreshWeatherOnly());
  }
}

// Earthquake expandable list
function buildQuakeList(quakes, cardId, panelId) {
  const card = document.getElementById(cardId);
  if (!card) return;

  // Remove any existing expandable list and detail panel
  const existing = card.querySelector('.expandable-list');
  if (existing) existing.remove();
  const existingDetail = card.querySelector('.quake-detail');
  if (existingDetail) existingDetail.remove();

  if (quakes.length === 0) return;

  const divList = document.createElement('div');
  divList.className = 'expandable-list';

  // Toggle button
  const btnToggle = document.createElement('button');
  btnToggle.className = 'expandable-toggle';
  btnToggle.setAttribute('type', 'button');
  btnToggle.setAttribute('aria-expanded', 'false');
  btnToggle.setAttribute('aria-controls', panelId);

  const spnToggleText = document.createElement('span');
  spnToggleText.textContent = 'Browse earthquakes';

  const spnToggleArrow = document.createElement('span');
  spnToggleArrow.className = 'expandable-toggle-arrow';
  spnToggleArrow.textContent = '\u25BC';
  spnToggleArrow.setAttribute('aria-hidden', 'true');

  btnToggle.appendChild(spnToggleText);
  btnToggle.appendChild(spnToggleArrow);

  // Panel
  const divPanel = document.createElement('div');
  divPanel.className = 'expandable-panel';
  divPanel.id = panelId;
  divPanel.setAttribute('aria-label', 'Earthquake list');

  // Search input
  const inpSearch = document.createElement('input');
  inpSearch.className = 'expandable-search';
  inpSearch.setAttribute('type', 'text');
  inpSearch.setAttribute('placeholder', 'Search by location, magnitude (e.g. M5, Alaska)...');
  inpSearch.setAttribute('autocomplete', 'off');
  inpSearch.setAttribute('aria-label', 'Search earthquakes');

  // Items list
  const ulItems = document.createElement('ul');
  ulItems.className = 'expandable-items';
  ulItems.setAttribute('role', 'list');

  divPanel.appendChild(inpSearch);
  divPanel.appendChild(ulItems);

  divList.appendChild(btnToggle);
  divList.appendChild(divPanel);

  // Detail panel (shows when a quake is selected)
  const divDetail = document.createElement('div');
  divDetail.className = 'quake-detail';

  card.appendChild(divList);
  card.appendChild(divDetail);

  // Render quake items
  function renderItems(filter) {
    ulItems.replaceChildren();
    const query = (filter || '').trim().toLowerCase();
    let filtered = quakes;

    if (query) {
      filtered = quakes.filter(function (f) {
        const place = (f.properties.place || '').toLowerCase();
        const mag = `m${(f.properties.mag || 0).toFixed(1)}`;
        const magRound = `m${Math.round(f.properties.mag || 0)}`;
        const title = (f.properties.title || '').toLowerCase();
        return place.includes(query) || mag.includes(query) || magRound.includes(query) || title.includes(query);
      });
    }

    if (filtered.length === 0) {
      const liEmpty = document.createElement('li');
      liEmpty.className = 'expandable-empty';
      liEmpty.textContent = 'No matching earthquakes';
      ulItems.appendChild(liEmpty);
      return;
    }

    // Limit to 100 items for performance
    const shown = filtered.slice(0, 100);
    for (let i = 0; i < shown.length; i++) {
      const quake = shown[i];
      const props = quake.properties;
      const liItem = document.createElement('li');
      liItem.className = 'expandable-item';

      const spnMag = document.createElement('span');
      spnMag.className = 'expandable-item-label ' + getMagColorClass(props.mag);
      spnMag.textContent = props.mag !== null ? `M${props.mag.toFixed(1)}` : 'M?';

      const spnPlace = document.createElement('span');
      spnPlace.className = 'quake-item-place';
      spnPlace.textContent = props.place || 'Unknown location';

      const spnTime = document.createElement('span');
      spnTime.className = 'expandable-item-meta';
      spnTime.textContent = formatQuakeTime(props.time);

      liItem.appendChild(spnMag);
      liItem.appendChild(spnPlace);
      liItem.appendChild(spnTime);
      liItem.setAttribute('tabindex', '0');
      liItem.setAttribute('role', 'button');
      liItem.setAttribute('aria-label', `Magnitude ${props.mag !== null ? props.mag.toFixed(1) : 'unknown'} — ${props.place || 'Unknown location'}`);

      const selectQuake = function () {
        showQuakeDetail(quake, divDetail);
        // Highlight selected item
        const prev = ulItems.querySelector('.expandable-item.selected');
        if (prev) prev.classList.remove('selected');
        liItem.classList.add('selected');
      }

      liItem.addEventListener('click', selectQuake);
      liItem.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectQuake();
        }
      });

      ulItems.appendChild(liItem);
    }

    if (filtered.length > 100) {
      const liMore = document.createElement('li');
      liMore.className = 'expandable-empty';
      liMore.textContent = `${filtered.length - 100} more — refine your search`;
      ulItems.appendChild(liMore);
    }
  }

  // Toggle open/close
  let isOpen = false;
  btnToggle.addEventListener('click', function () {
    isOpen = !isOpen;
    btnToggle.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      divPanel.classList.add('open');
      spnToggleArrow.classList.add('open');
      spnToggleText.textContent = 'Hide earthquake list';
      renderItems('');
    } else {
      divPanel.classList.remove('open');
      spnToggleArrow.classList.remove('open');
      spnToggleText.textContent = 'Browse earthquakes';
      inpSearch.value = '';
      divDetail.replaceChildren();
    }
  });

  // Search handler
  inpSearch.addEventListener('input', function () {
    renderItems(inpSearch.value);
  });
}

// Show earthquake detail below the list
function showQuakeDetail(quake, container) {
  container.replaceChildren();
  const props = quake.properties;
  const coords = quake.geometry.coordinates;
  const longitude = coords[0];
  const latitude = coords[1];
  const depth = coords[2];

  // Header: magnitude + place
  const divHeader = document.createElement('div');
  divHeader.className = 'quake-detail-header';

  const spnMag = document.createElement('span');
  spnMag.className = 'quake-detail-mag ' + getMagColorClass(props.mag);
  spnMag.textContent = props.mag !== null ? `M${props.mag.toFixed(1)}` : 'M?';

  const spnPlace = document.createElement('span');
  spnPlace.className = 'quake-detail-place';
  spnPlace.textContent = props.place || 'Unknown location';

  divHeader.appendChild(spnMag);
  divHeader.appendChild(spnPlace);
  container.appendChild(divHeader);

  // Detail grid
  const divGrid = document.createElement('div');
  divGrid.className = 'quake-detail-grid';

  // Magnitude info
  addDetailRow(divGrid, 'Magnitude', props.mag !== null ? props.mag.toFixed(1) : 'Unknown');
  addDetailRow(divGrid, 'Mag Type', (props.magType || 'Unknown').toUpperCase());

  // Depth
  addDetailRow(divGrid, 'Depth', depth !== null ? `${depth.toFixed(1)} km` : 'Unknown');

  // Coordinates
  addDetailRow(divGrid, 'Latitude', latitude !== null ? latitude.toFixed(4) + '\u00B0' : 'Unknown');
  addDetailRow(divGrid, 'Longitude', longitude !== null ? longitude.toFixed(4) + '\u00B0' : 'Unknown');

  // Time (UTC)
  if (props.time) {
    const d = new Date(props.time);
    const utcStr = d.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
    addDetailRow(divGrid, 'Time (UTC)', utcStr);
    // Local time
    const localStr = d.toLocaleString();
    addDetailRow(divGrid, 'Time (Local)', localStr);
  }

  // Updated
  if (props.updated) {
    const upd = new Date(props.updated);
    const updStr = upd.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
    addDetailRow(divGrid, 'Last Updated', updStr);
  }

  // Tsunami warning
  const tsunamiText = props.tsunami === 1 ? 'YES — Tsunami warning issued' : 'No';
  const tsunamiClass = props.tsunami === 1 ? 'quake-tsunami-yes' : '';
  addDetailRow(divGrid, 'Tsunami Warning', tsunamiText, tsunamiClass);

  // Significance
  if (props.sig !== null && props.sig !== undefined) {
    addDetailRow(divGrid, 'Significance', `${props.sig} / 1000`);
  }

  // Felt reports
  if (props.felt !== null && props.felt !== undefined) {
    addDetailRow(divGrid, 'Felt Reports', formatNumber(props.felt));
  }

  // Community Intensity (CDI)
  if (props.cdi !== null && props.cdi !== undefined) {
    addDetailRow(divGrid, 'Community Intensity', props.cdi.toFixed(1));
  }

  // Max Instrument Intensity (MMI)
  if (props.mmi !== null && props.mmi !== undefined) {
    addDetailRow(divGrid, 'Max Instrument Intensity', props.mmi.toFixed(1));
  }

  // Alert level
  if (props.alert) {
    addDetailRow(divGrid, 'Alert Level', props.alert.charAt(0).toUpperCase() + props.alert.slice(1), `quake-alert-${props.alert}`);
  }

  // Status
  addDetailRow(divGrid, 'Status', (props.status || 'Unknown').charAt(0).toUpperCase() + (props.status || 'Unknown').slice(1));

  // Event type
  addDetailRow(divGrid, 'Event Type', (props.type || 'earthquake').charAt(0).toUpperCase() + (props.type || 'earthquake').slice(1));

  // Network
  if (props.net) {
    addDetailRow(divGrid, 'Network', props.net.toUpperCase());
  }

  // Number of stations
  if (props.nst !== null && props.nst !== undefined) {
    addDetailRow(divGrid, 'Stations Used', String(props.nst));
  }

  // Azimuthal gap
  if (props.gap !== null && props.gap !== undefined) {
    addDetailRow(divGrid, 'Azimuthal Gap', `${props.gap.toFixed(1)}\u00B0`);
  }

  // Min distance to station
  if (props.dmin !== null && props.dmin !== undefined) {
    addDetailRow(divGrid, 'Min Station Dist', `${props.dmin.toFixed(3)}\u00B0`);
  }

  // RMS travel time residual
  if (props.rms !== null && props.rms !== undefined) {
    addDetailRow(divGrid, 'RMS Residual', `${props.rms.toFixed(2)} sec`);
  }

  container.appendChild(divGrid);

  // USGS event page link
  if (props.url) {
    const divLink = document.createElement('div');
    divLink.className = 'quake-detail-link';
    const anc = document.createElement('a');
    anc.href = props.url;
    anc.target = '_blank';
    anc.rel = 'noopener noreferrer';
    anc.textContent = 'View on USGS \u2192';
    anc.setAttribute('aria-label', `View ${props.place || 'earthquake'} on USGS (opens in new tab)`);
    divLink.appendChild(anc);
    container.appendChild(divLink);
  }
}

function addDetailRow(container, label, value, valueClass) {
  const spnLabel = document.createElement('span');
  spnLabel.className = 'quake-detail-label';
  spnLabel.textContent = label;

  const spnValue = document.createElement('span');
  spnValue.className = 'quake-detail-value';
  if (valueClass) spnValue.classList.add(valueClass);
  spnValue.textContent = value;

  container.appendChild(spnLabel);
  container.appendChild(spnValue);
}

function getMagColorClass(mag) {
  if (mag === null || mag === undefined) return '';
  if (mag >= 7) return 'quake-mag-major';
  if (mag >= 5) return 'quake-mag-strong';
  if (mag >= 3) return 'quake-mag-moderate';
  if (mag >= 1) return 'quake-mag-light';
  return 'quake-mag-micro';
}

function formatQuakeTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day}-${month} ${hours}:${minutes}`;
}

// EONET event expandable list
function buildEventList(events) {
  const card = document.getElementById('earth-events');
  if (!card) return;

  const existing = card.querySelector('.expandable-list');
  if (existing) existing.remove();

  if (events.length === 0) return;

  const divList = document.createElement('div');
  divList.className = 'expandable-list';

  const btnToggle = document.createElement('button');
  btnToggle.className = 'expandable-toggle';
  btnToggle.setAttribute('type', 'button');
  btnToggle.setAttribute('aria-expanded', 'false');
  btnToggle.setAttribute('aria-controls', 'event-panel');

  const spnToggleText = document.createElement('span');
  spnToggleText.textContent = 'View all events';

  const spnToggleArrow = document.createElement('span');
  spnToggleArrow.className = 'expandable-toggle-arrow';
  spnToggleArrow.textContent = '\u25BC';
  spnToggleArrow.setAttribute('aria-hidden', 'true');

  btnToggle.appendChild(spnToggleText);
  btnToggle.appendChild(spnToggleArrow);

  const divPanel = document.createElement('div');
  divPanel.className = 'expandable-panel';
  divPanel.id = 'event-panel';
  divPanel.setAttribute('aria-label', 'Natural events list');

  const inpSearch = document.createElement('input');
  inpSearch.className = 'expandable-search';
  inpSearch.setAttribute('type', 'text');
  inpSearch.setAttribute('placeholder', 'Search events (e.g. wildfire, storm)...');
  inpSearch.setAttribute('autocomplete', 'off');
  inpSearch.setAttribute('aria-label', 'Search natural events');

  const ulItems = document.createElement('ul');
  ulItems.className = 'expandable-items';
  ulItems.setAttribute('role', 'list');

  divPanel.appendChild(inpSearch);
  divPanel.appendChild(ulItems);

  divList.appendChild(btnToggle);
  divList.appendChild(divPanel);
  card.appendChild(divList);

  function renderItems(filter) {
    ulItems.replaceChildren();
    const query = (filter || '').trim().toLowerCase();
    let filtered = events;

    if (query) {
      filtered = events.filter(function (evt) {
        const title = (evt.title || '').toLowerCase();
        const cat = (evt.categories && evt.categories.length > 0) ? evt.categories[0].title.toLowerCase() : '';
        return title.includes(query) || cat.includes(query);
      });
    }

    if (filtered.length === 0) {
      const liEmpty = document.createElement('li');
      liEmpty.className = 'expandable-empty';
      liEmpty.textContent = 'No matching events';
      ulItems.appendChild(liEmpty);
      return;
    }

    for (let i = 0; i < filtered.length; i++) {
      const evt = filtered[i];
      const liItem = document.createElement('li');
      liItem.className = 'expandable-item';

      const spnTitle = document.createElement('span');
      spnTitle.className = 'expandable-item-label expandable-item-label--sans';
      spnTitle.textContent = evt.title || 'Unknown event';

      const spnCat = document.createElement('span');
      spnCat.className = 'eonet-category';
      const catName = (evt.categories && evt.categories.length > 0) ? evt.categories[0].title : 'Other';
      spnCat.textContent = catName;

      liItem.appendChild(spnTitle);
      liItem.appendChild(spnCat);
      liItem.setAttribute('tabindex', '0');
      liItem.setAttribute('role', 'button');
      liItem.setAttribute('aria-label', `${evt.title || 'Event'} — ${catName}`);

      liItem.addEventListener('click', function () { showEventModal(evt); });
      liItem.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showEventModal(evt);
        }
      });

      ulItems.appendChild(liItem);
    }
  }

  let isOpen = false;
  btnToggle.addEventListener('click', function () {
    isOpen = !isOpen;
    btnToggle.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      divPanel.classList.add('open');
      spnToggleArrow.classList.add('open');
      spnToggleText.textContent = 'Hide events';
      renderItems('');
    } else {
      divPanel.classList.remove('open');
      spnToggleArrow.classList.remove('open');
      spnToggleText.textContent = 'View all events';
      inpSearch.value = '';
    }
  });

  inpSearch.addEventListener('input', function () {
    renderItems(inpSearch.value);
  });
}

function showEventModal(evt) {
  const bodyDiv = document.createElement('div');

  // Category
  const cat = (evt.categories && evt.categories.length > 0) ? evt.categories[0].title : 'Unknown';
  const catP = document.createElement('p');
  catP.className = 'modal-description';
  catP.textContent = `Category: ${cat}`;
  bodyDiv.appendChild(catP);

  // Detail grid
  const grid = document.createElement('div');
  grid.className = 'modal-detail-grid';

  function addRow(label, value) {
    const lblEl = document.createElement('span');
    lblEl.className = 'modal-detail-label';
    lblEl.textContent = label;
    const valEl = document.createElement('span');
    valEl.className = 'modal-detail-value';
    valEl.textContent = value;
    grid.appendChild(lblEl);
    grid.appendChild(valEl);
  }

  if (evt.id) addRow('Event ID', evt.id);

  // Latest geometry (coordinates + date)
  if (evt.geometry && evt.geometry.length > 0) {
    const latest = evt.geometry[evt.geometry.length - 1];
    if (latest.date) {
      const d = new Date(latest.date);
      addRow('Last Updated', d.toUTCString());
    }
    if (latest.coordinates && latest.coordinates.length >= 2) {
      addRow('Longitude', latest.coordinates[0].toFixed(4) + '\u00B0');
      addRow('Latitude', latest.coordinates[1].toFixed(4) + '\u00B0');
    }
  }

  bodyDiv.appendChild(grid);

  // Sources
  if (evt.sources && evt.sources.length > 0) {
    const srcLabel = document.createElement('p');
    srcLabel.className = 'modal-section-label modal-spaced';
    srcLabel.textContent = 'Sources:';
    bodyDiv.appendChild(srcLabel);

    const srcList = document.createElement('ul');
    srcList.className = 'modal-linked-list';
    for (const src of evt.sources) {
      const li = document.createElement('li');
      if (src.url) {
        const a = document.createElement('a');
        a.href = src.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = src.id || src.url;
        li.appendChild(a);
      } else {
        li.textContent = src.id || 'Unknown';
      }
      srcList.appendChild(li);
    }
    bodyDiv.appendChild(srcList);
  }

  // EONET link
  const linkP = document.createElement('p');
  linkP.className = 'modal-link-row';
  const link = document.createElement('a');
  link.href = `https://eonet.gsfc.nasa.gov/api/v3/events/${encodeURIComponent(evt.id)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'View on NASA EONET \u2192';
  linkP.appendChild(link);
  bodyDiv.appendChild(linkP);

  openModal({ title: evt.title || 'Natural Event', body: bodyDiv });
}

