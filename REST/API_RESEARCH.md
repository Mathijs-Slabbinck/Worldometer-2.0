# Worldometer 2.0 — API Reference (Real-World Data Only)

Research compiled: March 2026
All APIs are FREE or have generous free tiers. No filler (quotes, jokes, trivia, animal pics).

---

## 1. SPACE & ASTRONOMY

### Open Notify — People in Space
- Endpoint: http://api.open-notify.org/astros.json
- Key: No | CORS: Yes | Rate Limit: None
- Returns: `{ number: 10, people: [{ name, craft }] }`
- Display: Hero counter "X People in Space Right Now" + crew list

### Where The ISS At — Real-Time ISS Tracking
- Endpoint: https://api.wheretheissat.at/v1/satellites/25544
- Key: No | CORS: Yes
- Returns: `{ latitude, longitude, altitude, velocity, visibility }`
- Display: ISS Speed (km/h), Altitude (km), Lat/Lon

### NASA NeoWs — Near-Earth Asteroids
- Endpoint: https://api.nasa.gov/neo/rest/v1/feed?start_date=YYYY-MM-DD&api_key=DEMO_KEY
- Key: DEMO_KEY (30/hour) or free registered key (1000/hour)
- CORS: Yes
- Returns: `{ element_count, near_earth_objects: { "date": [{ name, estimated_diameter, close_approach_data }] } }`
- Display: "X Asteroids This Week", closest approach, largest diameter

### Launch Library 2 — Upcoming Rocket Launches
- Endpoint: https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=3&mode=detailed
- Key: No (15 req/hour free) | CORS: Yes
- Returns: `{ results: [{ name, net, rocket, launch_service_provider, status, window_start }] }`
- Display: Next Launch Countdown (d:h:m:s), mission name, rocket, provider

### SpaceX API — Next SpaceX Launch
- Endpoint: https://api.spacexdata.com/v4/launches/next
- Key: No | CORS: Yes | Rate Limit: 50/sec
- Returns: `{ name, date_utc, flight_number, details, rocket }`
- Display: Next SpaceX launch name, date, flight number

### NASA DONKI — Solar Flares
- Endpoint: https://api.nasa.gov/DONKI/FLR?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&api_key=DEMO_KEY
- Key: DEMO_KEY | CORS: Yes
- Returns: `[{ flrID, classType ("M1.2","X2.1"), beginTime, peakTime }]`
- Display: "X Solar Flares This Month", most recent class (C < M < X severity)

### NASA APOD — Astronomy Picture of the Day (expansion)
- Endpoint: https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY
- Display: Daily science image with explanation

### NASA EONET — Active Natural Events (expansion)
- Endpoint: https://eonet.gsfc.nasa.gov/api/v3/events?status=open
- Display: Active wildfires, storms, volcanoes worldwide

---

## 2. EARTH & SEISMOLOGY

### USGS Earthquake — Last Hour
- Endpoint: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson
- Key: No | CORS: Yes | Updated: every minute
- Returns: GeoJSON FeatureCollection `{ metadata: { count }, features: [{ properties: { mag, place, time } }] }`
- Display: "X Earthquakes in the Last Hour", strongest magnitude + location

### USGS Earthquake — Significant This Month
- Endpoint: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson
- Same format, filtered to significant events (mag 6+ or high impact)
- Display: "X Significant Quakes This Month" + top 3 list

### Open-Meteo — Weather Forecast
- Endpoint: https://api.open-meteo.com/v1/forecast?latitude=LAT&longitude=LON&current_weather=true
- Key: No | CORS: Yes | Rate Limit: 10,000/day
- Returns: `{ current_weather: { temperature, windspeed, winddirection, weathercode, time } }`
- Display: Weather at visitor's location (auto-detected via IP geolocation)

### IP-API / FreeIPAPI — Visitor Geolocation
- IP-API: http://ip-api.com/json/ (HTTP only free, 45/min)
- FreeIPAPI: https://freeipapi.com/api/json (HTTPS, 60/min)
- Returns: `{ city, country, lat, lon }`
- Used to feed coordinates to Open-Meteo

