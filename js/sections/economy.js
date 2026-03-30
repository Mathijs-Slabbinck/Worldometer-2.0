"use strict";
import { fetchData } from '../utils/fetch-handler.js';
import { formatCurrency, formatPercent, formatNumber, abbreviate } from '../utils/format.js';
import { createCard, createSubCategory, updateCard, setCardError, setCardFreshness, getCardValueEl } from '../utils/dom.js';
import { getFreshness } from '../utils/freshness.js';
import { CountUp } from '../utils/counter.js';
import { reverseDateStr } from '../utils/time.js';

export const sectionId = 'economy';

const counters = {};

export async function init() {
  const grid = document.querySelector('#economy .card-grid');

  const groups = [
    {
      title: 'Crypto',
      cards: [
        { id: 'econ-marketcap', label: 'Crypto Market Cap', featured: true },
        { id: 'econ-btc-dom', label: 'BTC Dominance' },
        { id: 'econ-eth-dom', label: 'ETH Dominance' },
        { id: 'econ-mempool', label: 'BTC Unconfirmed Transactions' },
        { id: 'econ-hashrate', label: 'BTC Network Hashrate' },
      ],
    },
    {
      title: 'Forex',
      cards: [
        { id: 'econ-forex', label: 'Exchange Rates (vs USD)', featured: true },
      ],
    },
    {
      title: 'Macro',
      cards: [
        { id: 'econ-gdp', label: 'World GDP' },
        { id: 'econ-debt', label: 'US National Debt' },
        { id: 'econ-inflation', label: 'World Inflation Rate' },
        { id: 'econ-unemployment', label: 'World Unemployment Rate' },
      ],
    },
    {
      title: 'Commodities',
      cards: [
        { id: 'econ-gold', label: 'Gold Price' },
      ],
    },
  ];

  for (const group of groups) {
    grid.appendChild(createSubCategory(group.title));
    for (const cfg of group.cards) {
      grid.appendChild(createCard(cfg));
    }
  }

  await refresh();
}

