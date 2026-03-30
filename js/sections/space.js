"use strict";
import { fetchData } from '../utils/fetch-handler.js';
import { formatNumber, abbreviate } from '../utils/format.js';
import { nowISO, monthAgoISO, weekFromNowISO, countdown, formatUTC, relativeTime, reverseDateStr } from '../utils/time.js';
import { NASA_API_KEY } from '../config.js';
import { createCard, createSubCategory, updateCard, updateCardContext, setCardError, setCardFreshness, getCardValueEl } from '../utils/dom.js';
import { getFreshness } from '../utils/freshness.js';
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
        { id: 'space-iss-position', label: 'ISS Position' },
        { id: 'space-iss-altitude', label: 'ISS Altitude' },
        { id: 'space-iss-speed', label: 'ISS Speed' },
        { id: 'space-iss-toilet', label: 'ISS Urine Tank Level', featured: true },
        { id: 'space-iss-flush', label: 'Last ISS Toilet Flush' },
      ],
    },
    {
      title: 'Near-Earth Objects',
      cards: [
        { id: 'space-asteroids', label: 'Near-Earth Asteroids Today' },
        { id: 'space-hazardous', label: 'Potentially Hazardous' },
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
    {
      title: 'Satellites',
      cards: [
        { id: 'space-satellites', label: 'Satellites in Orbit' },
        { id: 'space-sat-launched', label: 'Total Objects Launched' },
        { id: 'space-sat-decayed', label: 'Decommissioned / Decayed' },
        { id: 'space-sat-failures', label: 'Launch Failures' },
      ],
    },
    {
      title: 'Starlink',
      cards: [
        { id: 'space-starlink', label: 'Starlink Constellation' },
        { id: 'space-starlink-total', label: 'Total Starlink Launched' },
        { id: 'space-starlink-decayed', label: 'Starlink Decommissioned' },
        { id: 'space-starlink-failures', label: 'Starlink Launch Failures' },
      ],
    },
    {
      title: 'Rocket Bodies',
      cards: [
        { id: 'space-rocket-bodies', label: 'Rocket Bodies in Orbit' },
      ],
    },
    {
      title: 'Debris',
      cards: [
        { id: 'space-debris', label: 'Debris Objects in Orbit' },
      ],
    },
    {
      title: 'Unknown Objects',
      cards: [
        { id: 'space-unknown', label: 'Unknown Objects in Orbit' },
      ],
    },
    {
      title: 'Picture of the Day',
      cards: [
        { id: 'space-apod', label: 'NASA Astronomy Picture of the Day', featured: true },
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
  initISSToilet().catch(function (err) {
    console.error('[space] ISS toilet init failed:', err);
  });

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
    fetchData('https://api.wheretheiss.at/v1/satellites/25544', { retries: 0, timeout: 5000 }),
    fetchData(`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`, { retries: 0 }),
    fetchData('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json', { retries: 0, timeout: 15000 }),
    fetchData('https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json', { retries: 0, timeout: 15000 }),
    fetchData('data/satellite-stats.json', { retries: 0, timeout: 5000 }),
  ]);

  // People in space
  handleResult(results[0], (res) => {
    const { data, stale } = res;
    if (!data) return false;
    // Support both open-notify format and SpaceDevs format
    const count = data.number ?? data.count;
    const people = data.people || (data.results || []).map(a => {
      // Extract current spacecraft + destination from landings array
      const info = extractCurrentCraft(a);
      return { name: a.name, craft: info.craft, destination: info.destination, mission: info.mission };
    });

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
        showAstronautModal(person.name, person);
      });
      spnNames.appendChild(btnAstronaut);
      if (i < people.length - 1) {
        spnNames.appendChild(document.createTextNode(', '));
      }
    }
    spnNames.appendChild(document.createTextNode(' (live)'));

    updateCard('space-people', { state: 'success' });
    updateCardContext('space-people', spnNames);
    setCardFreshness('space-people', getFreshness('space-people', stale));
    return true;
  }, 'space-people');

  // ISS speed + altitude are now sourced from the wheretheiss.at API (results[5])
  // Fallback to static values if the API call failed
  if (results[5].status !== 'fulfilled' || results[5].value.error || !results[5].value.data) {
    updateCard('space-iss-speed', { value: '~27,600 km/h', context: 'Orbital velocity (live)', state: 'success' });
    setCardFreshness('space-iss-speed', 'cached');
    updateCard('space-iss-altitude', { value: '~408 km', context: 'Low Earth orbit (live)', state: 'success' });
    setCardFreshness('space-iss-altitude', 'cached');
  }

  // Asteroids
  handleResult(results[2], (res) => {
    const { data, stale } = res;
    if (!data) return false;
    const count = data.element_count;

    // Collect all asteroids into a flat array with parsed data
    const asteroids = [];
    const days = data.near_earth_objects;
    for (const date in days) {
      for (const neo of days[date]) {
        const approach = neo.close_approach_data && neo.close_approach_data.length > 0
          ? neo.close_approach_data[0]
          : null;
        asteroids.push({
          name: neo.name,
          id: neo.id,
          hazardous: neo.is_potentially_hazardous_asteroid,
          magnitude: neo.absolute_magnitude_h,
          diameterMinKm: neo.estimated_diameter && neo.estimated_diameter.kilometers
            ? neo.estimated_diameter.kilometers.estimated_diameter_min : null,
          diameterMaxKm: neo.estimated_diameter && neo.estimated_diameter.kilometers
            ? neo.estimated_diameter.kilometers.estimated_diameter_max : null,
          diameterMinM: neo.estimated_diameter && neo.estimated_diameter.meters
            ? neo.estimated_diameter.meters.estimated_diameter_min : null,
          diameterMaxM: neo.estimated_diameter && neo.estimated_diameter.meters
            ? neo.estimated_diameter.meters.estimated_diameter_max : null,
          distanceKm: approach ? parseFloat(approach.miss_distance.kilometers) : Infinity,
          distanceLunar: approach ? parseFloat(approach.miss_distance.lunar) : null,
          velocityKmS: approach ? parseFloat(approach.relative_velocity.kilometers_per_second) : null,
          velocityKmH: approach ? parseFloat(approach.relative_velocity.kilometers_per_hour) : null,
          approachDate: approach ? approach.close_approach_date_full || approach.close_approach_date : null,
          orbitingBody: approach ? approach.orbiting_body : null,
          nasaUrl: neo.nasa_jpl_url,
        });
      }
    }

    // Sort by distance (closest first)
    asteroids.sort(function (a, b) { return a.distanceKm - b.distanceKm; });

    const hazardousCount = asteroids.filter(function (a) { return a.hazardous; }).length;

    // Update asteroid count card
    if (counters['space-asteroids']) {
      counters['space-asteroids'].update(count);
    } else {
      const el = getCardValueEl('space-asteroids');
      if (el) {
        counters['space-asteroids'] = new CountUp(el, count);
        counters['space-asteroids'].start();
      }
    }

    const closest = asteroids.length > 0 ? asteroids[0] : null;
    const ctx = closest ? `Closest: ${closest.name} (${abbreviate(closest.distanceKm)} km) (live)` : 'No near-Earth objects detected (live)';
    updateCard('space-asteroids', { context: ctx, state: 'success' });
    setCardFreshness('space-asteroids', getFreshness('space-asteroids', stale));

    // Build browse list on the asteroids card
    buildAsteroidList(asteroids);

    // Update hazardous count card
    if (counters['space-hazardous']) {
      counters['space-hazardous'].update(hazardousCount);
    } else {
      const el = getCardValueEl('space-hazardous');
      if (el) {
        counters['space-hazardous'] = new CountUp(el, hazardousCount);
        counters['space-hazardous'].start();
      }
    }

    const hazCtx = hazardousCount > 0
      ? `Out of ${count} near-Earth objects (live)`
      : 'No hazardous objects detected (live)';
    updateCard('space-hazardous', { context: hazCtx, state: 'success' });
    setCardFreshness('space-hazardous', getFreshness('space-hazardous', stale));

    return true;
  }, 'space-asteroids');

  // If asteroids failed, also error the hazardous card
  if (results[2].status !== 'fulfilled' || results[2].value.error || !results[2].value.data) {
    setCardError('space-hazardous', () => refresh());
  }

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
      ctxEl.appendChild(document.createTextNode(' | '));
      const link = document.createElement('a');
      link.href = launchUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Details';
      link.className = 'launch-link';
      link.setAttribute('aria-label', `Details for ${missionName} (opens in new tab)`);
      ctxEl.appendChild(link);
    }
    ctxEl.appendChild(document.createTextNode(' (live)'));

    startCountdown();
    updateCard('space-next-launch', { state: 'success' });
    updateCardContext('space-next-launch', ctxEl);
    setCardFreshness('space-next-launch', getFreshness('space-next-launch', stale));
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
    updateCard('space-solar-flares', { context: `Latest class: ${latest} (live)`, state: 'success' });
    setCardFreshness('space-solar-flares', getFreshness('space-solar-flares', stale));

    // Build expandable flare list
    buildFlareList(flares);

    return true;
  }, 'space-solar-flares');

  // ISS Position
  handleResult(results[5], (res) => {
    const { data, stale } = res;
    if (!data) return false;
    // Support both wheretheiss.at format (top-level) and open-notify format (nested)
    const pos = data.iss_position || data;
    const lat = parseFloat(pos.latitude);
    const lon = parseFloat(pos.longitude);
    if (isNaN(lat) || isNaN(lon)) return false;

    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    const formatted = `${Math.abs(lat).toFixed(1)}°${latDir}, ${Math.abs(lon).toFixed(1)}°${lonDir}`;

    updateCard('space-iss-position', {
      value: formatted,
      context: 'Latitude / Longitude (live)',
      state: 'success',
    });
    setCardFreshness('space-iss-position', getFreshness('space-iss-position', stale));

    // ISS speed + altitude from the same API response
    const velocity = parseFloat(data.velocity);
    const altitude = parseFloat(data.altitude);
    if (!isNaN(velocity)) {
      updateCard('space-iss-speed', {
        value: formatNumber(Math.round(velocity)) + ' km/h',
        context: 'Orbital velocity (live)',
        state: 'success',
      });
      setCardFreshness('space-iss-speed', getFreshness('space-iss-speed', stale));
    }
    if (!isNaN(altitude)) {
      updateCard('space-iss-altitude', {
        value: Math.round(altitude) + ' km',
        context: 'Low Earth orbit (live)',
        state: 'success',
      });
      setCardFreshness('space-iss-altitude', getFreshness('space-iss-altitude', stale));
    }

    return true;
  }, 'space-iss-position');

  // NASA APOD
  handleResult(results[6], (res) => {
    const { data, stale } = res;
    if (!data || !data.title) return false;
    renderAPOD(data, stale);
    return true;
  }, 'space-apod');

  // CelesTrak satellite counts
  handleResult(results[7], makeArrayCountHandler('space-satellites', 'Tracked active objects (live)'), 'space-satellites');
  handleResult(results[8], makeArrayCountHandler('space-starlink', 'SpaceX constellation (live)'), 'space-starlink');

  // SATCAT aggregate stats (from GH Action cache)
  handleResult(results[9], function (res) {
    const { data, stale } = res;
    if (!data || !data.overview) return false;

    const o = data.overview;
    const s = data.starlink;
    const rb = data.rocketBodies;
    const deb = data.debris;
    const unk = data.unknown;

    // Overview cards
    renderStatCard('space-sat-launched', o.totalLaunched, `${formatNumber(o.payloads)} payloads (updates every 6h)`);
    renderStatCard('space-sat-decayed', o.decayed, 'No longer in orbit (updates every 6h)');
    if (o.launchFailures > 0) {
      renderStatCard('space-sat-failures', o.launchFailures, `+ ${o.partialFailures} partial (updates every 6h)`);
    } else {
      renderStatCard('space-sat-failures', o.launchFailures, 'Historical launch failures (updates every 6h)');
    }

    // Starlink cards
    renderStatCard('space-starlink-total', s.total, 'All Starlink satellites (updates every 6h)');
    renderStatCard('space-starlink-decayed', s.decayed, 'Deorbited (updates every 6h)');
    renderStatCard('space-starlink-failures', s.launchFailures, 'Failed Starlink launches (updates every 6h)');

    // Object type counts
    renderStatCard('space-rocket-bodies', rb.inOrbit, `${formatNumber(rb.total)} total catalogued (updates every 6h)`);
    renderStatCard('space-debris', deb.inOrbit, `${formatNumber(deb.total)} total catalogued (updates every 6h)`);
    renderStatCard('space-unknown', unk.inOrbit, `${formatNumber(unk.total)} total catalogued (updates every 6h)`);

    // Freshness — updated every 6h, tagged as live
    const satCards = [
      'space-sat-launched', 'space-sat-decayed', 'space-sat-failures',
      'space-starlink-total', 'space-starlink-decayed', 'space-starlink-failures',
      'space-rocket-bodies', 'space-debris', 'space-unknown',
    ];
    for (const id of satCards) {
      setCardFreshness(id, getFreshness(id, stale));
    }

    // Build browse lists (lazy-loaded on toggle click)
    buildSatelliteList('space-satellites', 'sat-pay-panel', 'data/satcat-pay.json', 'satellites');
    buildSatelliteList('space-starlink', 'sat-starlink-panel', 'data/satcat-starlink.json', 'Starlink satellites');
    buildSatelliteList('space-rocket-bodies', 'sat-rb-panel', 'data/satcat-rb.json', 'rocket bodies');
    buildSatelliteList('space-debris', 'sat-deb-panel', 'data/satcat-deb.json', 'debris objects');
    buildSatelliteList('space-unknown', 'sat-unk-panel', 'data/satcat-unk.json', 'unknown objects');

    return true;
  }, 'space-sat-launched');
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

