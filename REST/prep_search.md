# Worldometer 2.0 — Full Project Context & Prep Notes

> This file provides complete context for any session working on this project.
> See also: `API_RESEARCH.md` for detailed API endpoints and response formats.

---

## Project Overview

- **Goal:** Build a modern, sleek "Worldometer-style" real-time data dashboard
- **Tech:** Plain HTML, CSS, JS (vanilla, no frameworks, no build step)
- **Data:** All real-world statistics from free public APIs. NO filler content (no quotes, jokes, trivia, random facts, animal pics, etc.). Data like "latest discovered star" IS fine — it's real-world applicable.

---

## File Structure

```
worldometer 2/
  index.html                    # Single page app
  prep_search.md                # THIS FILE — project context
  API_RESEARCH.md               # Detailed API reference
  css/
    reset.css                   # Minimal CSS reset
    variables.css               # Design tokens (colors, spacing, typography)
    layout.css                  # Page grid, sticky nav, sections
    components.css              # Stat cards, skeletons, badges
    animations.css              # Keyframes (countPulse, shimmer, fadeSlideUp)
    responsive.css              # Breakpoints: 1400/1024/768px
  js/
    main.js                     # Orchestrator: boots sections, refresh, scroll-spy
    utils/
      counter.js                # CountUp/CountDown animation (requestAnimationFrame)
      format.js                 # Number formatting (commas, abbreviations, units)
      fetch-handler.js          # fetch() with timeout, retry, cache, dedup
      dom.js                    # querySelector helpers, stat card builder
      time.js                   # Relative time, countdown, UTC formatting
    sections/
      space.js                  # ISS, astronauts, asteroids, launches, solar flares
      earth.js                  # Earthquakes, local weather
      climate.js                # CO2, methane, temp anomaly, UK grid + fuel mix
      economy.js                # Crypto market, exchange rates, BTC mempool
      population.js             # World population ticker, country stats, GDP
      health.js                 # COVID/disease global stats
      transport.js              # Live flights worldwide
      trending.js               # Hacker News top stories
  assets/
    favicon.svg                 # Globe/pulse SVG favicon
```

---

## Design System

**Theme:** Dark mode dashboard (Bloomberg terminal meets modern web)

### Background Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#0a0e17` | Near-black with blue tint |
| `--bg-secondary` | `#111827` | Card background |
| `--bg-tertiary` | `#1a2235` | Hover / elevated |

### Category Accent Colors

| Category | Color | Hex |
|----------|-------|-----|
| Space | Indigo | `#6366f1` |
| Earth | Amber | `#f59e0b` |
| Climate | Emerald | `#10b981` |
| Economy | Orange | `#f97316` |
| Population | Violet | `#8b5cf6` |
| Health | Red | `#ef4444` |
| Transport | Cyan | `#06b6d4` |
| Trending | Pink | `#ec4899` |

### Text Colors

| Token | Value |
|-------|-------|
| `--text-primary` | `#f1f5f9` |
| `--text-secondary` | `#94a3b8` |
| `--text-muted` | `#475569` |

### Typography

- **Sans:** Inter (UI text)
- **Mono:** JetBrains Mono (numbers — `tabular-nums` for no jitter)
- **Stat sizes:** `clamp(2rem, 4vw, 3.5rem)` large, `clamp(1.5rem, 3vw, 2.5rem)` medium

### Cards

- Background: `var(--bg-secondary)`
- Border: `1px solid rgba(255,255,255,0.06)`
- Radius: `12px`
- Padding: `1.5rem`
- Hover: `translateY(-2px)`, brighter border, subtle shadow

---

## Categories & What They Display

*Page order, top to bottom:*

### 1. Space & Astronomy
**Refresh: 30s | Accent: Indigo**

- **Hero:** "X People in Space Right Now" (Open Notify) + crew names
- ISS Speed / Altitude / Position (Where The ISS At)
- "X Near-Earth Asteroids This Week" + closest (NASA NeoWs)
- Next Launch Countdown `d:h:m:s` (Launch Library 2)
- Next SpaceX Launch (SpaceX API)
- "X Solar Flares This Month" (NASA DONKI)

### 2. Earth & Seismology
**Refresh: 60s | Accent: Amber**

- **Hero:** "X Earthquakes in the Last Hour" + strongest (USGS)
- "X Significant Quakes This Month" + top 3 (USGS)
- Weather at Your Location — auto-detected (Open-Meteo + IP-API)

### 3. Climate & Energy
**Refresh: 5min | Accent: Emerald**

- **Hero:** "Current CO2: 425.3 ppm" + year-over-year delta (Global Warming API)
- "Atmospheric Methane: 1923 ppb" (Global Warming API)
- "Temperature Anomaly: +1.3C" red-coded (Global Warming API)
- "UK Grid: 217 gCO2/kWh" + index badge (Carbon Intensity UK)
- UK Fuel Mix stacked bar (Carbon Intensity UK `/generation`)

### 4. Economy & Crypto
**Refresh: 60s | Accent: Orange**

- **Hero:** "Crypto Market Cap: $2.69T" + 24h change (CoinGecko)
- BTC / ETH Dominance (CoinLore)
- Exchange Rates: EUR, GBP, JPY, CNY vs USD (Frankfurter)
- "21,009 Unconfirmed BTC Transactions" (Mempool.space)
- BTC Network Hashrate (Mempool.space)

### 5. World Population
**Refresh: 10min | Accent: Violet**

