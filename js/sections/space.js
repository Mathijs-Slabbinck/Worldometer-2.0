import { fetchData } from '../utils/fetch-handler.js';
import { formatNumber, abbreviate } from '../utils/format.js';
import { nowISO, monthAgoISO, weekFromNowISO, countdown, formatUTC, relativeTime } from '../utils/time.js';
import { NASA_API_KEY } from '../config.js';
import { createCard, createSubCategory, updateCard, updateCardContext, setCardError, setCardStale, getCardValueEl } from '../utils/dom.js';
import { CountUp } from '../utils/counter.js';
import { connect as connectISS, onUpdate as onISSUpdate, setInitialState as setISSInitialState } from '../utils/iss-telemetry.js';
import { openModal } from '../utils/modal.js';

export const sectionId = 'space';

const counters = {};
let countdownInterval = null;
let launchWindowStart = null;

export async function init() {
  const grid = document.querySelector('#space .card-grid');

  // Sub-category groups
  const groups = [
    {
      title: 'ISS',
      cards: [
        { id: 'space-people', label: 'People in Space Right Now', featured: true },
        { id: 'space-iss-speed', label: 'ISS Speed' },
        { id: 'space-iss-altitude', label: 'ISS Altitude' },
        { id: 'space-iss-toilet', label: 'ISS Urine Tank Level', featured: true },
        { id: 'space-iss-use', label: 'Last Toilet Use' },
        { id: 'space-iss-flush', label: 'Last Toilet Flush' },
      ],
    },
    {
      title: 'Near-Earth Objects',
      cards: [
        { id: 'space-asteroids', label: 'Near-Earth Asteroids Today' },
      ],
    },
    {
      title: 'Launches',
      cards: [
        { id: 'space-next-launch', label: 'Next Launch', featured: true },
      ],
    },
    {
      title: 'Solar Activity',
      cards: [
        { id: 'space-solar-flares', label: 'Solar Flares This Month' },
      ],
    },
  ];

  for (const group of groups) {
    grid.appendChild(createSubCategory(group.title));
    for (const cfg of group.cards) {
      grid.appendChild(createCard(cfg));
    }
  }

  // Start ISS live telemetry (Lightstreamer)
  initISSToilet();

  await refresh();
}