// Extract current spacecraft + destination from SpaceDevs astronaut data
function extractCurrentCraft(astronaut) {
  const result = { craft: '', destination: '', mission: '' };
  if (!astronaut.landings || !Array.isArray(astronaut.landings)) return result;

  // Find the active flight: landing not yet completed (success is null)
  // Fall back to most recent entry
  let active = null;
  for (const landing of astronaut.landings) {
    if (landing.landing && landing.landing.success === null) {
      active = landing;
      break;
    }
  }
  if (!active && astronaut.landings.length > 0) {
    active = astronaut.landings[astronaut.landings.length - 1];
  }
  if (!active) return result;

  // Spacecraft name (e.g. "Crew Dragon Freedom", "Soyuz MS-27")
  if (active.spacecraft && active.spacecraft.name) {
    result.craft = active.spacecraft.name;
  } else if (active.spacecraft && active.spacecraft.spacecraft_config && active.spacecraft.spacecraft_config.name) {
    result.craft = active.spacecraft.spacecraft_config.name;
  }

  // Destination (e.g. "International Space Station", "Tiangong Space Station")
  if (active.destination) {
    result.destination = active.destination;
  }

  // Mission name
  if (active.launch && active.launch.mission && active.launch.mission.name) {
    result.mission = active.launch.mission.name;
  } else if (active.launch && active.launch.name) {
    result.mission = active.launch.name;
  }

  return result;
}

