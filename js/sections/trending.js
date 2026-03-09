import { fetchData } from '../utils/fetch-handler.js';
import { relativeTime } from '../utils/time.js';
import { createCard, updateCard, setCardError, setCardStale, getCardValueEl } from '../utils/dom.js';

export const sectionId = 'trending';

export async function init() {
  const grid = document.querySelector('#trending .card-grid');
  grid.appendChild(createCard({ id: 'trending-stories', label: 'Top Tech Stories Right Now', featured: true }));
  await refresh();
}

export async function refresh() {
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
  list.setAttribute('role', 'list');

  for (const story of stories) {
    const li = document.createElement('li');

    const titleLink = document.createElement('a');
    titleLink.className = 'story-title';
    titleLink.textContent = story.title || 'Untitled';
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
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
  if (card) card.dataset.state = idsRes.stale ? 'stale' : 'success';
  if (idsRes.stale) setCardStale('trending-stories');
}
