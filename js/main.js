import * as space from './sections/space.js';
import * as earth from './sections/earth.js';
import * as climate from './sections/climate.js';
import * as economy from './sections/economy.js';
import * as population from './sections/population.js';
import * as health from './sections/health.js';
import * as transport from './sections/transport.js';
import * as trending from './sections/trending.js';
import { formatUTC } from './utils/time.js';
import { $, $$ } from './utils/dom.js';

const SECTIONS = [
  { module: space,      refreshMs: 300000 },  // 5min to respect NASA DEMO_KEY rate limit
  { module: earth,      refreshMs: 60000  },
  { module: climate,    refreshMs: 300000 },
  { module: economy,    refreshMs: 60000  },
  { module: population, refreshMs: 600000 },
  { module: health,     refreshMs: 300000 },
  { module: transport,  refreshMs: 120000 },  // 2min — OpenSky free tier is 10 req/min
  { module: trending,   refreshMs: 120000 },
];

document.addEventListener('DOMContentLoaded', () => {
  // Set up UI observers first so cards animate as they appear
  setupCardAnimations();
  setupScrollSpy();
  setupNavClicks();
  updateTimestamp();
  setInterval(updateTimestamp, 30000);

  // Init all sections in parallel and track readiness
  const LOADER_MIN_MS = 2000;
  const LOADER_MAX_MS = 5000;
  const elLoader = $('#loader-overlay');

  const initPromises = SECTIONS.map(s => {
    const p = s.module.init();

    setInterval(() => {
      s.module.refresh().catch(err => {
        console.error(`Failed to refresh ${s.module.sectionId}:`, err);
      });
    }, s.refreshMs);

    return p;
  });

  const allReady = Promise.allSettled(initPromises);
  const minDelay = new Promise(resolve => setTimeout(resolve, LOADER_MIN_MS));
  const maxDelay = new Promise(resolve => setTimeout(resolve, LOADER_MAX_MS));

  // Wait for both APIs and minimum delay, but cap at max delay
  const readyAfterMin = Promise.all([allReady, minDelay]);
  Promise.race([readyAfterMin, maxDelay]).then(() => {
    dismissLoader(elLoader);
  });
});

function dismissLoader(elLoader) {
  if (!elLoader || !elLoader.parentNode) return;

  document.body.classList.remove('is-loading');
  elLoader.classList.add('dismiss');

  // Fallback removal if animationend doesn't fire (reduced-motion)
  const fallbackTimer = setTimeout(() => {
    if (elLoader.parentNode) {
      elLoader.remove();
    }
  }, 600);

  elLoader.addEventListener('animationend', () => {
    clearTimeout(fallbackTimer);
    elLoader.remove();
  }, { once: true });
}

function setupCardAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const card = entry.target;
          const grid = card.closest('.card-grid');
          const allCards = grid ? [...grid.querySelectorAll('.stat-card')] : [];
          const index = allCards.indexOf(card);
          card.style.animationDelay = `${index * 60}ms`;
          card.classList.add('visible');
          observer.unobserve(card);
        }
      }
    },
    { threshold: 0.1 }
  );

  // Observe existing cards and watch for new ones
  function observeCards() {
    for (const card of $$('.stat-card:not(.visible)')) {
      observer.observe(card);
    }
  }

  observeCards();

  // Re-observe after sections load
  const mutationObserver = new MutationObserver(() => {
    observeCards();
  });
  const main = $('main');
  if (main) {
    mutationObserver.observe(main, { childList: true, subtree: true });
  }
}

function setupScrollSpy() {
  const navLinks = $$('.category-nav a');
  const sections = $$('.dashboard-section');

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          for (const link of navLinks) {
            link.classList.remove('active');
            link.removeAttribute('aria-current');
            link.style.removeProperty('background-color');
          }
          const activeLink = navLinks.find(l => l.dataset.section === id);
          if (activeLink) {
            activeLink.classList.add('active');
            activeLink.setAttribute('aria-current', 'location');
            const accent = getComputedStyle(document.documentElement)
              .getPropertyValue(`--accent-${id}`).trim();
            if (accent) {
              activeLink.style.backgroundColor = accent;
            }
          }
        }
      }
    },
    { rootMargin: '-20% 0px -80% 0px' }
  );

  for (const section of sections) {
    observer.observe(section);
  }
}

function setupNavClicks() {
  for (const link of $$('.category-nav a')) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionId = link.dataset.section;
      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
        history.replaceState(null, '', `#${sectionId}`);
      }
    });
  }
}

function updateTimestamp() {
  const el = $('.last-updated');
  if (el) {
    el.textContent = `Updated: ${formatUTC(new Date())}`;
  }
}
