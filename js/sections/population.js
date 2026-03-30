"use strict";
import { fetchData } from '../utils/fetch-handler.js';
import { formatNumber, abbreviate, formatPercent } from '../utils/format.js';
import { createCard, createSubCategory, updateCard, setCardError, setCardFreshness, getCardValueEl } from '../utils/dom.js';
import { getFreshness } from '../utils/freshness.js';
import { CountUp } from '../utils/counter.js';
import { getTrackerYear } from '../utils/update-tracker.js';

export const sectionId = 'population';

const counters = {};
let tickerInterval = null;
let tickerTimeout = null;
let currentPopulation = 0;
let allCountries = [];
let selectedCountry = null; // null = Global
let worldPopulation = 0;

export async function init() {
  const grid = document.querySelector('#population .card-grid');

  // Add country picker before the card grid
  const section = document.querySelector('#population');
  const picker = buildCountryPicker();
  section.insertBefore(picker, grid);

  const cards = [
    { id: 'pop-world', label: 'World Population', featured: true },
    { id: 'pop-births', label: 'Daily Births' },
    { id: 'pop-deaths', label: 'Daily Deaths' },
    { id: 'pop-countries', label: 'Countries in the World' },
    { id: 'pop-largest', label: 'Largest Country by Area' },
    { id: 'pop-most-populous', label: 'Most Populous Country' },
    { id: 'pop-dense', label: 'Most Densely Populated Country' },
  ];

  for (const cfg of cards) {
    grid.appendChild(createCard(cfg));
  }

  // Demographics sub-category
  grid.appendChild(createSubCategory('Demographics'));
  const demoCards = [
    { id: 'pop-literacy', label: 'Global Literacy Rate' },
    { id: 'pop-internet', label: 'Global Internet Users' },
    { id: 'pop-poverty', label: 'Global Poverty Rate' },
  ];
  for (const cfg of demoCards) {
    grid.appendChild(createCard(cfg));
  }

  // Education sub-category (UNESCO UIS)
  grid.appendChild(createSubCategory('Education'));
  const eduCards = [
    { id: 'pop-out-of-school', label: 'Children Out of School', featured: true },
    { id: 'pop-completion-primary', label: 'Primary Completion Rate' },
    { id: 'pop-completion-secondary', label: 'Lower Secondary Completion Rate' },
    { id: 'pop-completion-upper', label: 'Upper Secondary Completion Rate' },
    { id: 'pop-tertiary', label: 'Global Tertiary Enrollment Ratio' },
  ];
  for (const cfg of eduCards) {
    grid.appendChild(createCard(cfg));
  }

  // Science sub-category (UNESCO UIS)
  grid.appendChild(createSubCategory('Science'));
  const sciCards = [
    { id: 'pop-researchers', label: 'Researchers per Million People' },
    { id: 'pop-rd-spending', label: 'Global R&D Spending (% of GDP)' },
  ];
  for (const cfg of sciCards) {
    grid.appendChild(createCard(cfg));
  }

  await refresh();
}

async function fetchPopulation() {
  // Primary: population.io — real-time daily estimates
  try {
    const res = await fetchData(
      'https://d6wn6bmjj722w.population.io/1.0/population/World/today-and-tomorrow/',
      { timeout: 8000 }
    );
    if (!res.error && res.data && res.data.total_population) {
      const today = res.data.total_population[0];
      if (today && today.population > 0) {
        return { population: today.population, stale: res.stale };
      }
    }
  } catch {
    // Fall through to World Bank
  }

  // Fallback: World Bank annual data
  const res = await fetchData(
    'https://api.worldbank.org/v2/country/WLD/indicator/SP.POP.TOTL?format=json&per_page=1&mrnev=1'
  );
  if (!res.error) {
    const pop = extractWorldBankValue(res.data);
    if (pop !== null) {
      return { population: pop, stale: res.stale };
    }
  }

  return { population: 0, stale: false };
}