function makeArrayCountHandler(cardId, contextLabel) {
  return function (res) {
    const { data, stale } = res;
    if (!Array.isArray(data) || data.length === 0) return false;
    renderStatCard(cardId, data.length, contextLabel);
    setCardFreshness(cardId, getFreshness(cardId, stale));
    return true;
  };
}

function renderStatCard(cardId, count, contextLabel) {
  if (counters[cardId]) {
    counters[cardId].update(count);
  } else {
    const el = getCardValueEl(cardId);
    if (el) {
      counters[cardId] = new CountUp(el, count);
      counters[cardId].start();
    }
  }
  updateCard(cardId, { context: contextLabel, state: 'success' });
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
async function showAstronautModal(name, personInfo) {
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

    // Spacecraft / location info
    if (personInfo && (personInfo.craft || personInfo.destination)) {
      const craftGrid = document.createElement('div');
      craftGrid.className = 'modal-detail-grid';
      craftGrid.classList.add('modal-detail-grid--spaced');

      if (personInfo.destination) {
        const lbl = document.createElement('span');
        lbl.className = 'modal-detail-label';
        lbl.textContent = 'Currently at';
        const val = document.createElement('span');
        val.className = 'modal-detail-value';
        val.textContent = personInfo.destination;
        craftGrid.appendChild(lbl);
        craftGrid.appendChild(val);
      }
      if (personInfo.craft) {
        const lbl = document.createElement('span');
        lbl.className = 'modal-detail-label';
        lbl.textContent = 'Spacecraft';
        const val = document.createElement('span');
        val.className = 'modal-detail-value';
        val.textContent = personInfo.craft;
        craftGrid.appendChild(lbl);
        craftGrid.appendChild(val);
      }
      if (personInfo.mission) {
        const lbl = document.createElement('span');
        lbl.className = 'modal-detail-label';
        lbl.textContent = 'Mission';
        const val = document.createElement('span');
        val.className = 'modal-detail-value';
        val.textContent = personInfo.mission;
        craftGrid.appendChild(lbl);
        craftGrid.appendChild(val);
      }

      bodyEl.appendChild(craftGrid);
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
  divPanel.setAttribute('role', 'region');
  divPanel.setAttribute('aria-label', 'Solar flare list');

  // Search input
  const inpSearch = document.createElement('input');
  inpSearch.id = 'flare-panel-search';
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
      spnClass.className = `expandable-item-label ${getFlareColorClass(flare.classType)}`;
      spnClass.textContent = flare.classType || 'Unknown';

      const spnDate = document.createElement('span');
      spnDate.className = 'expandable-item-meta';
      spnDate.textContent = formatFlareDate(flare.beginTime);

      liItem.appendChild(spnClass);
      liItem.appendChild(spnDate);
      liItem.setAttribute('tabindex', '0');
      liItem.setAttribute('role', 'button');
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
      inpSearch.focus();
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

function cleanAsteroidName(name) {
  return (name || '').replace(/^\(|\)$/g, '');
}

// Asteroid expandable browse list
function buildAsteroidList(asteroids) {
  const card = document.getElementById('space-asteroids');
  if (!card) return;

  const existing = card.querySelector('.expandable-list');
  if (existing) existing.remove();

  if (asteroids.length === 0) return;

  const divList = document.createElement('div');
  divList.className = 'expandable-list';

  const btnToggle = document.createElement('button');
  btnToggle.className = 'expandable-toggle';
  btnToggle.setAttribute('type', 'button');
  btnToggle.setAttribute('aria-expanded', 'false');
  btnToggle.setAttribute('aria-controls', 'asteroid-panel');

  const spnToggleText = document.createElement('span');
  spnToggleText.textContent = 'Browse asteroids';

  const spnToggleArrow = document.createElement('span');
  spnToggleArrow.className = 'expandable-toggle-arrow';
  spnToggleArrow.textContent = '\u25BC';
  spnToggleArrow.setAttribute('aria-hidden', 'true');

  btnToggle.appendChild(spnToggleText);
  btnToggle.appendChild(spnToggleArrow);

  const divPanel = document.createElement('div');
  divPanel.className = 'expandable-panel';
  divPanel.id = 'asteroid-panel';
  divPanel.setAttribute('role', 'region');
  divPanel.setAttribute('aria-label', 'Asteroid list');

  const inpSearch = document.createElement('input');
  inpSearch.id = 'asteroid-panel-search';
  inpSearch.className = 'expandable-search';
  inpSearch.setAttribute('type', 'text');
  inpSearch.setAttribute('placeholder', 'Search by name, hazardous...');
  inpSearch.setAttribute('autocomplete', 'off');
  inpSearch.setAttribute('aria-label', 'Search asteroids');

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
    let filtered = asteroids;

    if (query) {
      filtered = asteroids.filter(function (a) {
        const name = (a.name || '').toLowerCase();
        const hazText = a.hazardous ? 'hazardous' : 'safe';
        return name.includes(query) || hazText.includes(query);
      });
    }

    if (filtered.length === 0) {
      const liEmpty = document.createElement('li');
      liEmpty.className = 'expandable-empty';
      liEmpty.textContent = 'No matching asteroids';
      ulItems.appendChild(liEmpty);
      return;
    }

    for (let i = 0; i < filtered.length; i++) {
      const asteroid = filtered[i];
      const liItem = document.createElement('li');
      liItem.className = 'expandable-item';

      const spnName = document.createElement('span');
      spnName.className = 'expandable-item-label expandable-item-label--sans';

      const cleanName = cleanAsteroidName(asteroid.name);
      spnName.textContent = cleanName;

      const spnRight = document.createElement('span');
      spnRight.className = 'expandable-item-right';

      if (asteroid.hazardous) {
        const spnHazard = document.createElement('span');
        spnHazard.className = 'asteroid-hazard-badge';
        spnHazard.textContent = 'PHO';
        spnHazard.setAttribute('aria-label', 'Potentially Hazardous Object');
        spnRight.appendChild(spnHazard);
      }

      const spnDist = document.createElement('span');
      spnDist.className = 'expandable-item-meta';
      spnDist.textContent = abbreviate(asteroid.distanceKm) + ' km';
      spnRight.appendChild(spnDist);

      liItem.appendChild(spnName);
      liItem.appendChild(spnRight);

      liItem.setAttribute('tabindex', '0');
      liItem.setAttribute('role', 'button');
      liItem.setAttribute('aria-label', `Asteroid ${cleanName}${asteroid.hazardous ? ', potentially hazardous' : ''}`);

      liItem.addEventListener('click', function () {
        showAsteroidModal(asteroid);
      });
      liItem.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showAsteroidModal(asteroid);
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
      spnToggleText.textContent = 'Hide asteroids';
      renderItems('');
      inpSearch.focus();
    } else {
      divPanel.classList.remove('open');
      spnToggleArrow.classList.remove('open');
      spnToggleText.textContent = 'Browse asteroids';
      inpSearch.value = '';
    }
  });

  inpSearch.addEventListener('input', function () {
    renderItems(inpSearch.value);
  });
}

// Asteroid detail modal
function showAsteroidModal(asteroid) {
  const bodyDiv = document.createElement('div');

  // Hazard badge at top
  if (asteroid.hazardous) {
    const hazP = document.createElement('p');
    hazP.className = 'asteroid-hazard-banner';
    hazP.textContent = 'Potentially Hazardous Object';
    bodyDiv.appendChild(hazP);
  }

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

  // Distance
  if (asteroid.distanceKm !== Infinity) {
    addRow('Miss Distance', formatNumber(Math.round(asteroid.distanceKm)) + ' km');
  }
  if (asteroid.distanceLunar !== null) {
    addRow('Lunar Distance', asteroid.distanceLunar.toFixed(2) + ' LD');
  }

  // Velocity
  if (asteroid.velocityKmS !== null) {
    addRow('Relative Velocity', asteroid.velocityKmS.toFixed(2) + ' km/s');
  }
  if (asteroid.velocityKmH !== null) {
    addRow('(km/h)', formatNumber(Math.round(asteroid.velocityKmH)));
  }

  // Size
  if (asteroid.diameterMinM !== null && asteroid.diameterMaxM !== null) {
    const minM = asteroid.diameterMinM;
    const maxM = asteroid.diameterMaxM;
    if (maxM >= 1000) {
      addRow('Est. Diameter', asteroid.diameterMinKm.toFixed(2) + ' – ' + asteroid.diameterMaxKm.toFixed(2) + ' km');
    } else {
      addRow('Est. Diameter', Math.round(minM) + ' – ' + Math.round(maxM) + ' m');
    }
  }

  // Magnitude
  if (asteroid.magnitude !== null && asteroid.magnitude !== undefined) {
    addRow('Abs. Magnitude', 'H ' + asteroid.magnitude.toFixed(1));
  }

  // Approach date
  if (asteroid.approachDate) {
    addRow('Close Approach', asteroid.approachDate);
  }

  // Orbiting body
  if (asteroid.orbitingBody) {
    addRow('Orbiting Body', asteroid.orbitingBody);
  }

  bodyDiv.appendChild(grid);

  // NASA JPL link
  if (asteroid.nasaUrl) {
    const linkP = document.createElement('p');
    linkP.className = 'modal-link-row';
    const link = document.createElement('a');
    link.href = asteroid.nasaUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View on NASA JPL \u2192';
    link.setAttribute('aria-label', 'View asteroid details on NASA JPL (opens in new tab)');
    linkP.appendChild(link);
    bodyDiv.appendChild(linkP);
  }

  openModal({ title: cleanAsteroidName(asteroid.name), body: bodyDiv });
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
  return `${day}-${month} ${hours}:${minutes}`;
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

// Render NASA Astronomy Picture of the Day
function renderAPOD(data, stale) {
  const card = document.getElementById('space-apod');
  if (!card) return;

  card.dataset.state = 'success';

  const valEl = card.querySelector('.stat-value');
  valEl.textContent = '';
  valEl.classList.add('stat-value--embed');

  const isImage = data.media_type === 'image';

  if (isImage && data.url) {
    const img = document.createElement('img');
    img.className = 'apod-card-image';
    img.src = data.url;
    img.alt = data.title || 'Astronomy Picture of the Day';
    img.loading = 'lazy';
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'View full image: ' + (data.title || 'APOD'));
    img.addEventListener('click', function () {
      showAPODModal(data);
    });
    img.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showAPODModal(data);
      }
    });
    valEl.appendChild(img);
  }

  const title = document.createElement('div');
  title.className = 'apod-title';
  title.textContent = data.title || '';
  if (isImage) {
    title.classList.add('apod-title--clickable');
    title.setAttribute('tabindex', '0');
    title.setAttribute('role', 'button');
    title.setAttribute('aria-label', 'View full image: ' + (data.title || 'APOD'));
    title.addEventListener('click', function () {
      showAPODModal(data);
    });
    title.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showAPODModal(data);
      }
    });
  }
  valEl.appendChild(title);

  const excerpt = document.createElement('div');
  excerpt.className = 'apod-excerpt';
  const explanation = data.explanation || '';
  excerpt.textContent = explanation.length > 150 ? explanation.substring(0, 150) + '...' : explanation;
  valEl.appendChild(excerpt);

  if (!isImage && data.title) {
    // For video type, show title + note
    const note = document.createElement('div');
    note.className = 'apod-excerpt';
    note.textContent = `Today's APOD is a video: ${data.title}`;
    valEl.appendChild(note);
  }

  const ctxEl = card.querySelector('.stat-context');
  if (ctxEl) {
    const dateStr = data.date ? reverseDateStr(data.date) : 'today';
    if (isImage) {
      ctxEl.textContent = `Click image for full view (${dateStr})`;
    } else {
      ctxEl.textContent = `NASA APOD (${dateStr})`;
    }
  }

  setCardFreshness('space-apod', getFreshness('space-apod', stale));
}

