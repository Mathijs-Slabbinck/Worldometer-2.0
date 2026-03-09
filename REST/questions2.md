# Follow-up Questions

## Layout (Q19 & Q20) — Most important, affects everything else

21. **Bootstrap switch** — You want to add Bootstrap CDN and refactor the grid to use `row`/`col-12`/`col-6`/etc.? This is a big refactor that touches every section. Should I do this **first** before all other changes? (I think yes — it'll make everything else easier.)
21 CA. yes (I added "C:\Users\yolow\Desktop\worldometer 2\css\bootstrap.min.css" to the project)

22. **Screenshot Q19** — Can you describe what's overflowing? Is it large numbers (like world population `8,123,456,789`) being too wide for the card? Or is it labels/text wrapping badly?
22 CA. Text is too big for the card it is in ("C:\Users\yolow\Pictures\Screenshots\Screenshot 2026-03-09 154618.png") (but this will most likely be fixed due to the blocks getting bigger width later)


23. **Screenshot Q20** — I understand the concept: you want *all* cards to be full-width (like the hero cards), not the current mix of full-width heroes + smaller grid cards. Is that right? So every stat gets its own full-width row?
23 CA. Yes

## Sub-categories (Q1)

24. **"But for each section"** — You want sub-category groupings in every section. Can you confirm these make sense?
   - **Space:** ISS | Near-Earth Objects | Launches | Solar Activity - CA. yes
   - **Earth:** Earthquakes | Weather - CA. yes
   - **Climate:** Atmosphere | Energy Grid - CA. yes (maybe emissions / energy ?)
   - **Economy:** Crypto | Forex | Macro (GDP, debt) - CA. sure
   - **Population:** Global Stats | Country Stats - CA. Just do "population" and have a expandable list (dropdown) with countries (standard = global). Users can pick one => all related stats update
   - **Health:** COVID-19 | General Health - CA. yes
   - **Transport:** (only 1 stat — skip sub-categories?) - CA. yes
   - **Trending:** (only HN stories — skip?) - CA. What do you mean?

## Modals & Expandable Lists (Q3, Q4, Q10)

25. **Shared design** — Astronaut modal, solar flare modal, earthquake detail panel — should these all share the same modal/expandable component style? (I'll build one reusable modal + one reusable dropdown-list component.)
25 CA. Depends, if possible, yes, if it's easier to give em all a modal, do that (for example, not everything has an image etc, may be simpeler to do different modals then)

## Scope / Priority

26. **This is a LOT of work.** Do you want me to tackle it in phases? My suggested order:
   1. **Phase 1:** Bootstrap grid refactor + full-width cards + font scaling fix (General Q19/Q20)
   2. **Phase 2:** Sub-categories for all sections (Q1)
   3. **Phase 3:** Modals & expandable lists (astronauts, solar flares, earthquakes)
   4. **Phase 4:** New data (GDP move, country debt, births/deaths, health restructure, global temp, location picker)
   5. **Phase 5:** API research tasks (global fuel mix, better GDP API, COVID alternative, debt API)

   Or do you have a different priority?

26 CA. This is fine, can we make sure claude only does phase per phase? Last time it did all steps at once even tho the plan had different phases (check "C:\Users\yolow\Desktop\worldometer 2\CLAUDE.md", "C:\Users\yolow\Desktop\worldometer 2\plan.md" to know what I mean)



# EXTRA CA.
- when I talk about expandable list (dropdown), make it so the user can also type and it will search (for example "be" => picker goes to belgium (makes it easier to search than just only being able to scroll))