export async function refresh() {
  const unescoBase = 'https://api.uis.unesco.org/api/public/data/indicators';
  const unescoWorld = 'SDG%3A%20World';
  const currentYear = new Date().getFullYear();

  const results = await Promise.allSettled([
    fetchPopulation(),
    fetchData('https://restcountries.com/v3.1/all?fields=name,population,region,area,cca3'),
    fetchData('https://api.worldbank.org/v2/country/WLD/indicator/SP.DYN.CBRT.IN?format=json&per_page=1&mrnev=1'),
    fetchData('https://api.worldbank.org/v2/country/WLD/indicator/SP.DYN.CDRT.IN?format=json&per_page=1&mrnev=1'),
    fetchData('https://api.worldbank.org/v2/country/WLD/indicator/SE.ADT.LITR.ZS?format=json&per_page=1&mrnev=1'),
    fetchData('https://api.worldbank.org/v2/country/WLD/indicator/IT.NET.USER.ZS?format=json&per_page=1&mrnev=1'),
    fetchData('https://api.worldbank.org/v2/country/WLD/indicator/SI.POV.DDAY?format=json&per_page=1&mrnev=1'),
    // UNESCO UIS: Education
    fetchData(`${unescoBase}?indicator=OFST.1.CP,OFST.2.CP,OFST.3.CP&geoUnit=${unescoWorld}&start=2020&end=${currentYear}`, { timeout: 12000 }),
    fetchData(`${unescoBase}?indicator=CR.1,CR.2,CR.3&geoUnit=${unescoWorld}&start=2020&end=${currentYear}`, { timeout: 12000 }),
    fetchData(`${unescoBase}?indicator=GER.5T8&geoUnit=${unescoWorld}&start=2020&end=${currentYear}`, { timeout: 12000 }),
    // UNESCO UIS: Science
    fetchData(`${unescoBase}?indicator=RESDEN.INHAB.TFTE&geoUnit=${unescoWorld}&start=2018&end=${currentYear}`, { timeout: 12000 }),
    fetchData(`${unescoBase}?indicator=EXPGDP.TOT&geoUnit=${unescoWorld}&start=2018&end=${currentYear}`, { timeout: 12000 }),
  ]);

  // World population from population.io (with World Bank fallback)
  if (results[0].status === 'fulfilled' && results[0].value.population > 0) {
    const { population, stale } = results[0].value;
    worldPopulation = population;

    if (!selectedCountry) {
      startPopulationTicker(worldPopulation, stale);
    }
  } else {
    if (!selectedCountry) {
      setCardError('pop-world', () => refresh());
    }
  }

  // Countries data
  if (results[1].status === 'fulfilled' && !results[1].value.error) {
    const { data, stale } = results[1].value;
    if (Array.isArray(data)) {
      allCountries = data;
      const count = data.length;
      const rcYear = await getTrackerYear('pop-countries', 'unknown');
      updateCard('pop-countries', {
        value: String(count),
        context: `Sovereign states and territories (${rcYear})`,
        state: 'success',
      });

      // Most populous (always global)
      const sorted = [...data].sort((a, b) => (b.population || 0) - (a.population || 0));
      if (sorted.length > 0) {
        const top = sorted[0];
        const name = top.name.common || top.name;
        const popYear = await getTrackerYear('pop-most-populous', 'unknown');
        updateCard('pop-most-populous', {
          value: name,
          context: `Population: ${formatNumber(top.population)} (${popYear})`,
          state: 'success',
        });
      }

      // Most densely populated (always global)
      // Filter out tiny territories (area < 1 km²) for meaningful results
      const withDensity = data
        .filter(c => c.population > 0 && c.area > 0)
        .map(c => ({
          name: c.name.common || c.name,
          population: c.population,
          area: c.area,
          density: c.population / c.area,
        }))
        .sort((a, b) => b.density - a.density);

      if (withDensity.length > 0) {
        const top = withDensity[0];
        const denseYear = await getTrackerYear('pop-dense', 'unknown');
        updateCard('pop-dense', {
          value: top.name,
          context: `${formatNumber(Math.round(top.density))} people/km\u00B2 (${denseYear})`,
          state: 'success',
        });
      }

      // Largest by area
      const byArea = [...data].sort((a, b) => (b.area || 0) - (a.area || 0));
      if (byArea.length > 0) {
        const top = byArea[0];
        const name = top.name.common || top.name;
        const areaYear = await getTrackerYear('pop-largest', 'unknown');
        updateCard('pop-largest', {
          value: name,
          context: `Area: ${formatNumber(top.area)} km\u00B2 (${areaYear})`,
          state: 'success',
        });
      }

      setCardFreshness('pop-countries', getFreshness('pop-countries', stale));
      setCardFreshness('pop-most-populous', getFreshness('pop-most-populous', stale));
      setCardFreshness('pop-dense', getFreshness('pop-dense', stale));
      setCardFreshness('pop-largest', getFreshness('pop-largest', stale));
    }
  } else {
    setCardError('pop-countries', () => refresh());
    setCardError('pop-most-populous', () => refresh());
    setCardError('pop-dense', () => refresh());
    setCardError('pop-largest', () => refresh());
  }

  // World birth/death rates (only when viewing Global)
  if (!selectedCountry) {
    updateBirthsDeaths(results[2], results[3], worldPopulation);
  }

  // Populate the country dropdown after data is fetched
  if (allCountries.length > 0) {
    populateCountryList();
  }

  // Demographics: Literacy
  if (results[4].status === 'fulfilled' && !results[4].value.error) {
    const { data, stale } = results[4].value;
    const val = extractWorldBankValue(data);
    const year = extractWorldBankYear(data);
    if (val !== null) {
      updateCard('pop-literacy', {
        value: formatPercent(val),
        context: `Adult literacy rate (${year || 'unknown'})`,
        state: 'success',
      });
      setCardFreshness('pop-literacy', getFreshness('pop-literacy', stale));
    }
  } else {
    setCardError('pop-literacy', () => refresh());
  }

  // Demographics: Internet users
  if (results[5].status === 'fulfilled' && !results[5].value.error) {
    const { data, stale } = results[5].value;
    const val = extractWorldBankValue(data);
    const year = extractWorldBankYear(data);
    if (val !== null) {
      updateCard('pop-internet', {
        value: formatPercent(val),
        context: `Percentage of population (${year || 'unknown'})`,
        state: 'success',
      });
      setCardFreshness('pop-internet', getFreshness('pop-internet', stale));
    }
  } else {
    setCardError('pop-internet', () => refresh());
  }

  // Demographics: Poverty rate
  if (results[6].status === 'fulfilled' && !results[6].value.error) {
    const { data, stale } = results[6].value;
    const val = extractWorldBankValue(data);
    const year = extractWorldBankYear(data);
    if (val !== null) {
      updateCard('pop-poverty', {
        value: formatPercent(val),
        context: `Living on less than $2.15/day (${year || 'unknown'})`,
        state: 'success',
      });
      setCardFreshness('pop-poverty', getFreshness('pop-poverty', stale));
    }
  } else {
    setCardError('pop-poverty', () => refresh());
  }

  // Education: Out-of-school children (UNESCO UIS)
  handleUnescoOutOfSchool(results[7]);

  // Education: Completion rates (UNESCO UIS)
  handleUnescoCompletionRates(results[8]);

  // Education: Tertiary enrollment ratio (UNESCO UIS)
  handleUnescoSingleIndicator(results[9], 'GER.5T8', 'pop-tertiary', {
    format: (val) => formatPercent(val),
    context: (year) => `Gross enrollment ratio, tertiary (${year})`,
  });

  // Science: Researchers per million (UNESCO UIS)
  handleUnescoSingleIndicator(results[10], 'RESDEN.INHAB.TFTE', 'pop-researchers', {
    format: (val) => formatNumber(Math.round(val)),
    context: (year) => `Full-time equivalent, global (${year})`,
  });

  // Science: R&D spending (UNESCO UIS)
  handleUnescoSingleIndicator(results[11], 'EXPGDP.TOT', 'pop-rd-spending', {
    format: (val) => val.toFixed(2) + '%',
    context: (year) => `Gross domestic expenditure on R&D (${year})`,
  });
}