function showAPODModal(data) {
  const bodyDiv = document.createElement('div');

  if (data.explanation) {
    const p = document.createElement('p');
    p.textContent = data.explanation;
    bodyDiv.appendChild(p);
  }

  if (data.date) {
    const dateP = document.createElement('p');
    dateP.className = 'modal-description';
    dateP.textContent = `Date: ${reverseDateStr(data.date)}`;
    bodyDiv.appendChild(dateP);
  }

  if (data.copyright) {
    const copyrightP = document.createElement('p');
    copyrightP.className = 'modal-description';
    copyrightP.textContent = `Credit: ${data.copyright}`;
    bodyDiv.appendChild(copyrightP);
  }

  const image = data.hdurl || data.url
    ? { src: data.hdurl || data.url, alt: data.title || 'APOD' }
    : null;

  openModal({ title: data.title || 'Astronomy Picture of the Day', body: bodyDiv, image: image });
}

// Satellite browse list (lazy-loaded, batch-loaded like earthquakes)
function buildSatelliteList(cardId, panelId, dataUrl, typeName) {
  const card = document.getElementById(cardId);
  if (!card) return;

  // Skip if already built (refresh calls this repeatedly)
  if (card.querySelector('.expandable-list')) return;

  const divList = document.createElement('div');
  divList.className = 'expandable-list';

  // Toggle button
  const btnToggle = document.createElement('button');
  btnToggle.className = 'expandable-toggle';
  btnToggle.setAttribute('type', 'button');
  btnToggle.setAttribute('aria-expanded', 'false');
  btnToggle.setAttribute('aria-controls', panelId);

  const spnToggleText = document.createElement('span');
  spnToggleText.textContent = `Browse ${typeName}`;

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
  divPanel.setAttribute('role', 'region');
  divPanel.setAttribute('aria-label', `${typeName} list`);

  // Search input
  const inpSearch = document.createElement('input');
  inpSearch.id = `${panelId}-search`;
  inpSearch.className = 'expandable-search';
  inpSearch.setAttribute('type', 'text');
  inpSearch.setAttribute('placeholder', `Search by name, owner, NORAD ID...`);
  inpSearch.setAttribute('autocomplete', 'off');
  inpSearch.setAttribute('aria-label', `Search ${typeName}`);

  // Column headers
  const divHeader = document.createElement('div');
  divHeader.className = 'sat-header';
  divHeader.setAttribute('aria-hidden', 'true');

  const hdrName = document.createElement('span');
  hdrName.className = 'sat-header-name';
  hdrName.textContent = 'Name';

  const hdrOwner = document.createElement('span');
  hdrOwner.className = 'sat-header-owner';
  hdrOwner.textContent = 'Country';

  const hdrDate = document.createElement('span');
  hdrDate.className = 'sat-header-date';
  hdrDate.textContent = 'Launch Date';

  divHeader.appendChild(hdrName);
  divHeader.appendChild(hdrOwner);
  divHeader.appendChild(hdrDate);

  // Items list
  const ulItems = document.createElement('ul');
  ulItems.className = 'expandable-items';
  ulItems.setAttribute('role', 'list');

  divPanel.appendChild(inpSearch);
  divPanel.appendChild(divHeader);
  divPanel.appendChild(ulItems);

  divList.appendChild(btnToggle);
  divList.appendChild(divPanel);
  card.appendChild(divList);

  const BATCH_SIZE = 100;
  let allItems = null;
  let loaded = false;

  function createSatItem(item) {
    const liItem = document.createElement('li');
    liItem.className = 'expandable-item';

    const spnName = document.createElement('span');
    spnName.className = 'expandable-item-label expandable-item-label--sans';
    spnName.textContent = item.n || 'Unknown';

    const spnOwner = document.createElement('span');
    spnOwner.className = 'sat-item-owner';
    spnOwner.textContent = item.owner || '??';

    const spnDate = document.createElement('span');
    spnDate.className = 'expandable-item-meta';
    spnDate.textContent = item.launch ? reverseDateStr(item.launch) : '';

    liItem.appendChild(spnName);
    liItem.appendChild(spnOwner);
    liItem.appendChild(spnDate);
    liItem.setAttribute('tabindex', '0');
    liItem.setAttribute('role', 'button');
    liItem.setAttribute('aria-label', `${item.n || 'Unknown'} — ${item.owner || 'Unknown owner'}`);

    liItem.addEventListener('click', function () { showSatelliteModal(item); });
    liItem.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showSatelliteModal(item);
      }
    });

    return liItem;
  }

  function appendLoadMore(filtered, shownCount) {
    const existingMore = ulItems.querySelector('.expandable-load-more');
    if (existingMore) existingMore.remove();

    const remaining = filtered.length - shownCount;
    if (remaining <= 0) return;

    const liMore = document.createElement('li');
    liMore.className = 'expandable-load-more';

    const btn = document.createElement('button');
    btn.className = 'expandable-load-more-btn';
    btn.setAttribute('type', 'button');
    const nextBatch = Math.min(remaining, BATCH_SIZE);
    btn.textContent = `Load ${nextBatch} more (${remaining} remaining)`;

    btn.addEventListener('click', function () {
      liMore.remove();
      const nextSlice = filtered.slice(shownCount, shownCount + BATCH_SIZE);
      for (const sat of nextSlice) {
        ulItems.appendChild(createSatItem(sat));
      }
      appendLoadMore(filtered, shownCount + nextSlice.length);
    });

    liMore.appendChild(btn);
    ulItems.appendChild(liMore);
  }

  function renderItems(filter) {
    ulItems.replaceChildren();
    if (!allItems) return;

    const query = (filter || '').trim().toLowerCase();
    let filtered = allItems;

    if (query) {
      filtered = allItems.filter(function (item) {
        const name = (item.n || '').toLowerCase();
        const owner = (item.owner || '').toLowerCase();
        const noradId = String(item.id || '');
        const intl = (item.intl || '').toLowerCase();
        return name.includes(query) || owner.includes(query) ||
               noradId.includes(query) || intl.includes(query);
      });
    }

    if (filtered.length === 0) {
      const liEmpty = document.createElement('li');
      liEmpty.className = 'expandable-empty';
      liEmpty.textContent = `No matching ${typeName}`;
      ulItems.appendChild(liEmpty);
      return;
    }

    const initial = filtered.slice(0, BATCH_SIZE);
    for (const sat of initial) {
      ulItems.appendChild(createSatItem(sat));
    }
    appendLoadMore(filtered, initial.length);
  }

  // Toggle open/close — lazy-loads data on first open
  let isOpen = false;
  btnToggle.addEventListener('click', function () {
    isOpen = !isOpen;
    btnToggle.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      divPanel.classList.add('open');
      spnToggleArrow.classList.add('open');
      spnToggleText.textContent = `Hide ${typeName}`;

      if (!loaded) {
        // Show loading state
        ulItems.replaceChildren();
        const liLoading = document.createElement('li');
        liLoading.className = 'expandable-empty';
        liLoading.textContent = `Loading ${typeName}...`;
        ulItems.appendChild(liLoading);

        fetch(dataUrl)
          .then(function (r) { return r.json(); })
          .then(function (items) {
            loaded = true;
            allItems = items;
            renderItems('');
          })
          .catch(function () {
            ulItems.replaceChildren();
            const liErr = document.createElement('li');
            liErr.className = 'expandable-empty';
            liErr.textContent = `Failed to load ${typeName}`;
            ulItems.appendChild(liErr);
          });
      } else {
        renderItems(inpSearch.value);
      }
      inpSearch.focus();
    } else {
      divPanel.classList.remove('open');
      spnToggleArrow.classList.remove('open');
      spnToggleText.textContent = `Browse ${typeName}`;
      inpSearch.value = '';
    }
  });

  // Search handler (debounced — lists can have 18K+ items)
  let searchTimer = null;
  inpSearch.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      renderItems(inpSearch.value);
    }, 150);
  });
}