export async function refresh() {
  const [
    cryptoMarketResult,
    coinloreResult,
    forexResult,
    mempoolResult,
    hashrateResult,
    gdpResult,
    debtResult,
    goldResult,
    inflationResult,
    unemploymentResult,
  ] = await Promise.allSettled([
    fetchData('https://api.coingecko.com/api/v3/global'),
    fetchData('https://api.coinlore.net/api/global/'),
    fetchData('https://api.frankfurter.dev/v1/latest?base=USD'),
    fetchData('https://mempool.space/api/mempool'),
    fetchData('https://mempool.space/api/v1/mining/hashrate/1m'),
    fetchData('https://api.worldbank.org/v2/country/WLD/indicator/NY.GDP.MKTP.CD?format=json&per_page=5'),
    fetchData('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1'),
    fetchData('https://freegoldapi.com/data/latest.json'),
    fetchData('https://api.worldbank.org/v2/country/WLD/indicator/FP.CPI.TOTL.ZG?format=json&per_page=5'),
    fetchData('https://api.worldbank.org/v2/country/WLD/indicator/SL.UEM.TOTL.ZS?format=json&per_page=5'),
  ]);

  // Crypto market cap
  if (cryptoMarketResult.status === 'fulfilled' && !cryptoMarketResult.value.error) {
    const { data, stale } = cryptoMarketResult.value;
    if (data.data) {
      const mcap = data.data.total_market_cap.usd;
      const change = data.data.market_cap_change_percentage_24h_usd;
      updateCard('econ-marketcap', {
        value: formatCurrency(mcap),
        context: `24h change: ${change >= 0 ? '+' : ''}${change.toFixed(2)}% (live)`,
        contextClass: change >= 0 ? 'positive' : 'negative',
        state: 'success',
      });
      setCardFreshness('econ-marketcap', getFreshness('econ-marketcap', stale));
    }
  } else {
    setCardError('econ-marketcap', () => refresh());
  }

  // BTC/ETH dominance
  if (coinloreResult.status === 'fulfilled' && !coinloreResult.value.error) {
    const { data, stale } = coinloreResult.value;
    const d = Array.isArray(data) ? data[0] : data;
    if (d) {
      updateCard('econ-btc-dom', {
        value: formatPercent(parseFloat(d.btc_d)),
        context: 'Bitcoin market dominance (live)',
        state: 'success',
      });
      updateCard('econ-eth-dom', {
        value: formatPercent(parseFloat(d.eth_d)),
        context: 'Ethereum market dominance (live)',
        state: 'success',
      });
      setCardFreshness('econ-btc-dom', getFreshness('econ-btc-dom', stale));
      setCardFreshness('econ-eth-dom', getFreshness('econ-eth-dom', stale));
    }
  } else {
    setCardError('econ-btc-dom', () => refresh());
    setCardError('econ-eth-dom', () => refresh());
  }

  // Exchange rates
  if (forexResult.status === 'fulfilled' && !forexResult.value.error) {
    const { data, stale } = forexResult.value;
    if (data.rates) {
      const pairs = ['EUR', 'GBP', 'JPY', 'CNY'];
      const valEl = getCardValueEl('econ-forex');
      if (valEl) {
        valEl.textContent = '';
        valEl.classList.add('stat-value--embed');

        const table = document.createElement('table');
        table.className = 'mini-table';
        const caption = document.createElement('caption');
        caption.className = 'sr-only';
        caption.textContent = 'Exchange rates vs USD';
        table.appendChild(caption);
        const tbody = document.createElement('tbody');

        for (const cur of pairs) {
          if (data.rates[cur] !== undefined) {
            const tr = document.createElement('tr');
            const th = document.createElement('th');
            th.setAttribute('scope', 'row');
            th.className = 'table-label';
            th.textContent = `USD/${cur}`;

            const td = document.createElement('td');
            td.className = 'table-value';
            td.textContent = data.rates[cur].toFixed(cur === 'JPY' ? 2 : 4);

            tr.appendChild(th);
            tr.appendChild(td);
            tbody.appendChild(tr);
          }
        }
        table.appendChild(tbody);

        valEl.appendChild(table);
      }
      const card = document.getElementById('econ-forex');
      if (card) card.dataset.state = 'success';
      const forexDate = reverseDateStr(data.date);
      updateCard('econ-forex', { context: `Base: USD (${forexDate})`, state: 'success' });
      setCardFreshness('econ-forex', getFreshness('econ-forex', stale));
    }
  } else {
    setCardError('econ-forex', () => refresh());
  }

  // BTC mempool
  if (mempoolResult.status === 'fulfilled' && !mempoolResult.value.error) {
    const { data, stale } = mempoolResult.value;
    if (data.count !== undefined) {
      if (counters['econ-mempool']) {
        counters['econ-mempool'].update(data.count);
      } else {
        const el = getCardValueEl('econ-mempool');
        if (el) {
          counters['econ-mempool'] = new CountUp(el, data.count);
          counters['econ-mempool'].start();
        }
      }
      updateCard('econ-mempool', { context: 'Waiting for confirmation (live)', state: 'success' });
      setCardFreshness('econ-mempool', getFreshness('econ-mempool', stale));
    }
  } else {
    setCardError('econ-mempool', () => refresh());
  }

  // BTC hashrate
  if (hashrateResult.status === 'fulfilled' && !hashrateResult.value.error) {
    const { data, stale } = hashrateResult.value;
    if (data.currentHashrate !== undefined) {
      const ehps = (data.currentHashrate / 1e18).toFixed(1);
      updateCard('econ-hashrate', {
        value: `${ehps} EH/s`,
        context: 'Bitcoin network hashrate (live)',
        state: 'success',
      });
      setCardFreshness('econ-hashrate', getFreshness('econ-hashrate', stale));
    }
  } else {
    setCardError('econ-hashrate', () => refresh());
  }

  // World GDP (World Bank — fetch latest available year)
  handleWorldBankIndicator(gdpResult, 'econ-gdp', 'World Bank', formatCurrency);

  // US National Debt (Treasury Fiscal Data API)
  if (debtResult.status === 'fulfilled' && !debtResult.value.error) {
    const { data, stale } = debtResult.value;
    if (data.data && data.data.length > 0) {
      const entry = data.data[0];
      const totalDebt = parseFloat(entry.tot_pub_debt_out_amt);
      const recordDate = reverseDateStr(entry.record_date);
      updateCard('econ-debt', {
        value: formatCurrency(totalDebt),
        context: `US Treasury (${recordDate})`,
        state: 'success',
      });
      setCardFreshness('econ-debt', getFreshness('econ-debt', stale));
    }
  } else {
    setCardError('econ-debt', () => refresh());
  }

  // Gold Price (FreeGoldAPI)
  if (goldResult.status === 'fulfilled' && !goldResult.value.error) {
    const { data, stale } = goldResult.value;
    if (Array.isArray(data) && data.length > 0) {
      const latest = data[data.length - 1];
      const price = parseFloat(latest.price);
      if (!isNaN(price)) {
        const goldDate = reverseDateStr(latest.date);
        updateCard('econ-gold', {
          value: `$${formatNumber(price, 2)}`,
          context: `Per troy ounce (${goldDate})`,
          state: 'success',
        });
        setCardFreshness('econ-gold', getFreshness('econ-gold', stale));
      }
    }
  } else {
    setCardError('econ-gold', () => refresh());
  }

  // World Bank percentage indicators
  handleWorldBankIndicator(inflationResult, 'econ-inflation', 'Consumer prices, World Bank', formatPercent);
  handleWorldBankIndicator(unemploymentResult, 'econ-unemployment', 'ILO modeled, World Bank', formatPercent);
}

function handleWorldBankIndicator(result, cardId, label, formatFn) {
  if (result.status === 'fulfilled' && !result.value.error) {
    const { data, stale } = result.value;
    if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1])) {
      const entry = data[1].find((e) => e.value !== null);
      if (entry) {
        updateCard(cardId, {
          value: formatFn(entry.value),
          context: `${label} (${entry.date})`,
          state: 'success',
        });
        setCardFreshness(cardId, getFreshness(cardId, stale));
      }
    }
  } else {
    setCardError(cardId, () => refresh());
  }
}