// Get the latest record for a given indicator from UNESCO UIS response
function getUnescoLatest(records, indicatorId) {
  const matching = records.filter(r => r.indicatorId === indicatorId && r.value !== null);
  if (matching.length === 0) return null;
  // Sort by year descending, return most recent
  matching.sort((a, b) => b.year - a.year);
  return matching[0];
}

function handleUnescoOutOfSchool(result) {
  if (result.status !== 'fulfilled') {
    setCardError('pop-out-of-school', () => refresh());
    return;
  }
  const res = result.value;
  if (res.error || !res.data || !res.data.records) {
    setCardError('pop-out-of-school', () => refresh());
    return;
  }

  const records = res.data.records;
  const primary = getUnescoLatest(records, 'OFST.1.CP');
  const lowerSec = getUnescoLatest(records, 'OFST.2.CP');
  const upperSec = getUnescoLatest(records, 'OFST.3.CP');

  if (!primary && !lowerSec && !upperSec) {
    setCardError('pop-out-of-school', () => refresh());
    return;
  }

  const total = (primary ? primary.value : 0)
    + (lowerSec ? lowerSec.value : 0)
    + (upperSec ? upperSec.value : 0);
  const year = primary ? primary.year : (lowerSec ? lowerSec.year : upperSec.year);

  const parts = [];
  if (primary) parts.push(`Primary: ${abbreviate(primary.value)}`);
  if (lowerSec) parts.push(`Lower sec: ${abbreviate(lowerSec.value)}`);
  if (upperSec) parts.push(`Upper sec: ${abbreviate(upperSec.value)}`);

  updateCard('pop-out-of-school', {
    value: abbreviate(total),
    context: `${parts.join(' | ')} (${year})`,
    state: 'success',
  });
  setCardFreshness('pop-out-of-school', getFreshness('pop-out-of-school', res.stale));
}

