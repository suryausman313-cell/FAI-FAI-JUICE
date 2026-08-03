import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

type ReadyTimeCountdownProps = {
  estimatedTime?: string | null;
  referenceTime?: string | null;
  status?: string | null;
  compact?: boolean;
};

type ParsedReadyTime = {
  minutes: number | null;
  label: string;
  deadlineMs: number | null;
};

function parseReadyTime(
  estimatedTime?: string | null,
  referenceTime?: string | null,
): ParsedReadyTime {
  const raw = String(estimatedTime || '').trim();
  if (!raw) {
    return { minutes: null, label: '', deadlineMs: null };
  }

  const [labelPart, encodedDeadline] = raw.split('|', 2);
  const label = labelPart.trim();
  const minuteMatch = label.match(/(\d+)/);
  const minutes = minuteMatch ? Number(minuteMatch[1]) : null;

  let deadlineMs: number | null = null;

  if (encodedDeadline) {
    const parsed = new Date(encodedDeadline).getTime();
    if (Number.isFinite(parsed)) deadlineMs = parsed;
  }

  // Old orders only contain "10 min". For those, use the last order update
  // as the safest available fallback. New orders contain an exact deadline.
  if (deadlineMs === null && minutes && referenceTime) {
    const referenceMs = new Date(referenceTime).getTime();
    if (Number.isFinite(referenceMs)) {
      deadlineMs = referenceMs + minutes * 60_000;
    }
  }

  return { minutes, label, deadlineMs };
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function makeLocalReadyTime(minutes: number): string {
  const safeMinutes = Math.min(240, Math.max(1, Math.round(minutes)));
  const deadline = new Date(Date.now() + safeMinutes * 60_000).toISOString();
  return `${safeMinutes} min|${deadline}`;
}

export function readyTimeLabel(estimatedTime?: string | null): string {
  return String(estimatedTime || '').split('|', 1)[0].trim();
}

export default function ReadyTimeCountdown({
  estimatedTime,
  referenceTime,
  status,
  compact = false,
}: ReadyTimeCountdownProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  const normalizedStatus = String(status || '').toLowerCase();

  const parsed = useMemo(
    () => parseReadyTime(estimatedTime, referenceTime),
    [estimatedTime, referenceTime],
  );

  useEffect(() => {
    if (!parsed.deadlineMs) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [parsed.deadlineMs]);

  if (!estimatedTime || normalizedStatus === 'new') return null;
  if (normalizedStatus === 'completed' || normalizedStatus === 'cancelled') return null;

  if (normalizedStatus === 'ready') {
    return (
      <div className={`rounded-xl border border-green-500/30 bg-green-500/10 ${compact ? 'px-2.5 py-2' : 'p-3'} flex items-center gap-2.5`}>
        <CheckCircle2 className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-green-400 shrink-0`} />
        <div className="min-w-0">
          <p className="text-green-300 font-bold text-sm">{t('orders.ready_confirmed_title')}</p>
          {!compact && <p className="text-green-400/70 text-xs">{t('orders.ready_confirmed_subtitle')}</p>}
        </div>
      </div>
    );
  }

  if (!parsed.deadlineMs) {
    return (
      <div className={`rounded-xl border border-green-500/30 bg-green-500/10 ${compact ? 'px-2.5 py-2' : 'p-3'} flex items-center gap-2.5`}>
        <Clock3 className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-green-400 shrink-0`} />
        <div>
          <p className="text-green-300 font-bold text-sm">{t('orders.estimated_ready_time')}</p>
          <p className="text-green-400 text-sm font-bold">{parsed.label}</p>
        </div>
      </div>
    );
  }

  const remainingSeconds = Math.floor((parsed.deadlineMs - now) / 1000);
  const dueTime = new Date(parsed.deadlineMs).toLocaleTimeString('en-AE', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (remainingSeconds <= 0) {
    return (
      <div className={`rounded-xl border border-amber-500/40 bg-amber-500/10 ${compact ? 'px-2.5 py-2' : 'p-3'} flex items-center gap-2.5`}>
        <AlertTriangle className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-amber-400 shrink-0`} />
        <div className="min-w-0">
          <p className="text-amber-300 font-bold text-sm">{t('orders.estimated_time_passed')}</p>
          <p className="text-amber-200/70 text-xs">
            {t('orders.ready_waiting_update')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-green-500/30 bg-green-500/10 ${compact ? 'px-2.5 py-2' : 'p-3'} flex items-center gap-2.5`}>
      <Clock3 className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-green-400 shrink-0`} />
      <div className="min-w-0">
        <p className="text-green-300 font-bold text-sm">
          {t('orders.ready_in').replace('{time}', formatClock(remainingSeconds))}
        </p>
        {!compact && (
          <p className="text-green-400/70 text-xs">
            {t('orders.expected_around').replace('{time}', dueTime)}
          </p>
        )}
      </div>
    </div>
  );
}
