import { useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  BadgeCheck,
  Ban,
  CalendarDays,
  Coins,
  Crown,
  Search,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Users,
  UserPlus,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import StateMessage from '@/components/ui/StateMessage';
import StatCard from '@/components/ui/StatCard';
import { formatDateTime, formatNumber, formatRelativeTime, formatRupiah } from '@/lib/format';
import { lookupRobloxAccount } from '@/services/roblox/roblox-lookup';
import type {
  InventoryStatus,
  RobloxInventoryItem,
  RobloxItemAvailability,
  RobloxItemRarity,
  RobloxLookupResult,
  RobloxPresenceStatus,
} from '@/types/live';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

const INVENTORY_NOTE: Record<InventoryStatus, string> = {
  ok: 'Equipped items are listed first, followed by the rest of the owned inventory, including off-sale items. Values are catalog and resale estimates.',
  private:
    'This account keeps its owned-items list private, so only the equipped outfit and public limited items are shown.',
  unavailable:
    'The owned-items list could not be checked, so only the equipped outfit and public limited items are shown.',
};

const PRESENCE_LABEL: Record<RobloxPresenceStatus, string> = {
  offline: 'Offline',
  online: 'Online',
  in_game: 'In game',
  in_studio: 'In Studio',
  unknown: 'Unknown',
};

const PRESENCE_TONE: Record<RobloxPresenceStatus, BadgeTone> = {
  offline: 'neutral',
  online: 'success',
  in_game: 'accent',
  in_studio: 'warning',
  unknown: 'neutral',
};

const AVAILABILITY_LABEL: Record<RobloxItemAvailability, string> = {
  limited: 'Limited',
  paid: 'On sale',
  off_sale: 'Off sale',
  free: 'Free',
  unknown: 'Unpriced',
};

const AVAILABILITY_TONE: Record<RobloxItemAvailability, BadgeTone> = {
  limited: 'accent',
  paid: 'success',
  off_sale: 'neutral',
  free: 'neutral',
  unknown: 'neutral',
};

const RARITY_TONE: Record<RobloxItemRarity, BadgeTone> = {
  Limited: 'accent',
  Legendary: 'warning',
  Epic: 'primary',
  Rare: 'success',
  Common: 'neutral',
};

function showsRarityBadge(item: RobloxInventoryItem): boolean {
  if (!item.rarity || item.rarity === 'Common') return false;
  // A limited item already says "Limited" in the availability badge.
  return !(item.availability && AVAILABILITY_LABEL[item.availability] === item.rarity);
}

function accountAgeLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return '—';
  const years = days / 365.25;
  return years >= 1 ? `${years.toFixed(1)} years` : `${days} day(s)`;
}

function itemPriceLabel(item: RobloxInventoryItem): string {
  if (item.availability === 'free') return 'Free';
  if (item.catalog_price === null) return 'Not for sale';
  return `${formatNumber(item.catalog_price)} R$`;
}

