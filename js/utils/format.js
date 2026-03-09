export function formatNumber(n, decimals = 0) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function abbreviate(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';

  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K';
  return sign + abs.toFixed(0);
}

export function formatCurrency(n, currency = '$') {
  return currency + abbreviate(n);
}

export function formatPPM(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toFixed(1) + ' ppm';
}

export function formatPPB(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toFixed(0) + ' ppb';
}

export function formatDegC(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const val = Number(n);
  const sign = val > 0 ? '+' : '';
  return sign + val.toFixed(1) + '\u00B0C';
}

export function formatPercent(n, decimals = 1) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toFixed(decimals) + '%';
}
