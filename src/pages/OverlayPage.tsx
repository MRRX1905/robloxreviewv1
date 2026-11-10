import { useEffect, useState } from 'react';
import { Crown, Gauge, Zap, type LucideIcon } from 'lucide-react';
import { buildNarration } from '@/lib/narration';
import { TIER_LABEL } from '@/lib/review-queue';
import { formatNumber } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { getAppSetting } from '@/services/data/app-settings';
import { loadOverlayState, type OverlayState } from '@/services/data/overlay-state';
import type { NarrationSettings, QueueTier } from '@/types/live';

const REFRESH_INTERVAL_MS = 5000;

const TIER_STYLE: Record<QueueTier, string> = {
  vip_express: 'bg-accent-500/20 text-accent-200 ring-accent-400/60',
  fast_track: 'bg-warning-500/20 text-warning-200 ring-warning-400/60',
  normal: 'bg-primary-500/20 text-primary-200 ring-primary-400/60',
};

const TIER_ICON: Record<QueueTier, LucideIcon> = {
  vip_express: Crown,
  fast_track: Zap,
  normal: Gauge,
};

export default function OverlayPage() {
  const [state, setState] = useState<OverlayState | null>(null);
  const [style, setStyle] = useState<NarrationSettings['style']>('professional');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('overlay-mode');
    return () => document.body.classList.remove('overlay-mode');
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAppSetting<NarrationSettings>('narration')
      .then((saved) => {
        if (!cancelled && saved?.style) setStyle(saved.style);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const next = await loadOverlayState();
        if (!cancelled) {
          setState(next);
          setError(null);
        }
      } catch (refreshError) {
        if (!cancelled) setError(refreshError instanceof Error ? refreshError.message : 'The overlay could not load.');
      }
    }
    void refresh();
    const channel = supabase
      .channel('overlay-review-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'review_queue' }, () => void refresh())
      .subscribe();
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  const current = state?.current ?? null;
  const lookup = state?.lookup ?? null;
  const narration = lookup ? buildNarration(lookup, style) : null;
  const TierIcon = current ? TIER_ICON[current.tier] : Gauge;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent font-sans text-white">
      {error && (
        <div className="absolute left-12 top-12 rounded-xl bg-danger-600/90 px-5 py-3 text-lg font-medium shadow-xl">
          Overlay data unavailable
        </div>
      )}

      {!current && (
        <div className="absolute bottom-16 left-16 flex items-center gap-4 rounded-2xl bg-canvas/85 px-8 py-6 ring-1 ring-line backdrop-blur">
          <span className="h-3 w-3 animate-pulse-dot rounded-full bg-success-400" />
          <p className="text-2xl font-semibold text-slate-100">Waiting for the next review</p>
        </div>
      )}

      {current && (
        <div
          key={current.id}
          className="absolute bottom-16 left-16 right-16 flex animate-fade-in-up items-end gap-8"
        >
          <div className="flex w-[640px] shrink-0 flex-col gap-6 rounded-3xl bg-canvas/85 p-8 shadow-2xl ring-1 ring-line backdrop-blur-md">
            <div className="flex items-center gap-6">
              {lookup?.profile.avatar_url ? (
                <img src={lookup.profile.avatar_url} alt="" className="h-32 w-32 rounded-2xl bg-raised ring-1 ring-line" />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-raised text-5xl font-bold text-slate-500 ring-1 ring-line">
                  {current.roblox_username.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <span className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-lg font-semibold ring-1 ${TIER_STYLE[current.tier]}`}>
                  <TierIcon className="h-5 w-5" aria-hidden="true" />
                  {TIER_LABEL[current.tier]}
                </span>
                <p className="mt-3 truncate text-5xl font-bold tracking-tight">
                  {lookup?.profile.display_name ?? current.roblox_username}
                </p>
                <p className="mt-1 text-2xl text-slate-400">@{current.roblox_username}</p>
              </div>
            </div>

            {lookup ? (
              <div className="grid grid-cols-3 gap-4">
                <OverlayStat label="Friends" value={formatNumber(lookup.profile.friends_count)} />
                <OverlayStat label="Followers" value={formatNumber(lookup.profile.followers_count)} />
                <OverlayStat
                  label="Catalog est."
                  value={lookup.profile.estimated_catalog_value === null ? '—' : `${formatNumber(lookup.profile.estimated_catalog_value)} R$`}
                />
              </div>
            ) : (
              <p className="rounded-xl bg-raised/60 px-5 py-4 text-xl text-slate-300">Account data is being prepared.</p>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {narration && (
              <div className="rounded-3xl bg-canvas/85 p-8 shadow-2xl ring-1 ring-line backdrop-blur-md">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary-300">Narration</p>
                <p className="mt-3 text-2xl leading-relaxed text-slate-100">{narration}</p>
              </div>
            )}

            {state && state.upNext.length > 0 && (
              <div className="rounded-3xl bg-canvas/85 p-6 shadow-2xl ring-1 ring-line backdrop-blur-md">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Up next</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {state.upNext.map((entry, index) => (
                    <li key={entry.id} className="flex items-center justify-between gap-4 text-xl">
                      <span className="truncate text-slate-100">{index + 1}. {entry.roblox_username}</span>
                      <span className="shrink-0 text-base text-slate-400">{TIER_LABEL[entry.tier]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OverlayStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-raised/70 p-4 ring-1 ring-line">
      <p className="text-sm font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 truncate text-3xl font-bold">{value}</p>
    </div>
  );
}