export async function refresh() {
  const today = nowISO();
  const weekAhead = weekFromNowISO();
  const monthAgo = monthAgoISO();

  const results = await Promise.allSettled([
    fetchData('https://ll.thespacedevs.com/2.2.0/astronaut/?in_space=true&limit=50', { retries: 0 }),
    Promise.resolve({ data: null, static: true }), // ISS has constant orbital params
    fetchData(`https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${NASA_API_KEY}`, { retries: 0 }),
    fetchData('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=1&mode=detailed', { retries: 0 }),
    fetchData(`https://api.nasa.gov/DONKI/FLR?startDate=${monthAgo}&endDate=${today}&api_key=${NASA_API_KEY}`, { retries: 0 }),
  ]);

  // People in space
  handleResult(results[0], (res) => {
    const { data, stale } = res;
    if (!data) return false;
    // Support both open-notify format and SpaceDevs format
    const count = data.number ?? data.count;
    const people = data.people || (data.results || []).map(a => ({ name: a.name, craft: a.last_flight || '' }));

    if (counters['space-people']) {
      counters['space-people'].update(count);
    } else {
      const el = getCardValueEl('space-people');
      if (el) {
        counters['space-people'] = new CountUp(el, count);
        counters['space-people'].start();
      }
    }

    // Build clickable astronaut names
    const spnNames = document.createElement('span');
    spnNames.className = 'astronaut-names';
    for (let i = 0; i < people.length; i++) {
      const person = people[i];
      const btnAstronaut = document.createElement('button');
      btnAstronaut.type = 'button';
      btnAstronaut.className = 'astronaut-link';
      btnAstronaut.textContent = person.name;
      btnAstronaut.addEventListener('click', function () {
        showAstronautModal(person.name);
      });
      spnNames.appendChild(btnAstronaut);
      if (i < people.length - 1) {
        spnNames.appendChild(document.createTextNode(', '));
      }
    }

    updateCard('space-people', { state: stale ? 'stale' : 'success' });
    updateCardContext('space-people', spnNames);
    if (stale) setCardStale('space-people');
    return true;
  }, 'space-people');

  // ISS orbital parameters (constant values — ISS orbit is very stable)
  updateCard('space-iss-speed', { value: '~27,600 km/h', context: 'Orbital velocity (constant)', state: 'success' });
  updateCard('space-iss-altitude', { value: '~408 km', context: 'Low Earth orbit', state: 'success' });

  // Asteroids
  handleResult(results[2], (res) => {
    const { data, stale } = res;
    if (!data) return false;
    const count = data.element_count;
    let closestName = '';
    let closestDist = Infinity;

    const days = data.near_earth_objects;
    for (const date in days) {
      for (const neo of days[date]) {
        if (neo.close_approach_data && neo.close_approach_data.length > 0) {
          const dist = parseFloat(neo.close_approach_data[0].miss_distance.kilometers);
          if (dist < closestDist) {
            closestDist = dist;
            closestName = neo.name;
          }
        }
      }
    }

    if (counters['space-asteroids']) {
      counters['space-asteroids'].update(count);
    } else {
      const el = getCardValueEl('space-asteroids');
      if (el) {
        counters['space-asteroids'] = new CountUp(el, count);
        counters['space-asteroids'].start();
      }
    }

    const ctx = closestName ? `Closest: ${closestName} (${abbreviate(closestDist)} km)` : '';
    updateCard('space-asteroids', { context: ctx, state: stale ? 'stale' : 'success' });
    if (stale) setCardStale('space-asteroids');
    return true;
  }, 'space-asteroids');

  // Next launch
  handleResult(results[3], (res) => {
    const { data, stale } = res;
    if (!data || !data.results || data.results.length === 0) return false;
    const launch = data.results[0];
    launchWindowStart = launch.window_start || launch.net;
    const missionName = launch.name || 'Unknown mission';
    const provider = launch.launch_service_provider ? launch.launch_service_provider.name : '';

    // Build context with mission info + external link
    const ctxEl = document.createElement('span');
    const infoText = provider ? `${missionName} | ${provider}` : missionName;
    ctxEl.appendChild(document.createTextNode(infoText));

    // Find the best external URL from the API response
    const launchUrl = getLaunchUrl(launch);
    if (launchUrl) {
      ctxEl.appendChild(document.createTextNode(' '));
      const link = document.createElement('a');
      link.href = launchUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Details \u2192';
      link.className = 'launch-link';
      link.setAttribute('aria-label', `Details for ${missionName}`);
      ctxEl.appendChild(link);
    }

    startCountdown();
    updateCard('space-next-launch', { state: stale ? 'stale' : 'success' });
    updateCardContext('space-next-launch', ctxEl);
    if (stale) setCardStale('space-next-launch');
    return true;
  }, 'space-next-launch');

  // Solar flares
  handleResult(results[4], (res) => {
    const { data, stale } = res;
    if (!data) return false;
    const flares = Array.isArray(data) ? data : [];
    const count = flares.length;

    if (counters['space-solar-flares']) {
      counters['space-solar-flares'].update(count);
    } else {
      const el = getCardValueEl('space-solar-flares');
      if (el) {
        counters['space-solar-flares'] = new CountUp(el, count);
        counters['space-solar-flares'].start();
      }
    }

    const latest = flares.length > 0 ? flares[flares.length - 1].classType : 'None';
    updateCard('space-solar-flares', { context: `Latest: ${latest}`, state: stale ? 'stale' : 'success' });
    if (stale) setCardStale('space-solar-flares');

    // Build expandable flare list
    buildFlareList(flares);

    return true;
  }, 'space-solar-flares');
}