---

## 3. CLIMATE & ENERGY

### Global Warming API — CO2 Levels
- Endpoint: https://global-warming.org/api/co2-api
- Key: No | CORS: Yes
- Returns: Array of `{ year, month, day, cycle, trend }` — last entry = most recent
- Display: Hero: "Current CO2: 425.3 ppm", "+2.1 ppm vs last year"
- Notes: NOAA data. Sometimes 504 — cache last good value.

### Global Warming API — Methane Levels
- Endpoint: https://global-warming.org/api/methane-api
- Returns: Array of `{ date, average, trend }`
- Display: "Atmospheric Methane: 1923 ppb"

### Global Warming API — Temperature Anomaly
- Endpoint: https://global-warming.org/api/temperature-api
- Returns: Array of `{ time, station, land }`
- Display: "Temperature Anomaly: +1.3°C" (color coded)

### Global Warming API — Additional (expansion)
- /api/no2-api — Nitrous oxide levels
- /api/arctic-api — Arctic ice extent
- /api/ocean-warming-api — Ocean warming data

### Carbon Intensity UK — Current Intensity
- Endpoint: https://api.carbonintensity.org.uk/intensity
- Key: No | CORS: Yes
- Returns: `{ data: [{ intensity: { forecast, actual, index } }] }`
- Display: "UK Grid: 217 gCO2/kWh" + low/moderate/high badge

### Carbon Intensity UK — Generation Mix
- Endpoint: https://api.carbonintensity.org.uk/generation
- Returns: `{ data: { generationmix: [{ fuel, perc }] } }`
- Display: Stacked bar: gas, coal, nuclear, wind, solar, biomass, hydro, imports

### OpenAQ — Global Air Quality (expansion)
- Endpoint: https://api.openaq.org/v2/latest?limit=10&order_by=lastUpdated
- Key: Free registration for v3 | CORS: Yes

### WAQI — World Air Quality Index (expansion)
- Endpoint: https://api.waqi.info/feed/{city}/?token=TOKEN
- Key: Free token required

---

## 4. ECONOMY & CRYPTO

### CoinGecko — Global Crypto Market
- Endpoint: https://api.coingecko.com/api/v3/global
- Key: No (rate limited ~10-30/min) | CORS: Yes
- Returns: `{ data: { active_cryptocurrencies, markets, total_market_cap: { usd }, market_cap_change_percentage_24h_usd, market_cap_percentage: { btc, eth } } }`
- Display: Hero: "Crypto Market Cap: $2.69T", 24h change %, active cryptos

### CoinLore — Global Crypto Stats
- Endpoint: https://api.coinlore.net/api/global/
- Key: No | CORS: Yes
- Returns: `[{ coins_count, active_markets, total_mcap, total_volume, btc_d, eth_d }]`
- Display: BTC/ETH Dominance, backup for CoinGecko

### Frankfurter — Currency Exchange Rates
- Endpoint: https://api.frankfurter.dev/v1/latest?base=USD
- Key: No | CORS: Yes
- Returns: `{ base, date, rates: { EUR, GBP, JPY, CNY, ... } }`
- Display: Key exchange rates table vs USD

### Mempool.space — Bitcoin Mempool
- Endpoint: https://mempool.space/api/mempool
- Key: No | CORS: Yes
- Returns: `{ count, vsize, total_fee }`
- Display: "21,009 unconfirmed BTC transactions"

### Mempool.space — Bitcoin Hashrate
- Endpoint: https://mempool.space/api/v1/mining/hashrate/1m
- Returns: `{ currentHashrate, currentDifficulty }`
- Display: Network hashrate (format to EH/s or ZH/s)

---

## 5. WORLD POPULATION & DEMOGRAPHICS

### disease.sh — World Population (from COVID endpoint)
- Endpoint: https://disease.sh/v3/covid-19/all
- Key: No | CORS: Yes
- Returns: `{ population: 7944935131, ... }`
- Display: Hero: ticking population counter (+~2.5/sec net birth rate)

