"use strict";

import { fetchData } from '../utils/fetch-handler.js';
import { createCard, updateCard, setCardError } from '../utils/dom.js';

export const sectionId = 'health';

const WB_BASE = 'https://api.worldbank.org/v2/country/WLD/indicator';

export async function init() {
  const grid = document.querySelector('#health .card-grid');

  const cards = [
    { id: 'health-life-expectancy', label: 'Global Life Expectancy', featured: true },
    { id: 'health-child-mortality', label: 'Under-5 Mortality Rate' },
    { id: 'health-vaccination', label: 'Measles Vaccination Coverage' },
  ];

  for (const cfg of cards) {
    grid.appendChild(createCard(cfg));
  }

  await refresh();
}

export async function refresh() {
  await refreshGeneralHealth();
}

async function refreshGeneralHealth() {
  // World Bank API indicators for global health data
  const indicators = [
    {
      id: 'health-life-expectancy',
      code: 'SP.DYN.LE00.IN',
      format: (val) => val.toFixed(1) + ' years',
      context: (year) => `Global average, both sexes (${year})`,
      errorLabel: 'Life expectancy data unavailable',
    },
    {
      id: 'health-child-mortality',
      code: 'SH.DYN.MORT',
      format: (val) => val.toFixed(1),
      context: (year) => `Deaths per 1,000 live births (${year})`,
      errorLabel: 'Child mortality data unavailable',
    },
    {
      id: 'health-vaccination',
      code: 'SH.IMM.MEAS',
      format: (val) => val.toFixed(1) + '%',
      context: (year) => `Measles coverage, children 12-23 months (${year})`,
      errorLabel: 'Vaccination data unavailable',
    },
  ];

  const fetchPromises = indicators.map((indicator) =>
    fetchData(
      `${WB_BASE}/${indicator.code}?format=json&per_page=5&mrv=1`,
      { timeout: 15000 }
    )
  );

  const results = await Promise.all(fetchPromises);

  for (let i = 0; i < indicators.length; i++) {
    const indicator = indicators[i];
    const res = results[i];

    if (res.error) {
      setCardError(indicator.id, () => refreshGeneralHealth());
      continue;
    }

    // World Bank API returns [metadata, dataArray]
    const responseArray = res.data;
    if (!Array.isArray(responseArray) || responseArray.length < 2) {
      updateCard(indicator.id, {
        value: '—',
        context: indicator.errorLabel,
        state: 'error',
      });
      continue;
    }

    // Find the first entry with a non-null value
    const dataItems = responseArray[1];
    let found = null;
    if (Array.isArray(dataItems)) {
      for (const item of dataItems) {
        if (item.value !== null && item.value !== undefined) {
          found = item;
          break;
        }
      }
    }

    if (!found) {
      updateCard(indicator.id, {
        value: '—',
        context: indicator.errorLabel,
        state: 'error',
      });
      continue;
    }

    const val = Number(found.value);
    if (isNaN(val)) {
      updateCard(indicator.id, {
        value: '—',
        context: indicator.errorLabel,
        state: 'error',
      });
      continue;
    }

    updateCard(indicator.id, {
      value: indicator.format(val),
      context: indicator.context(found.date),
      state: 'success',
    });
  }
}