export default function AnalyzerPage() {
  const [username, setUsername] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RobloxLookupResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = username.trim();
    if (!USERNAME_PATTERN.test(trimmed)) {
      setInputError('Use 3 to 20 letters, numbers, or underscores.');
      return;
    }
    setInputError(null);
    setLoading(true);
    setError(null);
    try {
      setResult(await lookupRobloxAccount(trimmed));
    } catch (lookupError) {
      setResult(null);
      setError(lookupError instanceof Error ? lookupError.message : 'The lookup could not be completed.');
    } finally {
      setLoading(false);
    }
  }

  const profile = result?.profile ?? null;
  const inventory = result?.inventory ?? [];
  const sortedInventory = [...inventory].sort((a, b) => {
    if (a.is_equipped !== b.is_equipped) return a.is_equipped ? -1 : 1;
    return (b.catalog_price ?? -1) - (a.catalog_price ?? -1);
  });
  const equippedCount = inventory.filter((item) => item.is_equipped).length;
  const pricedEquippedCount = inventory.filter(
    (item) => item.is_equipped && item.catalog_price !== null,
  ).length;
  const topItem = inventory.find((item) => (item.catalog_price ?? 0) > 0) ?? null;
  const presenceStatus = profile?.presence_status ?? null;
  const avatarImage = profile?.avatar_render_url ?? profile?.avatar_url ?? null;
  const presenceDetail =
    profile?.presence_detail ??
    (profile?.last_online_at ? `Last online ${formatRelativeTime(profile.last_online_at)}` : null);
  const topGroups = profile?.top_groups ?? [];
  const priceStatus = profile?.price_status ?? 'ok';
  const offSaleCount = inventory.filter((item) => item.availability === 'off_sale').length;
  const pricedCount = inventory.filter((item) => item.catalog_price !== null).length;
  const ownedCount = profile?.inventory_item_count ?? inventory.length;
  const unpricedOwnedCount = Math.max(0, ownedCount - inventory.length);

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Account Analyzer"
        description="Look up a public Roblox account, its outfit, full inventory and limited items. Values are catalog and resale estimates, not spending or market value."
      />

      <Card className="mb-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <label htmlFor="roblox-username" className="mb-2 block text-sm font-medium text-slate-300">
              Roblox username
            </label>
            <input
              id="roblox-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="example_name"
              autoComplete="off"
              className="field w-full"
              aria-invalid={inputError !== null}
              aria-describedby={inputError ? 'roblox-username-error' : undefined}
            />
            {inputError && (
              <p id="roblox-username-error" className="mt-2 text-sm text-danger-400">
                {inputError}
              </p>
            )}
          </div>
          <Button
            type="submit"
            variant="primary"
            className="sm:mt-8"
            disabled={loading}
            icon={<Search className="h-4 w-4" />}
          >
            {loading ? 'Looking up...' : 'Analyze account'}
          </Button>
        </form>
      </Card>

      {loading && <StateMessage kind="loading" title="Reading public account data" description="This can take a few seconds." />}

      {!loading && error && <StateMessage kind="error" title="Lookup failed" description={error} />}

      {!loading && !error && !profile && (
        <Card>
          <StateMessage
            kind="empty"
            title="No account selected"
            description="Enter a Roblox username above to see its public profile, outfit value, limited items, groups, and recent activity."
          />
        </Card>
      )}

      {!loading && !error && profile && result && (
        <div className="flex flex-col gap-6">
          <Card>
            <div className="flex flex-col gap-6 md:flex-row md:items-center">
              {avatarImage ? (
                <img
                  src={avatarImage}
                  alt={`Avatar of ${profile.username}`}
                  className="h-36 w-36 shrink-0 rounded-2xl bg-raised object-contain ring-1 ring-line"
                />
              ) : (
                <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-2xl bg-raised text-2xl font-semibold text-slate-500 ring-1 ring-line">
                  {profile.username.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold text-white">{profile.display_name ?? profile.username}</h2>
                  {profile.has_verified_badge && (
                    <Badge tone="primary">
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Verified
                    </Badge>
                  )}
                  {profile.is_banned && (
                    <Badge tone="danger">
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                      Banned
                    </Badge>
                  )}
                  {presenceStatus && (
                    <Badge tone={PRESENCE_TONE[presenceStatus]} dot>
                      {PRESENCE_LABEL[presenceStatus]}
                    </Badge>
                  )}
                  <Badge tone={result.cached ? 'neutral' : 'success'} dot>
                    {result.cached ? 'Cached' : 'Fresh lookup'}
                  </Badge>
                </div>
                <p className="text-sm text-slate-400">
                  @{profile.username}
                  {profile.avatar_type ? ` · ${profile.avatar_type}` : ''}
                  {profile.friends_count !== null ? ` · ${formatNumber(profile.friends_count)} friends` : ''}
                </p>
                <p className="text-xs text-slate-500">
                  Joined {formatDateTime(profile.account_created_at)} · Account age {accountAgeLabel(profile.account_created_at)} · Updated{' '}
                  {formatRelativeTime(profile.fetched_at)}
                </p>
                {presenceDetail && <p className="text-xs text-slate-400">{presenceDetail}</p>}
              </div>
            </div>

            {profile.description && (
              <div className="mt-6 rounded-xl border border-line bg-raised/40 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Public bio</p>
                <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-line break-words text-sm leading-relaxed text-slate-300">
                  {profile.description}
                </p>
              </div>
            )}

            {profile.lookup_status !== 'ok' && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-warning-500/30 bg-warning-500/10 p-4">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning-300" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-warning-200">Some public data is missing</p>
                  <p className="mt-1 text-sm text-slate-300">
                    {profile.status_detail ?? 'Some sections could not be read. Try again later.'}
                  </p>
                </div>
              </div>
            )}
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Friends" value={formatNumber(profile.friends_count)} icon={Users} tone="primary" />
            <StatCard label="Followers" value={formatNumber(profile.followers_count)} icon={UserPlus} tone="accent" />
            <StatCard label="Following" value={formatNumber(profile.following_count)} icon={UserCheck} tone="warning" />
            <StatCard
              label="Catalog estimate"
              value={profile.estimated_catalog_value === null ? '—' : `${formatNumber(profile.estimated_catalog_value)} R$`}
              hint={
                profile.estimated_catalog_value === null
                  ? 'No priced items found.'
                  : `≈ ${formatRupiah(profile.estimated_catalog_value)} · not spending`
              }
              icon={Coins}
              tone="success"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Value breakdown" description={`${profile.priced_item_count} priced item(s) in the inventory.`}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ValueTile label="Outfit" value={profile.outfit_value} hint={`${pricedEquippedCount} equipped item(s) priced`} />
                <ValueTile
                  label="Limited items"
                  value={profile.limited_value}
                  hint={`${profile.limited_item_count ?? 0} limited item(s)`}
                />
                <ValueTile label="Total estimate" value={profile.estimated_catalog_value} hint="Outfit + limited items" />
                <ValueTile
                  label="Inventory total"
                  value={profile.inventory_value}
                  hint={
                    profile.inventory_status === 'ok'
                      ? `${formatNumber(ownedCount)} owned item(s) · catalog estimate`
                      : 'Visible items only'
                  }
                />
              </div>
              {priceStatus !== 'ok' && (
                <p className="mt-4 rounded-lg border border-warning-500/25 bg-warning-500/10 px-3 py-2 text-xs leading-relaxed text-warning-200">
                  Roblox is limiting price lookups right now, so some items have no catalog price. Limited items still use their
                  recent average resale price, and the next lookup fills in the rest.
                </p>
              )}
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                Limited items are valued at their lowest resale price. Off-sale items are listed, but only count toward a total when
                they have a resale price. These numbers are public catalog estimates, not what the owner paid and not the sale value
                of the whole account.
              </p>
              {topItem && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-raised/50 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {topItem.thumbnail_url ? (
                      <img src={topItem.thumbnail_url} alt="" className="h-10 w-10 rounded-lg bg-panel object-contain" />
                    ) : (
                      <Crown className="h-5 w-5 shrink-0 text-accent-300" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100" title={topItem.name}>
                        {topItem.name}
                      </p>
                      <p className="text-xs text-slate-500">Highest-valued item</p>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-sm text-slate-200">{itemPriceLabel(topItem)}</span>
                </div>
              )}
            </Card>

            <Card title="Public account details" description="Read from the public Roblox profile.">
              <dl className="divide-y divide-line/60">
                <DetailRow
                  icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />}
                  label="Joined"
                  value={`${formatDateTime(profile.account_created_at)} (${accountAgeLabel(profile.account_created_at)})`}
                />
                <DetailRow
                  icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
                  label="Avatar type"
                  value={profile.avatar_type ?? '—'}
                />
                <DetailRow
                  icon={<Activity className="h-4 w-4" aria-hidden="true" />}
                  label="Presence"
                  value={presenceStatus ? PRESENCE_LABEL[presenceStatus] + (presenceDetail ? ` · ${presenceDetail}` : '') : '—'}
                />
                <DetailRow
                  icon={<Users className="h-4 w-4" aria-hidden="true" />}
                  label="Groups"
                  value={profile.groups_count === null || profile.groups_count === undefined ? '—' : `${formatNumber(profile.groups_count)}`}
                />
                <DetailRow
                  icon={<Crown className="h-4 w-4" aria-hidden="true" />}
                  label="Limited items"
                  value={`${formatNumber(profile.limited_item_count ?? 0)} · ${profile.limited_value === null || profile.limited_value === undefined ? '—' : `${formatNumber(profile.limited_value)} R$`}`}
                />
                <DetailRow
                  icon={<Coins className="h-4 w-4" aria-hidden="true" />}
                  label="Equipped outfit"
                  value={`${formatNumber(equippedCount)} item(s) · ${formatNumber(profile.outfit_value)} R$`}
                />
              </dl>
            </Card>
          </div>

          {topGroups.length > 0 && (
            <Card
              title="Groups"
              description={`Member of ${formatNumber(profile.groups_count ?? topGroups.length)} group(s). Showing the largest groups.`}
            >
              <ul className="divide-y divide-line/60">
                {topGroups.map((group) => (
                  <li key={group.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-100">
                        {group.name}
                        {group.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary-300" aria-hidden="true" />}
                      </p>
                      <p className="text-xs text-slate-500">{group.role}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{formatNumber(group.member_count)} members</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            title="Inventory"
            description={INVENTORY_NOTE[profile.inventory_status]}
            action={<Sparkles className="h-5 w-5 text-slate-500" aria-hidden="true" />}
          >
            {inventory.length === 0 ? (
              <StateMessage kind="empty" title="No items to show" description={INVENTORY_NOTE[profile.inventory_status]} />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {sortedInventory.map((item) => (
                    <div
                      key={item.asset_id}
                      className="flex items-center gap-3 rounded-xl border border-line bg-raised/60 p-3 transition hover:border-primary-500/40"
                    >
                      {item.thumbnail_url ? (
                        <img
                          src={item.thumbnail_url}
                          alt=""
                          loading="lazy"
                          className="h-12 w-12 shrink-0 rounded-lg bg-panel object-contain"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-panel text-[10px] uppercase text-slate-500">
                          {item.asset_type?.slice(0, 3) ?? 'Item'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-100" title={item.name}>
                          {item.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {item.asset_type ?? 'Item'}
                          {item.creator_name ? ` · ${item.creator_name}` : ''}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {item.is_equipped && <Badge tone="primary">Equipped</Badge>}
                          {item.availability && (
                            <Badge tone={AVAILABILITY_TONE[item.availability]}>{AVAILABILITY_LABEL[item.availability]}</Badge>
                          )}
                          {showsRarityBadge(item) && item.rarity && (
                            <Badge tone={RARITY_TONE[item.rarity]}>{item.rarity}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-xs text-slate-300">{itemPriceLabel(item)}</p>
                        {item.is_limited && item.resale_price !== null && (
                          <p className="mt-0.5 text-[11px] text-slate-500">resale</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  {equippedCount} equipped item(s) · {profile.limited_item_count ?? 0} limited item(s) ·{' '}
                  {pricedCount} item(s) with a public price · {offSaleCount} off sale.
                </p>
                {unpricedOwnedCount > 0 && (
                  <p className="mt-1 text-xs text-warning-200/80">
                    Showing {formatNumber(inventory.length)} of {formatNumber(ownedCount)} owned item(s) to stay within Roblox price
                    limits. The inventory total covers the items shown.
                  </p>
                )}
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function ValueTile({ label, value, hint }: { label: string; value: number | null | undefined; hint: string }) {
  const hasValue = value !== null && value !== undefined;
  return (
    <div className="rounded-xl border border-line bg-raised/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{hasValue ? `${formatNumber(value)} R$` : '—'}</p>
      {hasValue && value > 0 && <p className="mt-1 text-xs text-slate-400">≈ {formatRupiah(value)}</p>}
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="flex items-center gap-2 text-sm text-slate-400">
        <span className="text-slate-500">{icon}</span>
        {label}
      </dt>
      <dd className="max-w-[60%] break-words text-right text-sm text-slate-200">{value}</dd>
    </div>
  );
}
