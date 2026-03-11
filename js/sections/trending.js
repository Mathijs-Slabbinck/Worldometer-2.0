import { fetchData } from '../utils/fetch-handler.js';
import { formatNumber } from '../utils/format.js';
import { relativeTime } from '../utils/time.js';
import { createCard, createSubCategory, updateCard, setCardError, setCardFreshness, getCardValueEl } from '../utils/dom.js';
import { getFreshness } from '../utils/freshness.js';

export const sectionId = 'trending';

// Pages to filter out from Wikipedia top articles
const WIKI_FILTER = ['Main_Page', 'Special:', 'File:', 'Portal:', 'Wikipedia:', '.xxx', 'XHamster', 'Pornhub'];

export async function init() {
  const grid = document.querySelector('#trending .card-grid');

  grid.appendChild(createSubCategory('Tech'));
  grid.appendChild(createCard({ id: 'trending-stories', label: 'Top Tech Stories Right Now', featured: true }));

  grid.appendChild(createSubCategory('Wikipedia'));
  grid.appendChild(createCard({ id: 'trending-wiki', label: 'Most Viewed Wikipedia Articles', featured: true }));

  await refresh();
}

export async function refresh() {
  // Fetch HN and Wikipedia in parallel
  // Wikipedia pageviews API often has a 1-2 day delay, so try yesterday first,
  // then fall back to 2 days ago if yesterday returns an error/404
  const results = await Promise.allSettled([
    fetchHackerNews(),
    fetchWikipedia(),
  ]);

  // HN is handled inside fetchHackerNews
  // Wikipedia is handled inside fetchWikipedia
}

async function fetchWikipedia() {
  const yesterday = getDaysAgo(1);
  const wikiUrl = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${yesterday.year}/${yesterday.month}/${yesterday.day}`;

  const res = await fetchData(wikiUrl, { retries: 0 });

  if (!res.error && res.data && res.data.items && res.data.items.length > 0) {
    renderWikipedia(res.data, res.stale, 'yesterday');
    return;
  }

  // Fallback: try 2 days ago (API data is often delayed)
  const twoDaysAgo = getDaysAgo(2);
  const fallbackUrl = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${twoDaysAgo.year}/${twoDaysAgo.month}/${twoDaysAgo.day}`;

  const fallbackRes = await fetchData(fallbackUrl, { retries: 0 });

  if (!fallbackRes.error && fallbackRes.data && fallbackRes.data.items && fallbackRes.data.items.length > 0) {
    renderWikipedia(fallbackRes.data, fallbackRes.stale, `${twoDaysAgo.day}-${twoDaysAgo.month}-${twoDaysAgo.year}`);
    return;
  }

  setCardError('trending-wiki', () => refresh());
}

async function fetchHackerNews() {
  const idsRes = await fetchData('https://hacker-news.firebaseio.com/v0/topstories.json');

  if (idsRes.error || !idsRes.data) {
    setCardError('trending-stories', () => refresh());
    return;
  }

  const topIds = idsRes.data.slice(0, 5);
  const storyResults = await Promise.allSettled(
    topIds.map(id => fetchData(`https://hacker-news.firebaseio.com/v0/item/${id}.json`))
  );

  const stories = [];
  for (const r of storyResults) {
    if (r.status === 'fulfilled' && !r.value.error && r.value.data) {
      stories.push(r.value.data);
    }
  }

  if (stories.length === 0) {
    setCardError('trending-stories', () => refresh());
    return;
  }

  const valEl = getCardValueEl('trending-stories');
  if (!valEl) return;

  valEl.textContent = '';
  valEl.classList.add('stat-value--embed');

  const list = document.createElement('ol');
  list.className = 'story-list';

  for (const story of stories) {
    const li = document.createElement('li');

    const titleLink = document.createElement('a');
    titleLink.className = 'story-title';
    titleLink.textContent = story.title || 'Untitled';
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.setAttribute('aria-label', `${story.title || 'Untitled'} (opens in new tab)`);
    if (story.url) {
      titleLink.href = story.url;
    } else {
      titleLink.href = `https://news.ycombinator.com/item?id=${story.id}`;
    }

    const meta = document.createElement('div');
    meta.className = 'story-meta';
    const score = story.score || 0;
    const comments = story.descendants || 0;
    const time = story.time ? relativeTime(story.time * 1000) : '';
    meta.textContent = `${score} pts | ${comments} comments | ${time}`;

    li.appendChild(titleLink);
    li.appendChild(meta);
    list.appendChild(li);
  }

  valEl.appendChild(list);

  const card = document.getElementById('trending-stories');
  if (card) card.dataset.state = 'success';
  updateCard('trending-stories', { context: 'Top stories from Hacker News (live)', state: 'success' });
  setCardFreshness('trending-stories', getFreshness('trending-stories', idsRes.stale));
}

function renderWikipedia(data, stale, dateLabel) {
  const items = data && data.items && data.items.length > 0 ? data.items[0].articles : [];

  // Filter out non-article pages
  const filtered = items.filter(function (article) {
    const name = article.article || '';
    for (const pattern of WIKI_FILTER) {
      if (name.includes(pattern)) return false;
    }
    return true;
  });

  const top10 = filtered.slice(0, 10);

  if (top10.length === 0) {
    setCardError('trending-wiki', () => refresh());
    return;
  }

  const valEl = getCardValueEl('trending-wiki');
  if (!valEl) return;

  valEl.textContent = '';
  valEl.classList.add('stat-value--embed');

  const list = document.createElement('ol');
  list.className = 'story-list';

  for (let i = 0; i < top10.length; i++) {
    const article = top10[i];
    const name = (article.article || '').replace(/_/g, ' ');
    const views = article.views || 0;

    const li = document.createElement('li');
    li.className = 'wiki-item';

    const rank = document.createElement('span');
    rank.className = 'wiki-rank';
    rank.textContent = `${i + 1}.`;
    rank.setAttribute('aria-label', `Ranked ${i + 1}`);

    const titleLink = document.createElement('a');
    titleLink.className = 'story-title wiki-title';
    titleLink.textContent = name;
    titleLink.href = `https://en.wikipedia.org/wiki/${encodeURIComponent(article.article)}`;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.setAttribute('aria-label', `${name} on Wikipedia (opens in new tab)`);

    const viewSpan = document.createElement('span');
    viewSpan.className = 'wiki-views';
    viewSpan.textContent = formatNumber(views) + ' views';

    li.appendChild(rank);
    li.appendChild(titleLink);
    li.appendChild(viewSpan);
    list.appendChild(li);
  }

  valEl.appendChild(list);

  const card = document.getElementById('trending-wiki');
  if (card) card.dataset.state = 'success';

  updateCard('trending-wiki', {
    context: `Most viewed English Wikipedia articles (${dateLabel || 'yesterday'})`,
    state: 'success',
  });
  setCardFreshness('trending-wiki', getFreshness('trending-wiki', stale));
}

function getDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return {
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1).padStart(2, '0'),
    day: String(d.getDate()).padStart(2, '0'),
  };
}
