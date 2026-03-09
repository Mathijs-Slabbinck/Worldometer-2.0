import { fetchData } from '../utils/fetch-handler.js';
import { formatCurrency, formatPercent, formatNumber, abbreviate } from '../utils/format.js';
import { createCard, createSubCategory, updateCard, setCardError, setCardStale, getCardValueEl } from '../utils/dom.js';
import { CountUp } from '../utils/counter.js';

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
  const results = await Promise.allSettled([
    fetchData('https://api.coingecko.com/api/v3/global'),
    fetchData('https://api.coinlore.net/api/global/'),
    fetchData('https://api.frankfurter.dev/v1/latest?base=USD'),
    fetchData('https://mempool.space/api/mempool'),
    fetchData('https://mempool.space/api/v1/mining/hashrate/1m'),
    fetchData('https://api.worldbank.org/v2/country/WLD/indicator/NY.GDP.MKTP.CD?format=json&per_page=5'),
    fetchData('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1'),
  ]);

  // Crypto market cap
  if (results[0].status === 'fulfilled' && !results[0].value.error) {
    const { data, stale } = results[0].value;
    if (data.data) {
      const mcap = data.data.total_market_cap.usd;
      const change = data.data.market_cap_change_percentage_24h_usd;
      updateCard('econ-marketcap', {
        value: formatCurrency(mcap),
        context: `24h change: ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
        contextClass: change >= 0 ? 'positive' : 'negative',
        state: stale ? 'stale' : 'success',
      });
      if (stale) setCardStale('econ-marketcap');
    }
  } else {
    setCardError('econ-marketcap', () => refresh());
  }

  // BTC/ETH dominance
  if (results[1].status === 'fulfilled' && !results[1].value.error) {
    const { data, stale } = results[1].value;
    const d = Array.isArray(data) ? data[0] : data;
    if (d) {
      updateCard('econ-btc-dom', {
        value: formatPercent(parseFloat(d.btc_d)),
        context: 'Bitcoin market dominance',
        state: stale ? 'stale' : 'success',
      });
      updateCard('econ-eth-dom', {
        value: formatPercent(parseFloat(d.eth_d)),
        context: 'Ethereum market dominance',
        state: stale ? 'stale' : 'success',
      });
      if (stale) {
        setCardStale('econ-btc-dom');
        setCardStale('econ-eth-dom');
      }
    }
  } else {
    setCardError('econ-btc-dom', () => refresh());
    setCardError('econ-eth-dom', () => refresh());
  }

  // Exchange rates
  if (results[2].status === 'fulfilled' && !results[2].value.error) {
    const { data, stale } = results[2].value;
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
      if (card) card.dataset.state = stale ? 'stale' : 'success';
      updateCard('econ-forex', { context: `Base: USD | ${data.date}`, state: stale ? 'stale' : 'success' });
      if (stale) setCardStale('econ-forex');
    }
  } else {
    setCardError('econ-forex', () => refresh());
  }

  // BTC mempool
  if (results[3].status === 'fulfilled' && !results[3].value.error) {
    const { data, stale } = results[3].value;
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
      updateCard('econ-mempool', { context: 'Waiting for confirmation', state: stale ? 'stale' : 'success' });
      if (stale) setCardStale('econ-mempool');
    }
  } else {
    setCardError('econ-mempool', () => refresh());
  }

  // BTC hashrate
  if (results[4].status === 'fulfilled' && !results[4].value.error) {
    const { data, stale } = results[4].value;
    if (data.currentHashrate !== undefined) {
      const ehps = (data.currentHashrate / 1e18).toFixed(1);
      updateCard('econ-hashrate', {
        value: `${ehps} EH/s`,
        context: 'Bitcoin network hashrate',
        state: stale ? 'stale' : 'success',
      });
      if (stale) setCardStale('econ-hashrate');
    }
  } else {
    setCardError('econ-hashrate', () => refresh());
  }

  // World GDP (World Bank — fetch latest available year)
  if (results[5].status === 'fulfilled' && !results[5].value.error) {
    const { data, stale } = results[5].value;
    if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1])) {
      const gdpEntry = data[1].find((entry) => entry.value !== null);
      if (gdpEntry) {
        updateCard('econ-gdp', {
          value: formatCurrency(gdpEntry.value),
          context: `Year: ${gdpEntry.date} (World Bank)`,
          state: stale ? 'stale' : 'success',
        });
        if (stale) setCardStale('econ-gdp');
      }
    }
  } else {
    setCardError('econ-gdp', () => refresh());
  }

  // US National Debt (Treasury Fiscal Data API)
  if (results[6].status === 'fulfilled' && !results[6].value.error) {
    const { data, stale } = results[6].value;
    if (data.data && data.data.length > 0) {
      const entry = data.data[0];
      const totalDebt = parseFloat(entry.tot_pub_debt_out_amt);
      const recordDate = entry.record_date;
      updateCard('econ-debt', {
        value: formatCurrency(totalDebt),
        context: `As of ${recordDate} (US Treasury)`,
        state: stale ? 'stale' : 'success',
      });
      if (stale) setCardStale('econ-debt');
    }
  } else {
    setCardError('econ-debt', () => refresh());
  }
}
