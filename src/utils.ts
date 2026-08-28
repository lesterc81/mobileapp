export const currencySymbol = '₱';

export function fmtMoney(n: number): string {
  return `${currencySymbol}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtQty(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export type DayPreset = 'today' | 'yesterday' | 'week' | 'month' | 'all';

export const dayPresetLabels: Record<DayPreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: '7 Days',
  month: 'Month',
  all: 'All',
};

export function dayRange(preset: DayPreset): { start?: string; end?: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) => new Date(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1);

  switch (preset) {
    case 'today':
      return { start: startOfDay(now).toISOString(), end: endOfDay(now).toISOString() };
    case 'yesterday': {
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return { start: startOfDay(y).toISOString(), end: endOfDay(y).toISOString() };
    }
    case 'week': {
      const start = new Date(startOfDay(now).getTime() - 6 * 24 * 60 * 60 * 1000);
      return { start: startOfDay(start).toISOString(), end: endOfDay(now).toISOString() };
    }
    case 'month': {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: startOfDay(m).toISOString(), end: endOfDay(now).toISOString() };
    }
    case 'all':
    default:
      return {};
  }
}