export const UAE_TIME_ZONE = 'Asia/Dubai';

export function parseApiDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const raw = String(value || '').trim();
  if (!raw) return new Date(NaN);

  // Most backend timestamps are UTC. Some legacy rows are ISO strings without
  // an explicit timezone; treat those as UTC so every device displays the same UAE time.
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  return new Date(hasExplicitZone ? raw : `${raw}Z`);
}

export function formatUaeDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-AE', {
    timeZone: UAE_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatUaeTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('en-AE', {
    timeZone: UAE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function formatUaeDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-AE', {
    timeZone: UAE_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function uaeAge(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 15) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
