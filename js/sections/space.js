import { fetchData } from '../utils/fetch-handler.js';
import { formatNumber, abbreviate } from '../utils/format.js';
import { nowISO, monthAgoISO, weekFromNowISO, countdown, formatUTC, relativeTime } from '../utils/time.js';
import { NASA_API_KEY } from '../config.js';
import { createCard, createSubCategory, updateCard, updateCardContext, setCardError, setCardStale, getCardValueEl } from '../utils/dom.js';
import { CountUp } from '../utils/counter.js';
import { connect as connectISS, onUpdate as onISSUpdate, setInitialState as setISSInitialState } from '../utils/iss-telemetry.js';
import { openModal } from '../utils/modal.js';

export const sectionId = 'space';

let counters = {};
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
      const anc = document.createElement('a');
      anc.className = 'astronaut-link';
      anc.textContent = person.name;
      anc.setAttribute('role', 'button');
      anc.setAttribute('tabindex', '0');
      anc.addEventListener('click', function (e) {
        e.preventDefault();
        showAstronautModal(person.name);
      });
      anc.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showAstronautModal(person.name);
        }
      });
      spnNames.appendChild(anc);
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
  openModal({
    title: name,
    body: '<p style="color:var(--text-muted);">Loading details...</p>',
  });

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
  let bodyHtml = '';

  if (wikiData && wikiData.type !== 'disambiguation') {
    // Description line (e.g. "American astronaut")
    if (wikiData.description) {
      bodyHtml += `<p style="color:var(--text-muted);font-style:italic;margin-bottom:0.75rem;">${escapeHtml(wikiData.description)}</p>`;
    }

    // Extract (summary paragraph)
    if (wikiData.extract) {
      bodyHtml += `<p>${escapeHtml(wikiData.extract)}</p>`;
    }

    // Thumbnail
    if (wikiData.thumbnail && wikiData.thumbnail.source) {
      image = {
        src: wikiData.thumbnail.source,
        alt: name,
      };
    }

    // Wikipedia link
    const wikiUrl = wikiData.content_urls && wikiData.content_urls.desktop
      ? wikiData.content_urls.desktop.page
      : `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiName)}`;
    bodyHtml += `<p style="margin-top:1rem;"><a href="${escapeHtml(wikiUrl)}" target="_blank" rel="noopener noreferrer">View full Wikipedia article &rarr;</a></p>`;
  } else {
    // No Wikipedia data — provide a search link
    const searchUrl = `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(name)}`;
    bodyHtml += `<p>No detailed information found on Wikipedia.</p>`;
    bodyHtml += `<p><a href="${searchUrl}" target="_blank" rel="noopener noreferrer">Search Wikipedia for ${escapeHtml(name)} &rarr;</a></p>`;
  }

  openModal({
    title: name,
    body: bodyHtml,
    image: image,
  });
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
    ulItems.innerHTML = '';
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
      liItem.setAttribute('role', 'button');

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
  let bodyHtml = '';

  // Flare class badge
  const colorClass = getFlareColorClass(flare.classType);
  bodyHtml += `<p style="margin-bottom:0.75rem;">`;
  bodyHtml += `<span class="${escapeHtml(colorClass)}" style="font-family:var(--font-mono);font-size:1.5rem;font-weight:700;">`;
  bodyHtml += `${escapeHtml(flare.classType || 'Unknown')}</span>`;
  bodyHtml += `</p>`;

  // Time details
  bodyHtml += `<div style="display:grid;grid-template-columns:auto 1fr;gap:0.3rem 1rem;font-size:0.85rem;margin-bottom:1rem;">`;

  if (flare.beginTime) {
    bodyHtml += `<span style="color:var(--text-muted);">Start</span>`;
    bodyHtml += `<span style="font-family:var(--font-mono);">${escapeHtml(formatUTC(flare.beginTime))}</span>`;
  }
  if (flare.peakTime) {
    bodyHtml += `<span style="color:var(--text-muted);">Peak</span>`;
    bodyHtml += `<span style="font-family:var(--font-mono);">${escapeHtml(formatUTC(flare.peakTime))}</span>`;
  }
  if (flare.endTime) {
    bodyHtml += `<span style="color:var(--text-muted);">End</span>`;
    bodyHtml += `<span style="font-family:var(--font-mono);">${escapeHtml(formatUTC(flare.endTime))}</span>`;
  }

  bodyHtml += `</div>`;

  // Active region and source location
  if (flare.activeRegionNum) {
    bodyHtml += `<p><span style="color:var(--text-muted);">Active Region:</span> AR ${escapeHtml(String(flare.activeRegionNum))}</p>`;
  }
  if (flare.sourceLocation) {
    bodyHtml += `<p><span style="color:var(--text-muted);">Source Location:</span> ${escapeHtml(flare.sourceLocation)}</p>`;
  }

  // Linked events
  if (flare.linkedEvents && flare.linkedEvents.length > 0) {
    bodyHtml += `<p style="color:var(--text-muted);margin-top:0.75rem;">Linked Events:</p>`;
    bodyHtml += `<ul style="margin:0.25rem 0 0 1rem;padding:0;font-size:0.8rem;">`;
    for (let i = 0; i < flare.linkedEvents.length; i++) {
      const evt = flare.linkedEvents[i];
      bodyHtml += `<li style="color:var(--text-secondary);margin-bottom:0.25rem;">${escapeHtml(evt.activityID || 'Unknown event')}</li>`;
    }
    bodyHtml += `</ul>`;
  }

  // Instruments
  if (flare.instruments && flare.instruments.length > 0) {
    const names = flare.instruments.map(function (inst) {
      return inst.displayName || inst.id || 'Unknown';
    });
    bodyHtml += `<p style="margin-top:0.75rem;"><span style="color:var(--text-muted);">Instruments:</span> ${escapeHtml(names.join(', '))}</p>`;
  }

  // NASA DONKI link
  if (flare.link) {
    bodyHtml += `<p style="margin-top:1rem;"><a href="${escapeHtml(flare.link)}" target="_blank" rel="noopener noreferrer" aria-label="View solar flare ${escapeHtml(flare.classType || '')} on NASA DONKI (opens in new tab)">View on NASA DONKI &rarr;</a></p>`;
  }

  const title = `Solar Flare ${flare.classType || ''}`;

  openModal({
    title: title.trim(),
    body: bodyHtml,
  });
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
