# Worldometer 2.0 — Project Instructions

**CONVENTIONS**: Read the files in `.claude/conventions/` before writing code. They contain the coding standards for this project.

## Workflow (follow this every session)

1. **Read context:** Read `REST/prep_search.md` (project overview, design system, API details) and `plan.md` (step-by-step build plan)
2. **Read ideas:** Check `REST/ideas.md` for improvement ideas and `REST/questions.md` / `REST/questions2.md` for Q&A context
3. **Find next step:** In `plan.md`, find the first step where `STATUS: [ ]` (not yet done)
4. **Execute the step:** Follow the step's instructions carefully. Build what it says, test it, make sure it works properly and looks correct
5. **Verify:** Check the "Done when" criteria at the end of the step. Don't move on until it's actually working
6. **Mark done:** In `plan.md`, change that step's `STATUS: [ ]` to `STATUS: [x]`
7. **Stop / clear context:** The session can end here. Next session picks up at the next unmarked step

## Key files
- `plan.md` — The master build plan with all steps and their status
- `REST/prep_search.md` — Full project context (design system, categories, technical patterns)
- `REST/API_RESEARCH.md` — Detailed API endpoints, response formats, rate limits
- `REST/ideas.md` — Improvement ideas (Update Existing Stats, General, New Stats)
- `REST/questions.md` — Q&A about ideas (with user answers marked "CA.")
- `REST/questions2.md` — Follow-up Q&A (with user answers marked "CA.")

## Rules
- **Only do ONE step per session** — do NOT start the next step. Verify, mark done, stop.
- **Only do ONE phase at a time** — do not look ahead or start work from a future phase
- Always verify the step works before marking it done (check the "Done when" criteria)
- If an API is down or changed, note it in the step and adapt
- Don't skip steps — they build on each other
- Use Bootstrap grid system (`row`/`col-*`) for layout — `css/bootstrap.min.css` is present in the project
- All dropdowns/pickers must be searchable (type-to-filter)
- Google Fonts CDN is allowed

## Current phase
**Phase 8** — Fixes & Improvements
- ISS toilet use detection: added retroactive use detection when flush is detected (checks if pre-flush level was above baseline)
- ISS toilet GH Actions cron reduced from `*/5` to `*/15` (~4,300 min/month instead of ~13,000)
- ISS toilet use/flush values now show `~` prefix and "(estimated)" to indicate polling-based approximation
- Earthquake cards: "Earthquakes in the Last Hour" and "Significant Quakes This Month" now have expandable browse lists (same as "Browse Recent Earthquakes")
- Fixed Arctic Sea Ice Extent card: API response changed from array to object keyed by `YYYYMM` (`data.arcticData.data`)
- Fixed Ocean Warming Anomaly card: API response changed from array to object keyed by year (`data.result`)
- Fixed World Bank CORS issues: added `credentials: 'omit'` to fetch handler to prevent Cloudflare cookie-based challenges
- NASA EONET: intermittently returns 503 (server-side issue, not a code bug)
- Card context indicators: every card's context text must end with a parenthetical time indicator — `(live)`, `(YYYY)`, `(DD-MM-YYYY)`, `(mon YYYY)`, `(yesterday)`, or `(unknown)`. No card should lack a time indicator. Dates use DD-MM-YYYY format (not YYYY-MM-DD). Month-year uses lowercase 3-letter month: `(mon YYYY)` (e.g. `(dec 2026)`).
- Freshness dot must match the context indicator. Cards fetching current/real-time data belong in `LIVE_CARDS` (in `js/utils/freshness.js`). Cards with historical/annual data belong in `OLD_CARDS`. Don't mark a card as `old` if the API returns current data.

