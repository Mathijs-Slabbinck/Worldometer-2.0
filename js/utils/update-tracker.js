// Reads data/last-updated.json for cards that don't self-report dates.
// Returns the year for a given card ID, or a fallback if unavailable.

let trackerData = null;
let fetchPromise = null;

function loadTracker() {
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch('data/last-updated.json')
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      trackerData = data;
      return data;
    })
    .catch(() => {
      trackerData = { cards: {} };
      return trackerData;
    });
  return fetchPromise;
}

export async function getTrackerYear(cardId, fallback) {
  await loadTracker();
  const card = trackerData.cards[cardId];
  if (card && card.year) return card.year;
  return fallback || 'unknown';
}