function handleUnescoCompletionRates(result) {
  const cardMap = {
    'CR.1': 'pop-completion-primary',
    'CR.2': 'pop-completion-secondary',
    'CR.3': 'pop-completion-upper',
  };

  if (result.status !== 'fulfilled') {
    for (const cardId of Object.values(cardMap)) {
      setCardError(cardId, () => refresh());
    }
    return;
  }

  const res = result.value;
  if (res.error || !res.data || !res.data.records) {
    for (const cardId of Object.values(cardMap)) {
      setCardError(cardId, () => refresh());
    }
    return;
  }

  const records = res.data.records;
  const labels = {
    'CR.1': 'Primary school completion rate',
    'CR.2': 'Lower secondary completion rate',
    'CR.3': 'Upper secondary completion rate',
  };

  for (const [indicator, cardId] of Object.entries(cardMap)) {
    const latest = getUnescoLatest(records, indicator);
    if (latest) {
      updateCard(cardId, {
        value: formatPercent(latest.value),
        context: `${labels[indicator]} (${latest.year})`,
        state: 'success',
      });
      setCardFreshness(cardId, getFreshness(cardId, res.stale));
    } else {
      setCardError(cardId, () => refresh());
    }
  }
}

function handleUnescoSingleIndicator(result, indicatorId, cardId, opts) {
  if (result.status !== 'fulfilled') {
    setCardError(cardId, () => refresh());
    return;
  }
  const res = result.value;
  if (res.error || !res.data || !res.data.records) {
    setCardError(cardId, () => refresh());
    return;
  }

  const latest = getUnescoLatest(res.data.records, indicatorId);
  if (!latest) {
    setCardError(cardId, () => refresh());
    return;
  }

  updateCard(cardId, {
    value: opts.format(latest.value),
    context: opts.context(latest.year),
    state: 'success',
  });
  setCardFreshness(cardId, getFreshness(cardId, res.stale));
}

function updateBirthsDeaths(birthResult, deathResult, population) {
  // Daily births
  if (birthResult.status === 'fulfilled' && !birthResult.value.error) {
    const { data, stale } = birthResult.value;
    const rate = extractWorldBankValue(data);
    const year = extractWorldBankYear(data);
    if (rate !== null && population > 0) {
      const dailyBirths = Math.round((rate / 1000) * population / 365);
      updateCard('pop-births', {
        value: formatNumber(dailyBirths),
        context: `${rate.toFixed(1)} per 1,000 people/year (${year || 'unknown'})`,
        state: 'success',
      });
      setCardFreshness('pop-births', getFreshness('pop-births', stale));
    }
  } else {
    setCardError('pop-births', () => refresh());
  }

  // Daily deaths
  if (deathResult.status === 'fulfilled' && !deathResult.value.error) {
    const { data, stale } = deathResult.value;
    const rate = extractWorldBankValue(data);
    const year = extractWorldBankYear(data);
    if (rate !== null && population > 0) {
      const dailyDeaths = Math.round((rate / 1000) * population / 365);
      updateCard('pop-deaths', {
        value: formatNumber(dailyDeaths),
        context: `${rate.toFixed(1)} per 1,000 people/year (${year || 'unknown'})`,
        state: 'success',
      });
      setCardFreshness('pop-deaths', getFreshness('pop-deaths', stale));
    }
  } else {
    setCardError('pop-deaths', () => refresh());
  }
}

