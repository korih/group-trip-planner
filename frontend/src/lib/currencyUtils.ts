/**
 * Currency formatting and conversion utilities.
 * Exchange rates are fetched from the backend (which caches open.er-api.com).
 */

export function formatCurrency(
  amount: number,
  currency = 'USD',
  locale = 'en-US',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>,
): number {
  if (fromCurrency === toCurrency) return amount;

  // Rates are relative to a base currency (usually USD)
  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];

  if (!fromRate || !toRate) return amount;

  // Convert: amount → base → target
  return (amount / fromRate) * toRate;
}

/**
 * Simplify debts: given a map of user balances, compute the minimum
 * number of transactions to settle all debts.
 * Returns array of { from, to, amount } transfer instructions.
 */
export function simplifyDebts(
  balances: Record<string, number>,
): Array<{ from: string; to: string; amount: number }> {
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const debtors = Object.entries(balances)
    .filter(([, v]) => v < 0)
    .map(([k, v]) => [k, -v] as [string, number])
    .sort((a, b) => b[1] - a[1]);

  const transfers: Array<{ from: string; to: string; amount: number }> = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const [creditor, credit] = creditors[ci];
    const [debtor, debt] = debtors[di];
    const amount = Math.min(credit, debt);

    transfers.push({ from: debtor, to: creditor, amount: Math.round(amount * 100) / 100 });

    creditors[ci] = [creditor, credit - amount];
    debtors[di] = [debtor, debt - amount];

    if (creditors[ci][1] < 0.01) ci++;
    if (debtors[di][1] < 0.01) di++;
  }

  return transfers;
}
