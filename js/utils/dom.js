export function $(selector) {
  return document.querySelector(selector);
}

export function $$(selector) {
  return [...document.querySelectorAll(selector)];
}

export function createSubCategory(title) {
  const col = document.createElement('div');
  col.className = 'col-12 sub-category';

  const label = document.createElement('h3');
  label.className = 'sub-category-label';
  label.textContent = title;

  col.appendChild(label);
  return col;
}

export function createCard({ id, label, featured }) {
  const col = document.createElement('div');
  col.className = 'col-12';

  const card = document.createElement('div');
  card.className = 'stat-card' + (featured ? ' featured' : '');
  card.id = id;
  card.dataset.state = 'loading';

  const labelId = id + '-label';

  const labelEl = document.createElement('div');
  labelEl.className = 'stat-label';
  labelEl.id = labelId;
  labelEl.textContent = label;

  const valueEl = document.createElement('div');
  valueEl.className = 'stat-value';
  valueEl.textContent = '\u00A0';

  // Screen-reader-only element that only receives the final value (not animation frames)
  const srAnnounce = document.createElement('span');
  srAnnounce.className = 'sr-only';
  srAnnounce.setAttribute('aria-live', 'polite');
  srAnnounce.setAttribute('aria-atomic', 'true');

  const contextEl = document.createElement('div');
  contextEl.className = 'stat-context';
  contextEl.textContent = '\u00A0';

  card.setAttribute('role', 'group');
  card.setAttribute('aria-labelledby', labelId);

  card.appendChild(labelEl);
  card.appendChild(valueEl);
  card.appendChild(srAnnounce);
  card.appendChild(contextEl);
  col.appendChild(card);

  return col;
}

export function updateCard(id, { value, context, contextClass, state }) {
  const card = document.getElementById(id);
  if (!card) return;

  card.dataset.state = state || 'success';

  if (value !== undefined) {
    const valEl = card.querySelector('.stat-value');
    if (valEl) valEl.textContent = value;
    // Announce final value to screen readers (not animation frames)
    const srEl = card.querySelector('.sr-only[aria-live]');
    if (srEl) srEl.textContent = value;
  }

  if (context !== undefined) {
    const ctxEl = card.querySelector('.stat-context');
    if (ctxEl) {
      ctxEl.textContent = context;
      ctxEl.className = 'stat-context';
      if (contextClass) {
        ctxEl.classList.add(contextClass);
      }
    }
  }
}

export function updateCardValue(id, element) {
  const card = document.getElementById(id);
  if (!card) return;
  card.dataset.state = 'success';
  const valEl = card.querySelector('.stat-value');
  if (!valEl) return;
  valEl.textContent = '';
  valEl.appendChild(element);
}

export function updateCardContext(id, element) {
  const card = document.getElementById(id);
  if (!card) return;
  const ctxEl = card.querySelector('.stat-context');
  if (!ctxEl) return;
  ctxEl.textContent = '';
  ctxEl.appendChild(element);
}

export function setCardError(id, retryFn) {
  const card = document.getElementById(id);
  if (!card) return;

  card.dataset.state = 'error';
  delete card.dataset.freshness;
  const freshBadge = card.querySelector('.stat-label .freshness-badge');
  if (freshBadge) freshBadge.remove();
  const valEl = card.querySelector('.stat-value');
  valEl.textContent = '';
  const alertSpan = document.createElement('span');
  alertSpan.setAttribute('role', 'alert');
  alertSpan.textContent = 'Data unavailable';
  valEl.appendChild(alertSpan);

  const ctxEl = card.querySelector('.stat-context');
  ctxEl.textContent = '';

  if (retryFn) {
    const btn = document.createElement('button');
    btn.className = 'retry-btn';
    btn.textContent = 'Retry';
    const labelText = card.querySelector('.stat-label');
    if (labelText) {
      btn.setAttribute('aria-label', `Retry loading ${labelText.textContent}`);
    }
    btn.addEventListener('click', retryFn);
    ctxEl.appendChild(btn);
  }
}

const FRESHNESS_ARIA = {
  live: 'Live data',
  recent: 'Recently updated',
  old: 'Historical data',
  cached: 'Serving cached data',
};

export function setCardFreshness(id, freshness) {
  const card = document.getElementById(id);
  if (!card) return;

  card.dataset.freshness = freshness;

  const label = card.querySelector('.stat-label');
  if (!label) return;

  // Remove existing freshness badge
  const existing = label.querySelector('.freshness-badge');
  if (existing) existing.remove();

  const badge = document.createElement('span');
  badge.className = 'freshness-badge freshness-badge--' + freshness;
  badge.textContent = freshness;
  badge.setAttribute('aria-label', FRESHNESS_ARIA[freshness] || freshness);
  label.appendChild(badge);
}

export function getCardValueEl(id) {
  const card = document.getElementById(id);
  if (!card) return null;
  return card.querySelector('.stat-value');
}

export function getCardContextEl(id) {
  const card = document.getElementById(id);
  if (!card) return null;
  return card.querySelector('.stat-context');
}