## Known issues / TODO (note here when something can't be done yet)
- **Global fuel mix API (RESEARCHED — Step 36):** No free global real-time fuel mix API exists. Electricity Maps has global data but free tier is locked to 1 zone (no country picker). EIA API is US-focused and historical only. ENTSO-E is Europe-only. Ember is monthly/yearly aggregates, not real-time. Keeping UK-only via carbonintensity.org.uk with explicit "(UK)" labels on cards.
- **World GDP API (RESOLVED — Step 37):** Fixed World Bank API query to auto-fetch latest year instead of hardcoding 2023. Now shows 2024 data ($110.98T). IMF DataMapper API was researched but blocked by CORS (no `Access-Control-Allow-Origin` header). World Bank API is sufficient — it now has 2024 data and will auto-update as new years become available.
- **Country debt API (RESOLVED — Step 38):** No free global debt API with CORS support exists. IMF DataMapper has 75+ countries but is CORS-blocked. World Bank `GC.DOD.TOTL.GD.ZS` has CORS but very sparse coverage (~3 countries for 2024). Implemented US Treasury Fiscal Data API (`debt_to_penny`) instead — provides daily real-time US national debt, CORS-friendly, no API key needed. Card now shows "$38.87T" with date. Country picker not feasible.
- **COVID API (RESOLVED — Step 39):** No actively-updated free COVID API exists in 2026. disease.sh still returns valid cumulative totals but daily figures are permanently 0 (global tracking ended ~2023). Alternatives checked: covid-api.com (stopped March 2023), OWID GitHub (stopped Aug 2024), WHO GHO OData (only prison COVID indicators, no general stats). Kept disease.sh for final cumulative totals (704M cases, 7M deaths, 231 countries). Removed "Cases Today" and "Deaths Today" cards. Added "tracking ended" notice to COVID sub-category. Labels updated to say "(Final)".
- **API Expansion (Phase 6):** Added 8 new features — ISS position (Open Notify), NASA APOD, NASA EONET natural events, Arctic ice extent, Ocean warming anomaly, WAQI air quality (with city picker), World Bank demographics (literacy/internet/poverty), Wikipedia pageviews. Dead APIs skipped: Where The ISS At (DNS dead), N2O (404), OpenAQ (retired/needs key).
- **WAQI Air Quality:** Per-city only — no global aggregate endpoint exists. Uses auto-detected city from IP with searchable picker.
- **ISS Position (Open Notify):** HTTP-only API — may be blocked on HTTPS pages. Has error handling fallback.
- **N2O API (DEAD):** `global-warming.org/api/no2-api` returns 404 — endpoint no longer exists.
- **OpenAQ (DEAD):** v2 retired, v3 requires API key — skipped in favor of WAQI.
- **WHO GHO API (NOT VIABLE):** No CORS headers — blocked by browsers. Life expectancy data older (2021) than World Bank (2023). Not usable from client-side JS.
- **UNESCO UIS API:** Free, no key, CORS enabled. Base URL: `https://api.uis.unesco.org/api/public/data/indicators`. Global data via `geoUnit=SDG%3A%20World`. Education indicators have 2024-2025 data. Science indicators have 2023 data. Per-country support via ISO alpha-3 codes.
- **population.io:** Real-time daily world population at `https://d6wn6bmjj722w.population.io/1.0/population/World/today-and-tomorrow/`. Free, no key, CORS enabled. More current than World Bank annual data.
- **ISS Toilet Use Detection:** Uses post-flush baseline tracking + retroactive detection. GH Actions script (`scripts/iss-monitor.mjs`) compares tank level against `POST_FLUSH_LEVEL` stored in `TOILET_DATA.md`. When a flush is detected, also checks if pre-flush level was above baseline (retroactive use). Browser-side (`js/utils/iss-telemetry.js`) uses `tankBaseline` to catch gradual rises. Flush does NOT imply use — ISS WHC can auto-flush on schedule. Values shown with `~` prefix (estimated from 15-min polling).
- **GitHub Actions Budget:** ISS toilet monitor runs every 15 min (`*/15`, ~4,300 min/month). Free tier is 2,000 min/month — still over budget but manageable.
- **Global Warming API format changes:** Arctic API now returns `{ arcticData: { data: { "YYYYMM": { value, anom, monthlyMean } } } }`. Ocean API now returns `{ result: { "YEAR": { anomaly } } }`. Both were previously arrays.
- **Cloudflare CORS on World Bank:** `api.worldbank.org` uses Cloudflare bot management. Cookie-based challenges can strip CORS headers. Fixed by using `credentials: 'omit'` in fetch handler.
- **NASA EONET:** Intermittently returns 503. Server-side issue, no code fix needed.