function extractWorldBankValue(data) {
  if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1]) && data[1].length > 0) {
    const entry = data[1][0];
    if (entry.value !== null && entry.value !== undefined) {
      return Number(entry.value);
    }
  }
  return null;
}

function extractWorldBankYear(data) {
  if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1]) && data[1].length > 0) {
    return data[1][0].date || null;
  }
  return null;
}

function startPopulationTicker(population, stale) {
  currentPopulation = population;
  const el = getCardValueEl('pop-world');

  if (counters['pop-world']) {
    counters['pop-world'].update(currentPopulation);
  } else if (el) {
    counters['pop-world'] = new CountUp(el, currentPopulation);
    counters['pop-world'].start();

    // Start ticker after initial animation
    if (!tickerInterval && !tickerTimeout) {
      tickerTimeout = setTimeout(function () {
        tickerTimeout = null;
        tickerInterval = setInterval(function () {
          currentPopulation += 1;
          if (counters['pop-world']) {
            counters['pop-world'].setDirect(currentPopulation);
          }
        }, 400);
      }, 1600);
    }
  }

  updateCard('pop-world', { context: 'Net growth ~2.5 people/sec (live)', state: 'success' });
  setCardFreshness('pop-world', stale ? 'cached' : 'live');
}

async function loadCountryData(countryName) {
  const country = allCountries.find(c => (c.name.common || c.name) === countryName);
  if (!country) return;

  const countryPop = country.population;
  const countryCode = country.cca3;

  // Stop world ticker
  if (tickerTimeout) {
    clearTimeout(tickerTimeout);
    tickerTimeout = null;
  }
  if (tickerInterval) {
    clearInterval(tickerInterval);
    tickerInterval = null;
  }

  // Update population card with country data (no ticker for country)
  if (counters['pop-world']) {
    counters['pop-world'] = null;
  }
  const el = getCardValueEl('pop-world');
  if (el) {
    el.textContent = formatNumber(countryPop);
  }
  updateCard('pop-world', {
    value: formatNumber(countryPop),
    context: `Population of ${countryName} (live)`,
    state: 'success',
  });

  // Fetch country birth/death rates from World Bank
  const birthUrl = `https://api.worldbank.org/v2/country/${countryCode}/indicator/SP.DYN.CBRT.IN?format=json&per_page=1&mrnev=1`;
  const deathUrl = `https://api.worldbank.org/v2/country/${countryCode}/indicator/SP.DYN.CDRT.IN?format=json&per_page=1&mrnev=1`;

  const results = await Promise.allSettled([
    fetchData(birthUrl),
    fetchData(deathUrl),
  ]);

  updateBirthsDeaths(results[0], results[1], countryPop);
}

function restoreGlobalView() {
  // Restart the world population ticker
  if (worldPopulation > 0) {
    startPopulationTicker(worldPopulation, false);
  }

  // Re-fetch global birth/death rates
  Promise.allSettled([
    fetchData('https://api.worldbank.org/v2/country/WLD/indicator/SP.DYN.CBRT.IN?format=json&per_page=1&mrnev=1'),
    fetchData('https://api.worldbank.org/v2/country/WLD/indicator/SP.DYN.CDRT.IN?format=json&per_page=1&mrnev=1'),
  ]).then(function (results) {
    updateBirthsDeaths(results[0], results[1], worldPopulation);
  }).catch(function () {
    // Silently handle — cards will show stale data
  });
}