### REST Countries — Country Data
- Endpoint: https://restcountries.com/v3.1/all?fields=name,population,region,area
- Key: No | CORS: Yes
- Returns: Array of 250 countries with name, population, region, area
- Display: "250 Countries", most populous, largest by area

### World Bank — World GDP
- Endpoint: https://api.worldbank.org/v2/country/WLD/indicator/NY.GDP.MKTP.CD?format=json&date=2023&per_page=1
- Key: No | CORS: Yes
- Returns: `[metadata, [{ value, date }]]`
- Display: "World GDP: $105T" (lags 1-2 years)

### US Treasury — National Debt (Debt to the Penny)
- Endpoint: https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1
- Key: No | CORS: Yes | Updated: daily (business days)
- Returns: `{ data: [{ record_date, debt_held_public_amt, intragov_hold_amt, tot_pub_debt_out_amt }] }`
- Display: "US National Debt: $38.87T" with record date
- Notes: US-only. No free global debt API with CORS exists (IMF DataMapper is CORS-blocked, World Bank indicator has sparse coverage).

### World Bank — Additional Indicators (expansion)
- Life expectancy: SP.DYN.LE00.IN
- Literacy rate: SE.ADT.LITR.ZS
- Internet users: IT.NET.USER.ZS
- Poverty headcount: SI.POV.DDAY

---

## 6. HEALTH

### disease.sh — Global Disease Stats
- Endpoint: https://disease.sh/v3/covid-19/all
- Key: No | CORS: Yes
- Returns: `{ cases, todayCases, deaths, todayDeaths, recovered, active, critical, tests, affectedCountries }`
- Display: Global cases, deaths, recovered, active + today's numbers
- Notes: todayCases/todayDeaths reset at midnight UTC

### WHO GHO API (expansion)
- Endpoint: https://ghoapi.azureedge.net/api/
- Complex API with thousands of indicators
- Could add: life expectancy, disease burden stats

---

## 7. TRANSPORTATION

### OpenSky Network — Live Flights
- Endpoint: https://opensky-network.org/api/states/all
- Key: No (anonymous 10/min) | CORS: Yes
- Returns: `{ time, states: [[icao24, callsign, origin_country, ..., on_ground, velocity]] }`
- Display: "X Flights in the Air Right Now"
- CAUTION: Large payload (5-10MB). Use 15s timeout.
- Fallback: Regional query ?lamin=35&lomin=-10&lamax=60&lomax=30 (Europe)

---

## 8. TRENDING NOW

### Hacker News — Top Stories
- IDs: https://hacker-news.firebaseio.com/v0/topstories.json
- Item: https://hacker-news.firebaseio.com/v0/item/{id}.json
- Key: No | CORS: Yes
- Returns: IDs array (500), then per item: `{ title, url, score, by, descendants, time }`
- Display: Top 5 tech stories with title, score, comments

### Wikipedia Pageviews (expansion)
- Most viewed articles: real-time trend data

---

## TECHNICAL NOTES

### NASA API Key
- DEMO_KEY: 30/hour, 50/day (fine for testing)
- Register free at https://api.nasa.gov for 1000/hour

### Rate Limiting Strategy
- NASA (DEMO_KEY): refresh every 5min, cache aggressively
- CoinGecko: refresh 60s, back off to 5min on 429
- OpenSky: refresh 30s, 15s timeout, regional fallback
- Launch Library: refresh 5min (15/hour limit)
- Everything else: generous/unlimited

### CORS Issues
- IP-API free = HTTP only → use FreeIPAPI as HTTPS fallback
- OpenSky may need proxy in some cases
- Safari needs -webkit-backdrop-filter prefix

### Large Responses
- OpenSky /states/all: 5-10MB → lazy load when section visible
- REST Countries /all: ~250KB → call once, cache in memory
- Global Warming APIs: ~100KB each → cache, updates infrequently
