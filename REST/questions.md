# Questions about ideas.md

## Space & Astronomy

1. **"Place in sub-categories"** — What sub-categories do you want? E.g., group cards into "ISS", "Near-Earth Objects", "Launches", "Solar Activity"? Or something else?
1 CA. group cards into eg. "ISS", "Near-Earth Objects", "Launches", "Solar Activity" (but for each section)

2. **"Create link to next launch"** — Link to where? The SpaceDevs launch page? Or some other site?
2 CA. the link to the site with info about the launch (if possible)

3. **"Make astronaut names clickable"** — Clickable to go where? Wikipedia page for each astronaut? Or a popup with more info?
3 CA. open model with name, birthday, country, total mission count (expandable list (dropdown) of mission names (clickable, goes to info site / page (for example wikipedia unless there is official) about the mission)), diploma's, wikipedia page, ... (whatever we can show). If model not possible => wikipedia page

4. **"Solar flares clickable to see details"** — What details? Expand to show a list of recent flares with class/date? Or link to an external NASA page?
4 CA. expandable list (dropdown) of names of solar flares (clickable) => clicking opens modal with info (image, name, size, time, ... (whatever we can show))

5. **"Last Toilet Use on startup = just now"** — I see the toilet telemetry uses real-time Lightstreamer data. Should I just hide the "last use" time until an actual event is
detected (instead of defaulting to "just now")?
5 CA. Can we show an actual timestamp?

6. **"Verify if last flush works"** — I'll investigate the flush detection logic. If it's broken, should I fix the threshold or just note it?
6 CA. Note it, if you CAN apply a fix, fix it

7. **"ISS Urine Tank Level show double value"** — You want it to show e.g. `41.5%` instead of toggling between `41%` and `42%`? (i.e., more decimal precision)
7 CA. yes


## Earth & Seismology

8. **"Show avg worldwide temperature"** — Average global temperature from which source? Open-Meteo global average, or the Global Warming API temperature anomaly (already in Climate section)?
8 CA. Whatever is most accurate / up to date

9. **"Show temp at location — selectable per location"** — How should the location picker work? A dropdown of major cities? A search box? Just a text input where you type a city name?
9 CA. What is most user friendly

10. **"Make earthquakes clickable"** — Click to show what? USGS event detail page in a new tab? Or an inline expansion with more info (depth, time, coordinates)?
10 CA. expandable list (dropdown) with earthquake names, when one is selected other subinfo blocks (with info like name, depth, time, coordinates, place, ... (whatever we can show)) will update (so we'll need an earthquakes sub-category for this)


## Climate & Energy

11. **"Electricity Fuel Mix / Grid Carbon Intensity — Pick country"** — The current API (carbonintensity.org.uk) is UK-only. Do you want me to find a free global API for this (like Electricity Maps, which needs a free key), or just add a note that it's UK-only and skip the selector for now?
11 CA. Try to find a global one, if you find one implement it, if not, just note it down for later (in local CLAUDE.md)


## Economy & Crypto

12. **"Move world GDP here"** — Simple move from Population to Economy section, correct?
12 CA. yes

13. **"More updated world GDP API"** — Any preference? The World Bank API is the most reliable free source but lags ~1-2 years. Alternatives are limited for free APIs.
13 CA. See if you can find a better alternative, if yes, implemet it, if not, note it down for later as well (in local CLAUDE.md)

14. **"Country debt live count"** — Do you have a specific API in mind? Free real-time national debt APIs are rare. There are some estimates-based approaches but they won't be truly "live."
14 CA. See if you can find an API for this, if yes, implemet it, if not, note it down for later as well (in local CLAUDE.md) (unless we can use https://debtclock.io/ and fetch from there?)


## World Population
15. **"Daily deaths / daily births — selectable per country"** — Same question about the picker: dropdown of countries? Search box? How should the UI for country selection look?
15 CA. expandable list (dropdown) for country picker (or global); will update other related blocks (deaths / births / population / ...)

16. **"Most Populous Country — describe better"** — What would you like it to say? Something like "Most Populous Country (by total population)" vs "Most Densely Populated"? Or show both?
16 CA. both Most Densely Populated and Most Populous Country

## Health
17. **"Describe better / make COVID a subsection"** — What additional health data do you want? WHO disease stats? Life expectancy? General mortality? I need to know what non-COVID health stats to add.
17 CA. I feel like all info now is covid-related; but this isn't clear from the GUI since it all falls under 'health', so we need a health category with a COVID subsection for the covid data. For additional health, whatever we can get our hands on (public API's)

18. **"Verify data is accurate (Cases Today = 0)"** — The disease.sh API may have stopped updating. Should I find an alternative COVID API, or just note that COVID tracking has wound down and pivot the section to other health data?
18 CA. See if you can find an alternative, if not, just note it down (in CLAUDE.md) for later


## General
19. **"Make font size scale with screen size"** — The CSS already uses `clamp()` for stat values. Do you want *all* text (labels, context, nav) to also scale? Or is there a specific element that feels too small/large?
19 CA. I mean currently not all numbers fit the blocks ("C:\Users\yolow\Pictures\Screenshots\Screenshot 2026-03-09 154618.png") this should be solved by making the blocks take the full page, but if we use vh as size it will always be fixed for sure

20. **"Show all info in a block that takes full width"** — Do you mean make every card full-width (single column layout)? Or make the entire section container edge-to-edge (no max-width)?
20 CA. currently, sections for like "Global COVID-19 Cases", "World Population", "Crypto Market Cap", etc etc. take in the fill width while blocks like "BTC Dominancee, "ETH Dominance", "Countries in the World" etc etc are small (before: ("C:\Users\yolow\Pictures\Screenshots\Screenshot 2026-03-09 155152.png") | after: ("C:\Users\yolow\Pictures\Screenshots\Screenshot 2026-03-09 155208.png")) We also don't use bootstrap for this right now, I feel like using row and col-12 is way better for future expandability