// Satellite detail modal
function showSatelliteModal(item) {
  const bodyDiv = document.createElement('div');

  // Status badge (for payloads only)
  if (item.status) {
    const statusP = document.createElement('p');
    const statusSpan = document.createElement('span');
    statusSpan.className = getSatStatusColorClass(item.status);
    statusSpan.textContent = getSatStatusLabel(item.status);
    statusP.appendChild(statusSpan);
    bodyDiv.appendChild(statusP);
  }

  // Detail grid
  const grid = document.createElement('div');
  grid.className = 'modal-detail-grid';

  function addGridRow(label, value) {
    if (!value) return;
    const lblEl = document.createElement('span');
    lblEl.className = 'modal-detail-label';
    lblEl.textContent = label;
    const valEl = document.createElement('span');
    valEl.className = 'modal-detail-value';
    valEl.textContent = value;
    grid.appendChild(lblEl);
    grid.appendChild(valEl);
  }

  addGridRow('NORAD ID', String(item.id || ''));
  addGridRow('Designator', item.intl || '');
  addGridRow('Owner', item.owner || '');
  addGridRow('Launch Date', item.launch ? reverseDateStr(item.launch) : 'Unknown');
  if (item.perigee) addGridRow('Perigee', `${item.perigee} km`);
  if (item.apogee) addGridRow('Apogee', `${item.apogee} km`);

  bodyDiv.appendChild(grid);

  // N2YO tracking link
  if (item.id) {
    const linkP = document.createElement('p');
    linkP.className = 'modal-link-row';
    const link = document.createElement('a');
    link.href = `https://www.n2yo.com/satellite/?s=${item.id}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Track on N2YO \u2192';
    link.setAttribute('aria-label', `Track ${item.n || 'satellite'} on N2YO (opens in new tab)`);
    linkP.appendChild(link);
    bodyDiv.appendChild(linkP);
  }

  openModal({ title: item.n || 'Satellite Details', body: bodyDiv });
}

// Satellite status color/label helpers
function getSatStatusColorClass(status) {
  switch (status) {
    case '+': return 'sat-status-active';
    case 'P': case 'B': case 'S': case 'X': return 'sat-status-partial';
    case 'D': return 'sat-status-decayed';
    default: return 'sat-status-inactive';
  }
}

function getSatStatusLabel(status) {
  switch (status) {
    case '+': return 'Operational';
    case '-': return 'Non-operational';
    case 'D': return 'Decayed';
    case 'P': return 'Partially Operational';
    case 'B': return 'Backup / Standby';
    case 'S': return 'Spare';
    case 'X': return 'Extended Mission';
    default: return 'Unknown';
  }
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

    const tankLevelRaw = get('TANK_LEVEL');

    return {
      tankLevel: tankLevelRaw !== null ? parseFloat(tankLevelRaw) : null,
      lastFlush: get('LAST_FLUSH'),
    };
  } catch {
    return null;
  }
}

// ISS Toilet telemetry via NASA Lightstreamer
async function initISSToilet() {
  updateCard('space-iss-toilet', { value: 'Connecting...', context: 'ISS WHC telemetry via Lightstreamer (live)', state: 'loading' });
  updateCard('space-iss-flush', { value: 'Waiting...', context: 'Detected by tank level drop >3% (live)', state: 'loading' });

  // Load persisted data so cards show last known events immediately
  const persisted = await loadPersistedToiletData();
  if (persisted) {
    setISSInitialState({
      lastFlushTime: persisted.lastFlush,
      tankLevel: persisted.tankLevel,
    });

    if (persisted.lastFlush) {
      const ageMs = Date.now() - new Date(persisted.lastFlush).getTime();
      const prefix = ageMs > 60 * 60 * 1000 ? '' : '~';
      updateCard('space-iss-flush', {
        value: prefix + relativeTime(persisted.lastFlush),
        context: 'From telemetry log (live)',
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
        context: `${connNote} | ISS WHC telemetry (live)`,
        state: 'success',
      });
      setCardFreshness('space-iss-toilet', 'live');
    }

    // Last flush
    if (state.lastFlushTime) {
      const ageMs = Date.now() - new Date(state.lastFlushTime).getTime();
      const prefix = ageMs > 60 * 60 * 1000 ? '' : '~';
      updateCard('space-iss-flush', {
        value: prefix + relativeTime(state.lastFlushTime),
        context: 'Tank level dropped >3% (live)',
        state: 'success',
      });
    } else {
      updateCard('space-iss-flush', {
        value: 'No flush detected yet',
        context: 'Monitoring for tank level drops (live)',
        state: 'success',
      });
    }
    setCardFreshness('space-iss-flush', 'live');

  });
}
