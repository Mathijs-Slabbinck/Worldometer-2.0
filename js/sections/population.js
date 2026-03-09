import { fetchData } from '../utils/fetch-handler.js';
import { formatNumber, abbreviate } from '../utils/format.js';
import { createCard, updateCard, setCardError, setCardStale, getCardValueEl } from '../utils/dom.js';
import { CountUp } from '../utils/counter.js';

export const sectionId = 'population';

let counters = {};
let tickerInterval = null;
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
    { id: 'pop-most-populous', label: 'Most Populous Country' },
    { id: 'pop-dense', label: 'Most Densely Populated Country' },
    { id: 'pop-largest', label: 'Largest Country by Area' },
  ];

  for (const cfg of cards) {
    grid.appendChild(createCard(cfg));
  }

  await refresh();
}

export async function refresh() {
  const results = await Promise.allSettled([
    fetchData('https://api.worldbank.org/v2/country/WLD/indicator/SP.POP.TOTL?format=json&per_page=1&mrnev=1'),
    fetchData('https://restcountries.com/v3.1/all?fields=name,population,region,area,cca3'),
    fetchData('https://api.worldbank.org/v2/country/WLD/indicator/SP.DYN.CBRT.IN?format=json&per_page=1&mrnev=1'),
    fetchData('https://api.worldbank.org/v2/country/WLD/indicator/SP.DYN.CDRT.IN?format=json&per_page=1&mrnev=1'),
  ]);

  // World population from World Bank
  if (results[0].status === 'fulfilled' && !results[0].value.error) {
    const { data, stale } = results[0].value;
    const pop = extractWorldBankValue(data);
    if (pop !== null) {
      worldPopulation = pop;

      // Only update the ticker if viewing Global
      if (!selectedCountry) {
        startPopulationTicker(worldPopulation, stale);
      }
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
      updateCard('pop-countries', {
        value: String(count),
        context: 'Sovereign states and territories',
        state: stale ? 'stale' : 'success',
      });

      // Most populous (always global)
      const sorted = [...data].sort((a, b) => (b.population || 0) - (a.population || 0));
      if (sorted.length > 0) {
        const top = sorted[0];
        const name = top.name.common || top.name;
        updateCard('pop-most-populous', {
          value: name,
          context: `Population: ${formatNumber(top.population)}`,
          state: stale ? 'stale' : 'success',
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
        updateCard('pop-dense', {
          value: top.name,
          context: `${formatNumber(Math.round(top.density))} people/km\u00B2`,
          state: stale ? 'stale' : 'success',
        });
      }

      // Largest by area
      const byArea = [...data].sort((a, b) => (b.area || 0) - (a.area || 0));
      if (byArea.length > 0) {
        const top = byArea[0];
        const name = top.name.common || top.name;
        updateCard('pop-largest', {
          value: name,
          context: `Area: ${formatNumber(top.area)} km\u00B2`,
          state: stale ? 'stale' : 'success',
        });
      }

      if (stale) {
        setCardStale('pop-countries');
        setCardStale('pop-most-populous');
        setCardStale('pop-dense');
        setCardStale('pop-largest');
      }
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
}

function updateBirthsDeaths(birthResult, deathResult, population) {
  // Daily births
  if (birthResult.status === 'fulfilled' && !birthResult.value.error) {
    const { data, stale } = birthResult.value;
    const rate = extractWorldBankValue(data);
    if (rate !== null && population > 0) {
      const dailyBirths = Math.round((rate / 1000) * population / 365);
      updateCard('pop-births', {
        value: formatNumber(dailyBirths),
        context: `${rate.toFixed(1)} per 1,000 people/year`,
        state: stale ? 'stale' : 'success',
      });
      if (stale) setCardStale('pop-births');
    }
  } else {
    setCardError('pop-births', () => refresh());
  }

  // Daily deaths
  if (deathResult.status === 'fulfilled' && !deathResult.value.error) {
    const { data, stale } = deathResult.value;
    const rate = extractWorldBankValue(data);
    if (rate !== null && population > 0) {
      const dailyDeaths = Math.round((rate / 1000) * population / 365);
      updateCard('pop-deaths', {
        value: formatNumber(dailyDeaths),
        context: `${rate.toFixed(1)} per 1,000 people/year`,
        state: stale ? 'stale' : 'success',
      });
      if (stale) setCardStale('pop-deaths');
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

function startPopulationTicker(population, stale) {
  currentPopulation = population;
  const el = getCardValueEl('pop-world');

  if (counters['pop-world']) {
    counters['pop-world'].update(currentPopulation);
  } else if (el) {
    counters['pop-world'] = new CountUp(el, currentPopulation);
    counters['pop-world'].start();

    // Start ticker after initial animation
    if (!tickerInterval) {
      setTimeout(() => {
        tickerInterval = setInterval(() => {
          currentPopulation += 1;
          if (counters['pop-world']) {
            counters['pop-world'].setDirect(currentPopulation);
          }
        }, 400);
      }, 1600);
    }
  }

  updateCard('pop-world', { context: 'Net growth ~2.5 people/second', state: stale ? 'stale' : 'success' });
  if (stale) setCardStale('pop-world');
}

async function loadCountryData(countryName) {
  const country = allCountries.find(c => (c.name.common || c.name) === countryName);
  if (!country) return;

  const countryPop = country.population;
  const countryCode = country.cca3;

  // Stop world ticker
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
    context: `Population of ${countryName}`,
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
  ]).then(results => {
    updateBirthsDeaths(results[0], results[1], worldPopulation);
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
  btn.innerHTML = '<span class="country-picker-text">Global</span><span class="country-picker-arrow" aria-hidden="true">&#9662;</span>';

  const dropdown = document.createElement('div');
  dropdown.className = 'country-picker-dropdown';
  dropdown.id = 'country-picker-dropdown';
  dropdown.hidden = true;

  const searchInput = document.createElement('input');
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

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      dropdown.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
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
