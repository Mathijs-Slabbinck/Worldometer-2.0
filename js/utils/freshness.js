/**
 * Data freshness mapping for cards.
 *
 * Four states:
 *   live   — real-time data (WebSocket, ticking counter)
 *   recent — successfully fetched this session, data is current
 *   old    — historical / annual data (months or years old)
 *   cached — fetch failed, serving previously cached data
 */

const LIVE_CARDS = new Set([
  'space-iss-toilet',
  'space-iss-flush',
  'space-iss-speed',
  'space-iss-altitude',
  'space-iss-position',
  'space-solar-flares',
  'space-asteroids',
  'space-hazardous',
  'pop-world',
  'earth-weather',
  'earth-events',
  'earth-quakes-hour',
  'earth-quakes-significant',
  'earth-quakes-browse',
  'climate-aqi',
  'climate-carbon',
  'climate-fuelmix',
  'econ-marketcap',
  'econ-btc-dom',
  'econ-eth-dom',
  'econ-mempool',
  'econ-hashrate',
  'trending-stories',
  'space-apod',
  'econ-debt',
]);

const OLD_CARDS = new Set([
  'space-people',
  'space-next-launch',
  'transport-flights',
  'space-satellites',
  'space-starlink',
  'space-sat-launched',
  'space-sat-decayed',
  'space-sat-failures',
  'space-starlink-total',
  'space-starlink-decayed',
  'space-starlink-failures',
  'space-rocket-bodies',
  'space-debris',
  'space-unknown',
  'econ-gdp',
  'pop-most-populous',
  'pop-dense',
  'pop-countries',
  'pop-largest',
  'pop-births',
  'pop-deaths',
  'pop-literacy',
  'pop-internet',
  'pop-poverty',
  'pop-out-of-school',
  'pop-completion-primary',
  'pop-completion-secondary',
  'pop-completion-upper',
  'pop-tertiary',
  'pop-researchers',
  'pop-rd-spending',
  'health-life-expectancy',
  'health-child-mortality',
  'health-vaccination',
  'econ-gold',
  'econ-inflation',
  'econ-unemployment',
  'climate-co2',
  'climate-methane',
  'climate-temp',
  'climate-arctic',
  'climate-ocean',
]);

/**
 * Determine the freshness state for a card.
 * @param {string} id - Card ID
 * @param {boolean} stale - Whether the fetch returned cached/stale data
 * @returns {'live'|'recent'|'old'|'cached'}
 */
export function getFreshness(id, stale) {
  if (stale) return 'cached';
  if (LIVE_CARDS.has(id)) return 'live';
  if (OLD_CARDS.has(id)) return 'old';
  return 'recent';
}