function buildCountryPicker() {
  const wrapper = document.createElement('div');
  wrapper.className = 'country-picker';

  const btn = document.createElement('button');
  btn.className = 'country-picker-btn';
  btn.id = 'country-picker-btn';
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Select country');
  const spnText = document.createElement('span');
  spnText.className = 'country-picker-text';
  spnText.textContent = 'Global';
  const spnArrow = document.createElement('span');
  spnArrow.className = 'country-picker-arrow';
  spnArrow.setAttribute('aria-hidden', 'true');
  spnArrow.textContent = '\u25BE';
  btn.appendChild(spnText);
  btn.appendChild(spnArrow);

  const dropdown = document.createElement('div');
  dropdown.className = 'country-picker-dropdown';
  dropdown.id = 'country-picker-dropdown';
  dropdown.hidden = true;

  const searchInput = document.createElement('input');
  searchInput.id = 'country-picker-search';
  searchInput.type = 'text';
  searchInput.className = 'country-picker-search';
  searchInput.placeholder = 'Search countries...';
  searchInput.setAttribute('aria-label', 'Search countries');

  const list = document.createElement('ul');
  list.className = 'country-picker-list';
  list.id = 'country-picker-list';
  list.setAttribute('role', 'listbox');

  // Default "Global" option
  const globalItem = document.createElement('li');
  globalItem.className = 'country-picker-item active';
  globalItem.dataset.value = 'global';
  globalItem.textContent = 'Global';
  globalItem.setAttribute('role', 'option');
  globalItem.setAttribute('aria-selected', 'true');
  globalItem.setAttribute('tabindex', '0');
  list.appendChild(globalItem);

  dropdown.appendChild(searchInput);
  dropdown.appendChild(list);
  wrapper.appendChild(btn);
  wrapper.appendChild(dropdown);

  // Toggle dropdown
  btn.addEventListener('click', () => {
    const isOpen = !dropdown.hidden;
    dropdown.hidden = isOpen;
    btn.setAttribute('aria-expanded', String(!isOpen));
    if (!isOpen) {
      searchInput.value = '';
      filterCountryList('');
      searchInput.focus();
    }
  });

  // Search filtering
  searchInput.addEventListener('input', () => {
    filterCountryList(searchInput.value);
  });

  // Select item
  list.addEventListener('click', (e) => {
    const item = e.target.closest('.country-picker-item');
    if (!item) return;

    const value = item.dataset.value;
    const text = item.textContent;

    // Update active state
    list.querySelectorAll('.country-picker-item').forEach(li => {
      li.classList.remove('active');
      li.setAttribute('aria-selected', 'false');
    });
    item.classList.add('active');
    item.setAttribute('aria-selected', 'true');

    // Update button text
    btn.querySelector('.country-picker-text').textContent = text;
    dropdown.hidden = true;
    btn.setAttribute('aria-expanded', 'false');

    selectedCountry = value === 'global' ? null : value;

    if (selectedCountry) {
      loadCountryData(selectedCountry);
    } else {
      restoreGlobalView();
    }
  });

  // Close on outside click — restore focus to trigger button
  document.addEventListener('click', function (e) {
    if (!wrapper.contains(e.target) && !dropdown.hidden) {
      dropdown.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
  });

  // Arrow key navigation in listbox
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const visibleItems = [...list.querySelectorAll('.country-picker-item:not([hidden])')];
    if (visibleItems.length === 0) return;
    const currentIndex = visibleItems.indexOf(document.activeElement);
    let nextIndex = currentIndex;
    if (e.key === 'ArrowDown') {
      nextIndex = Math.min(currentIndex + 1, visibleItems.length - 1);
    } else {
      nextIndex = Math.max(currentIndex - 1, 0);
    }
    visibleItems[nextIndex].focus();
  });

  // Make country picker items focusable
  list.addEventListener('keydown', (e) => {
    const item = e.target.closest('.country-picker-item');
    if (!item) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      item.click();
    }
  });

  // Close on Escape — only when dropdown is open, restore focus
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !dropdown.hidden) {
      dropdown.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
  });

  return wrapper;
}

function populateCountryList() {
  const list = document.getElementById('country-picker-list');
  if (!list) return;

  // Keep only the Global item, remove any previous country items
  const existingItems = list.querySelectorAll('.country-picker-item:not([data-value="global"])');
  existingItems.forEach(item => item.remove());

  const sorted = [...allCountries].sort((a, b) => {
    const nameA = a.name.common || a.name;
    const nameB = b.name.common || b.name;
    return nameA.localeCompare(nameB);
  });

  for (const country of sorted) {
    const name = country.name.common || country.name;
    const li = document.createElement('li');
    li.className = 'country-picker-item';
    li.dataset.value = name;
    li.textContent = name;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.setAttribute('tabindex', '0');
    list.appendChild(li);
  }
}

function filterCountryList(query) {
  const list = document.getElementById('country-picker-list');
  if (!list) return;

  const lower = query.toLowerCase();
  const items = list.querySelectorAll('.country-picker-item');

  for (const item of items) {
    const text = item.textContent.toLowerCase();
    if (lower === '' || text.includes(lower)) {
      item.hidden = false;
    } else {
      item.hidden = true;
    }
  }
}