function getLaunchUrl(launch) {
  // Prefer info URLs, then video URLs, then the SpaceDevs slug-based page
  if (launch.infoURLs && launch.infoURLs.length > 0) {
    return launch.infoURLs[0].url || launch.infoURLs[0];
  }
  if (launch.vidURLs && launch.vidURLs.length > 0) {
    return launch.vidURLs[0].url || launch.vidURLs[0];
  }
  if (launch.slug) {
    return `https://spacelaunchnow.me/launch/${launch.slug}`;
  }
  return null;
}

function handleResult(result, onSuccess, errorCardId) {
  if (result.status === 'fulfilled') {
    const res = result.value;
    if (res.error) {
      setCardError(errorCardId, () => refresh());
      return;
    }
    const ok = onSuccess(res);
    if (!ok) {
      setCardError(errorCardId, () => refresh());
    }
  } else {
    setCardError(errorCardId, () => refresh());
  }
}

function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);

  function tick() {
    if (!launchWindowStart) return;
    const cd = countdown(launchWindowStart);
    const valEl = getCardValueEl('space-next-launch');
    if (!valEl) return;

    if (cd.expired) {
      valEl.textContent = 'LAUNCHING NOW';
      valEl.classList.add('updating');
      return;
    }

    valEl.textContent = `${cd.days}d ${cd.hours}h ${cd.minutes}m ${cd.seconds}s`;
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

// Astronaut detail modal via Wikipedia API
async function showAstronautModal(name) {
  // Show loading state immediately
  const loadingBody = document.createElement('p');
  loadingBody.className = 'modal-description';
  loadingBody.textContent = 'Loading details...';
  openModal({ title: name, body: loadingBody });

  const wikiName = name.replace(/ /g, '_');
  let wikiData = await fetchWikiSummary(wikiName);

  // If the result doesn't look astronaut-related, try "Name_(astronaut)" variant
  const spaceKeywords = /astronaut|cosmonaut|taikonaut|space|nasa|esa|roscosmos|jaxa|cnsa/i;
  if (wikiData && !spaceKeywords.test((wikiData.description || '') + ' ' + (wikiData.extract || ''))) {
    const altData = await fetchWikiSummary(wikiName + '_(astronaut)');
    if (altData) {
      wikiData = altData;
    }
  }

  let image = null;
  const bodyEl = document.createDocumentFragment();

  if (wikiData && wikiData.type !== 'disambiguation') {
    if (wikiData.description) {
      const desc = document.createElement('p');
      desc.className = 'modal-description';
      desc.textContent = wikiData.description;
      bodyEl.appendChild(desc);
    }

    if (wikiData.extract) {
      const extract = document.createElement('p');
      extract.textContent = wikiData.extract;
      bodyEl.appendChild(extract);
    }

    if (wikiData.thumbnail && wikiData.thumbnail.source) {
      image = { src: wikiData.thumbnail.source, alt: name };
    }

    const wikiUrl = wikiData.content_urls && wikiData.content_urls.desktop
      ? wikiData.content_urls.desktop.page
      : `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiName)}`;
    const linkP = document.createElement('p');
    linkP.className = 'modal-link-row';
    const link = document.createElement('a');
    link.href = wikiUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View full Wikipedia article \u2192';
    link.setAttribute('aria-label', 'View full Wikipedia article (opens in new tab)');
    linkP.appendChild(link);
    bodyEl.appendChild(linkP);
  } else {
    const noInfo = document.createElement('p');
    noInfo.textContent = 'No detailed information found on Wikipedia.';
    bodyEl.appendChild(noInfo);

    const searchP = document.createElement('p');
    const searchLink = document.createElement('a');
    searchLink.href = `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(name)}`;
    searchLink.target = '_blank';
    searchLink.rel = 'noopener noreferrer';
    searchLink.textContent = `Search Wikipedia for ${name} \u2192`;
    searchLink.setAttribute('aria-label', `Search Wikipedia for ${name} (opens in new tab)`);
    searchP.appendChild(searchLink);
    bodyEl.appendChild(searchP);
  }

  // Wrap fragment in a div so it can be passed as a Node
  const bodyDiv = document.createElement('div');
  bodyDiv.appendChild(bodyEl);

  openModal({ title: name, body: bodyDiv, image: image });
}

async function fetchWikiSummary(pageName) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageName)}`;
  try {
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data.type !== 'disambiguation') {
        return data;
      }
    }
  } catch (err) {
    // Wikipedia fetch failed — return null
  }
  return null;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Solar flare expandable list
function buildFlareList(flares) {
  const card = document.getElementById('space-solar-flares');
  if (!card) return;

  // Remove any existing expandable list
  const existing = card.querySelector('.expandable-list');
  if (existing) {
    existing.remove();
  }

  if (flares.length === 0) return;

  // Sort flares newest first
  const sorted = [...flares].reverse();

  const divList = document.createElement('div');
  divList.className = 'expandable-list';

  // Toggle button
  const btnToggle = document.createElement('button');
  btnToggle.className = 'expandable-toggle';
  btnToggle.setAttribute('type', 'button');
  btnToggle.setAttribute('aria-expanded', 'false');
  btnToggle.setAttribute('aria-controls', 'flare-panel');

  const spnToggleText = document.createElement('span');
  spnToggleText.textContent = 'View all flares';

  const spnToggleArrow = document.createElement('span');
  spnToggleArrow.className = 'expandable-toggle-arrow';
  spnToggleArrow.textContent = '\u25BC';
  spnToggleArrow.setAttribute('aria-hidden', 'true');

  btnToggle.appendChild(spnToggleText);
  btnToggle.appendChild(spnToggleArrow);

  // Panel
  const divPanel = document.createElement('div');
  divPanel.className = 'expandable-panel';
  divPanel.id = 'flare-panel';
  divPanel.setAttribute('aria-label', 'Solar flare list');

  // Search input
  const inpSearch = document.createElement('input');
  inpSearch.className = 'expandable-search';
  inpSearch.setAttribute('type', 'text');
  inpSearch.setAttribute('placeholder', 'Search flares (e.g. X1, M2)...');
  inpSearch.setAttribute('autocomplete', 'off');
  inpSearch.setAttribute('aria-label', 'Search solar flares');

  // Items list
  const ulItems = document.createElement('ul');
  ulItems.className = 'expandable-items';
  ulItems.setAttribute('role', 'list');

  divPanel.appendChild(inpSearch);
  divPanel.appendChild(ulItems);

  divList.appendChild(btnToggle);
  divList.appendChild(divPanel);
  card.appendChild(divList);

  // Render flare items
  function renderItems(filter) {
    ulItems.replaceChildren();
    const query = (filter || '').trim().toLowerCase();
    let filtered = sorted;

    if (query) {
      filtered = sorted.filter(function (flare) {
        const classType = (flare.classType || '').toLowerCase();
        const date = (flare.beginTime || '').toLowerCase();
        const region = String(flare.activeRegionNum || '').toLowerCase();
        return classType.includes(query) || date.includes(query) || region.includes(query);
      });
    }

    if (filtered.length === 0) {
      const liEmpty = document.createElement('li');
      liEmpty.className = 'expandable-empty';
      liEmpty.textContent = 'No matching flares';
      ulItems.appendChild(liEmpty);
      return;
    }

    for (let i = 0; i < filtered.length; i++) {
      const flare = filtered[i];
      const liItem = document.createElement('li');
      liItem.className = 'expandable-item';

      const spnClass = document.createElement('span');
      spnClass.className = 'expandable-item-label ' + getFlareColorClass(flare.classType);
      spnClass.textContent = flare.classType || 'Unknown';

      const spnDate = document.createElement('span');
      spnDate.className = 'expandable-item-meta';
      spnDate.textContent = formatFlareDate(flare.beginTime);

      liItem.appendChild(spnClass);
      liItem.appendChild(spnDate);
      liItem.setAttribute('tabindex', '0');
      liItem.setAttribute('aria-label', `Solar flare ${flare.classType || 'Unknown'} on ${formatFlareDate(flare.beginTime)}`);

      liItem.addEventListener('click', function () {
        showFlareModal(flare);
      });
      liItem.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showFlareModal(flare);
        }
      });

      ulItems.appendChild(liItem);
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
      spnToggleText.textContent = 'Hide flares';
      renderItems('');
    } else {
      divPanel.classList.remove('open');
      spnToggleArrow.classList.remove('open');
      spnToggleText.textContent = 'View all flares';
      inpSearch.value = '';
    }
  });

  // Search handler
  inpSearch.addEventListener('input', function () {
    renderItems(inpSearch.value);
  });
}

function getFlareColorClass(classType) {
  if (!classType) return '';
  const letter = classType.charAt(0).toUpperCase();
  if (letter === 'X') return 'flare-class-x';
  if (letter === 'M') return 'flare-class-m';
  if (letter === 'C') return 'flare-class-c';
  if (letter === 'B') return 'flare-class-b';
  return '';
}

function formatFlareDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

// Solar flare detail modal
function showFlareModal(flare) {
  const bodyDiv = document.createElement('div');

  // Flare class badge
  const colorClass = getFlareColorClass(flare.classType);
  const classEl = document.createElement('p');
  classEl.className = 'modal-flare-class';
  const classSpan = document.createElement('span');
  classSpan.className = colorClass;
  classSpan.textContent = flare.classType || 'Unknown';
  classEl.appendChild(classSpan);
  bodyDiv.appendChild(classEl);

  // Time details grid
  const grid = document.createElement('div');
  grid.className = 'modal-detail-grid';

  function addGridRow(label, value) {
    const lblEl = document.createElement('span');
    lblEl.className = 'modal-detail-label';
    lblEl.textContent = label;
    const valEl = document.createElement('span');
    valEl.className = 'modal-detail-value';
    valEl.textContent = value;
    grid.appendChild(lblEl);
    grid.appendChild(valEl);
  }

  if (flare.beginTime) addGridRow('Start', formatUTC(flare.beginTime));
  if (flare.peakTime) addGridRow('Peak', formatUTC(flare.peakTime));
  if (flare.endTime) addGridRow('End', formatUTC(flare.endTime));
  bodyDiv.appendChild(grid);

  // Active region and source location
  if (flare.activeRegionNum) {
    const regionP = document.createElement('p');
    const regionLabel = document.createElement('span');
    regionLabel.className = 'modal-section-label';
    regionLabel.textContent = 'Active Region: ';
    regionP.appendChild(regionLabel);
    regionP.appendChild(document.createTextNode('AR ' + String(flare.activeRegionNum)));
    bodyDiv.appendChild(regionP);
  }
  if (flare.sourceLocation) {
    const srcP = document.createElement('p');
    const srcLabel = document.createElement('span');
    srcLabel.className = 'modal-section-label';
    srcLabel.textContent = 'Source Location: ';
    srcP.appendChild(srcLabel);
    srcP.appendChild(document.createTextNode(flare.sourceLocation));
    bodyDiv.appendChild(srcP);
  }

  // Linked events
  if (flare.linkedEvents && flare.linkedEvents.length > 0) {
    const evtLabel = document.createElement('p');
    evtLabel.className = 'modal-section-label modal-spaced';
    evtLabel.textContent = 'Linked Events:';
    bodyDiv.appendChild(evtLabel);

    const evtList = document.createElement('ul');
    evtList.className = 'modal-linked-list';
    for (const evt of flare.linkedEvents) {
      const li = document.createElement('li');
      li.textContent = evt.activityID || 'Unknown event';
      evtList.appendChild(li);
    }
    bodyDiv.appendChild(evtList);
  }

  // Instruments
  if (flare.instruments && flare.instruments.length > 0) {
    const names = flare.instruments.map(function (inst) {
      return inst.displayName || inst.id || 'Unknown';
    });
    const instP = document.createElement('p');
    instP.className = 'modal-spaced';
    const instLabel = document.createElement('span');
    instLabel.className = 'modal-section-label';
    instLabel.textContent = 'Instruments: ';
    instP.appendChild(instLabel);
    instP.appendChild(document.createTextNode(names.join(', ')));
    bodyDiv.appendChild(instP);
  }

  // NASA DONKI link
  if (flare.link) {
    const linkP = document.createElement('p');
    linkP.className = 'modal-link-row';
    const link = document.createElement('a');
    link.href = flare.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View on NASA DONKI \u2192';
    link.setAttribute('aria-label', `View solar flare ${flare.classType || ''} on NASA DONKI (opens in new tab)`);
    linkP.appendChild(link);
    bodyDiv.appendChild(linkP);
  }

  const title = `Solar Flare ${flare.classType || ''}`;
  openModal({ title: title.trim(), body: bodyDiv });
}

// Load persisted toilet data from TOILET_DATA.md
async function loadPersistedToiletData() {
  try {
    const res = await fetch('./TOILET_DATA.md');
    if (!res.ok) return null;
    const text = await res.text();

    const get = (key) => {
      const match = text.match(new RegExp(`<!-- ${key}: (.+?) -->`));
      if (!match) return null;
      const val = match[1].trim();
      return val === 'null' ? null : val;
    };

    return {
      tankLevel: get('TANK_LEVEL') !== null ? parseFloat(get('TANK_LEVEL')) : null,
      lastUse: get('LAST_USE'),
      lastFlush: get('LAST_FLUSH'),
    };
  } catch {
    return null;
  }
}

// ISS Toilet telemetry via NASA Lightstreamer
async function initISSToilet() {
  updateCard('space-iss-toilet', { value: 'Connecting...', context: 'Live telemetry from ISS via Lightstreamer', state: 'loading' });
  updateCard('space-iss-flush', { value: 'Waiting...', context: 'Detected by tank level drop >3%', state: 'loading' });
  updateCard('space-iss-use', { value: 'Waiting...', context: 'Detected by tank level increase', state: 'loading' });

  // Load persisted data so cards show last known events immediately
  const persisted = await loadPersistedToiletData();
  if (persisted) {
    setISSInitialState({
      lastUseTime: persisted.lastUse,
      lastFlushTime: persisted.lastFlush,
      tankLevel: persisted.tankLevel,
    });

    if (persisted.lastUse) {
      updateCard('space-iss-use', {
        value: relativeTime(persisted.lastUse),
        context: 'From telemetry log',
        state: 'success',
      });
    }
    if (persisted.lastFlush) {
      updateCard('space-iss-flush', {
        value: relativeTime(persisted.lastFlush),
        context: 'From telemetry log',
        state: 'success',
      });
    }
  }

  try {
    connectISS();
  } catch (err) {
    console.error('Failed to connect ISS telemetry:', err);
    setCardError('space-iss-toilet', () => initISSToilet());
    setCardError('space-iss-flush', () => initISSToilet());
    setCardError('space-iss-use', () => initISSToilet());
    return;
  }

  onISSUpdate((state) => {
    // Urine tank level
    if (state.urineTankPercent !== null) {
      const pct = parseFloat(state.urineTankPercent);
      const signalNote = state.hasSignal ? 'Live signal' : 'No signal (LOS)';
      const connNote = state.connected ? signalNote : 'Disconnected';
      updateCard('space-iss-toilet', {
        value: pct.toFixed(1) + '%',
        context: `${connNote} | Real-time ISS WHC telemetry`,
        state: 'success',
      });
    }

    // Last flush
    if (state.lastFlushTime) {
      updateCard('space-iss-flush', {
        value: relativeTime(state.lastFlushTime),
        context: 'Tank level dropped >3%',
        state: 'success',
      });
    } else {
      updateCard('space-iss-flush', {
        value: 'No flush detected yet',
        context: 'Monitoring for tank level drops',
        state: 'success',
      });
    }

    // Last use
    if (state.lastUseTime) {
      updateCard('space-iss-use', {
        value: relativeTime(state.lastUseTime),
        context: 'Tank level increased',
        state: 'success',
      });
    } else {
      updateCard('space-iss-use', {
        value: 'No use detected yet',
        context: 'Monitoring for tank level increases',
        state: 'success',
      });
    }
  });
}
