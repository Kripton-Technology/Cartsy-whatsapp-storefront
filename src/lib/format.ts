export function money(value: number | string | null | undefined): string {
  const amount = Number(value || 0);
  if (isNaN(amount)) return '0.00';
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function toAmount(value: number | string | null | undefined): number {
  const amount = Number(value || 0);
  return isNaN(amount) ? 0 : amount;
}