- **Hero:** "World Population: 7,944,935,131" — TICKING counter (+~2.5/sec)
- "250 Countries", most populous, largest (REST Countries)
- "World GDP: $105T" (World Bank)

### 6. Health
**Refresh: 5min | Accent: Red**

- Global COVID: cases, deaths, recovered, active (disease.sh)
- Today's cases / deaths (alert-colored)
- "231 Affected Countries"

### 7. Transportation
**Refresh: 30s | Accent: Cyan**

- **Hero:** "X Flights in the Air Right Now" (OpenSky Network)
- **Caution:** 5-10MB payload, lazy load, 15s timeout, regional fallback

### 8. Trending Now
**Refresh: 2min | Accent: Pink**

- Top 5 Hacker News stories (title, score, comments, link)

---

## Key Technical Patterns

### Counter Animation (`counter.js`)

- `requestAnimationFrame` loop, ease-out-expo easing
- Initial load: animate `0 -> target` over 1.5s
- Refresh: animate `current -> new` over 0.8s (not from zero)
- Adds `.updating` CSS class during animation (pulse + glow)
- `font-variant-numeric: tabular-nums` prevents width jitter

### Population Ticker

- After initial API fetch, `setInterval` every 400ms adding ~1
- Simulates ~2.5 net people/second (births minus deaths)
- Re-syncs to API value every 10min refresh

### Launch Countdown

- Live countdown from `window_start` of Launch Library response
- Updated every 1s via `setInterval`
- Format: `12d 04h 32m 17s` in styled boxes
- At zero: "LAUNCHING NOW" with pulse animation

### Fetch Handler (`fetch-handler.js`)

- `AbortController` timeout (10s default, 15s for OpenSky)
- 1 retry after 2s on failure
- Caches last successful response per URL
- On failure after retry: returns cached (stale) data if available
- Request dedup: same URL in-flight returns existing promise
- Returns: `{ data, stale: false }` or `{ data: cachedData, stale: true }` or `{ error: true }`

### Card States

4 visual states via `data-state` attribute:

| State | Visual |
|-------|--------|
| `loading` | Skeleton shimmer (gray pulsing rectangles) |
| `success` | Real data displayed |
| `stale` | Last good data + amber "stale" badge + dimmed opacity |
| `error` | "Data unavailable" + retry link |

### Scroll Animations

- `IntersectionObserver` threshold `0.1` on each `.stat-card`
- Adds `.visible` -> triggers `fadeSlideUp` (opacity + translateY, 0.5s)
- Stagger: each card gets `transition-delay` of `index * 60ms`

### Nav Scroll-Spy

- `IntersectionObserver` on each `<section>` with `rootMargin: '-20% 0px -80% 0px'`
- Highlights active nav pill with section's accent color
- Click nav pill -> smooth scroll to section

### Responsive Grid

- `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`
- Featured/wide cards: `grid-column: 1 / -1`
- Breakpoints: `>=1400` (4col), `1024-1399` (3col), `768-1023` (2col), `<768` (1col)
- Mobile: nav becomes horizontal scroll strip, reduced padding/gaps
- Lazy-load sections below fold (only fetch when near viewport)

---

## Build Order

1. HTML skeleton + all CSS (sections with placeholder cards, responsive grid)
2. Utility modules (fetch-handler, counter, format, dom, time)
3. Space section end-to-end (proves full pipeline: fetch -> render -> animate -> refresh)
4. Remaining 7 sections (each follows `space.js` pattern)
5. Orchestrator `main.js` (boot, refresh intervals, scroll-spy, IntersectionObserver)
6. Polish (skeletons, error states, hover effects, mobile tuning)
7. Test all APIs, responsive, error recovery

---

## API Key Notes

**NASA:**
- `DEMO_KEY` works for testing (30/hour, 50/day)
- Register FREE at https://api.nasa.gov for 1000/hour

**All other APIs:** No key required

### Rate Limiting Strategy

| API | Refresh Interval | Notes |
|-----|-----------------|-------|
| NASA (DEMO_KEY) | 5min | Cache aggressively |
| CoinGecko free | 60s | Back off to 5min on 429 |
| OpenSky anonymous | 30s | 15s timeout, regional fallback |
| Launch Library | 5min | 15/hour limit |
| Everything else | Per-section default | Generous or unlimited |

---

## Expansion Ideas (for later)

- **NASA APOD** — Astronomy Picture of the Day with explanation
- **NASA EPIC** — Latest Earth photo from DSCOVR satellite
- **NASA Mars Rover** — Latest photos from Curiosity
- **NASA EONET** — Active natural events (wildfires, storms, volcanoes)
- **Global Warming** `/arctic-api` — Arctic ice extent
- **Global Warming** `/ocean-warming-api` — Ocean warming data
- **OpenAQ** — Global air quality measurements
- **WAQI** — World Air Quality Index (needs free token)
- **World Bank additional** — life expectancy, literacy, internet users, poverty
- **Wikipedia Pageviews** — most viewed articles (trend data)
- **Nager.Date** — public holidays by country
- **Open-Meteo Air Quality** — PM2.5, PM10, ozone, pollen
- **Open-Meteo Marine** — wave height, period, direction
- **NOAA Tides** — ocean water levels and temperatures
- **Electricity Maps** — carbon intensity by country (needs free key)
- **WHO GHO API** — life expectancy, disease burden
- **Sports** (ESPN unofficial, TheSportsDB) — live scores
