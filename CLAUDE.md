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
**Phase 5** — API Research & Integration (Steps 36-40)
Next step: **Step 40**

## Known issues / TODO (note here when something can't be done yet)
- **Global fuel mix API (RESEARCHED — Step 36):** No free global real-time fuel mix API exists. Electricity Maps has global data but free tier is locked to 1 zone (no country picker). EIA API is US-focused and historical only. ENTSO-E is Europe-only. Ember is monthly/yearly aggregates, not real-time. Keeping UK-only via carbonintensity.org.uk with explicit "(UK)" labels on cards.
- **World GDP API (RESOLVED — Step 37):** Fixed World Bank API query to auto-fetch latest year instead of hardcoding 2023. Now shows 2024 data ($110.98T). IMF DataMapper API was researched but blocked by CORS (no `Access-Control-Allow-Origin` header). World Bank API is sufficient — it now has 2024 data and will auto-update as new years become available.
- **Country debt API (RESOLVED — Step 38):** No free global debt API with CORS support exists. IMF DataMapper has 75+ countries but is CORS-blocked. World Bank `GC.DOD.TOTL.GD.ZS` has CORS but very sparse coverage (~3 countries for 2024). Implemented US Treasury Fiscal Data API (`debt_to_penny`) instead — provides daily real-time US national debt, CORS-friendly, no API key needed. Card now shows "$38.87T" with date. Country picker not feasible.
- **COVID API (RESOLVED — Step 39):** No actively-updated free COVID API exists in 2026. disease.sh still returns valid cumulative totals but daily figures are permanently 0 (global tracking ended ~2023). Alternatives checked: covid-api.com (stopped March 2023), OWID GitHub (stopped Aug 2024), WHO GHO OData (only prison COVID indicators, no general stats). Kept disease.sh for final cumulative totals (704M cases, 7M deaths, 231 countries). Removed "Cases Today" and "Deaths Today" cards. Added "tracking ended" notice to COVID sub-category. Labels updated to say "(Final)".
