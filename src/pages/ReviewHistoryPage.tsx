import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import StateMessage from '@/components/ui/StateMessage';
import { formatDateTime, formatDuration, formatNumber } from '@/lib/format';
import { TIER_LABEL } from '@/lib/review-queue';
import {
  listAllHistoryForExport,
  listReviewHistory,
  type HistoryPage,
  type HistoryQuery,
  type HistoryStatusFilter,
  type HistoryTierFilter,
} from '@/services/data/review-history';
import type { ReviewHistoryRecord } from '@/types/live';

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

const STATUS_LABEL: Record<ReviewHistoryRecord['status'], string> = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  removed: 'Removed',
};

const STATUS_TONE: Record<ReviewHistoryRecord['status'], BadgeTone> = {
  completed: 'success',
  cancelled: 'warning',
  removed: 'danger',
};

function escapeCsvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(rows: ReviewHistoryRecord[]): string {
  const header = [
    'Reviewed at',
    'TikTok username',
    'Roblox username',
    'Tier',
    'Status',
    'Duration (seconds)',
    'Catalog estimate (R$)',
  ];
  const lines = rows.map((row) =>
    [
      row.review_ended_at,
      row.tiktok_username,
      row.roblox_username,
      TIER_LABEL[row.tier],
      STATUS_LABEL[row.status],
      row.duration_seconds,
      row.estimated_catalog_value,
    ].map(escapeCsvCell).join(','),
  );
  return [header.join(','), ...lines].join('\r\n');
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ReviewHistoryPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<HistoryStatusFilter>('all');
  const [tier, setTier] = useState<HistoryTierFilter>('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<HistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReviewHistoryRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const query: HistoryQuery = { search: debouncedSearch, status, tier, page, pageSize: PAGE_SIZE };
    setLoading(true);
    setError(null);
    listReviewHistory(query)
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Review history could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, status, tier, page]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const rows = await listAllHistoryForExport({ search: debouncedSearch, status, tier });
      if (rows.length === 0) {
        setExportError('There is nothing to export for the current filters.');
        return;
      }
      downloadCsv(buildCsv(rows), `review-history-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (exportFailure) {
      setExportError(exportFailure instanceof Error ? exportFailure.message : 'The export could not be created.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Review History"
        description="Every finished, cancelled, or removed review, with how long it took."
        actions={
          <Button variant="secondary" onClick={handleExport} disabled={exporting} icon={<Download className="h-4 w-4" />}>
            {exporting ? 'Preparing...' : 'Export CSV'}
          </Button>
        }
      />

      {exportError && (
        <div className="mb-6">
          <StateMessage kind="error" title="Export failed" description={exportError} />
        </div>
      )}

      <Card className="mb-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="history-search" className="mb-2 block text-sm font-medium text-slate-300">Search usernames</label>
            <input
              id="history-search"
              className="field w-full"
              placeholder="TikTok or Roblox name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="history-status" className="mb-2 block text-sm font-medium text-slate-300">Outcome</label>
            <select
              id="history-status"
              className="field w-full"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as HistoryStatusFilter);
                setPage(1);
              }}
            >
              <option value="all">All outcomes</option>
              {(Object.keys(STATUS_LABEL) as ReviewHistoryRecord['status'][]).map((value) => (
                <option key={value} value={value}>{STATUS_LABEL[value]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="history-tier" className="mb-2 block text-sm font-medium text-slate-300">Tier</label>
            <select
              id="history-tier"
              className="field w-full"
              value={tier}
              onChange={(event) => {
                setTier(event.target.value as HistoryTierFilter);
                setPage(1);
              }}
            >
              <option value="all">All tiers</option>
              {(Object.keys(TIER_LABEL) as ReviewHistoryRecord['tier'][]).map((value) => (
                <option key={value} value={value}>{TIER_LABEL[value]}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className={selected ? 'xl:col-span-2' : 'xl:col-span-3'}>
          {loading && !result ? (
            <StateMessage kind="loading" title="Loading history" />
          ) : error ? (
            <StateMessage kind="error" title="History unavailable" description={error} />
          ) : !result || result.rows.length === 0 ? (
            <StateMessage
              kind="empty"
              title="No reviews match these filters"
              description="Finished reviews will appear here. Try clearing the search or filters."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="pb-3 pr-4 font-medium">Ended</th>
                      <th className="pb-3 pr-4 font-medium">Roblox</th>
                      <th className="pb-3 pr-4 font-medium">Tier</th>
                      <th className="pb-3 pr-4 font-medium">Outcome</th>
                      <th className="pb-3 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {result.rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setSelected(row)}
                        className={`cursor-pointer transition hover:bg-raised/40 ${selected?.id === row.id ? 'bg-raised/60' : ''}`}
                      >
                        <td className="py-3 pr-4 text-slate-400">{formatDateTime(row.review_ended_at)}</td>
                        <td className="py-3 pr-4 font-medium text-slate-100">{row.roblox_username}</td>
                        <td className="py-3 pr-4 text-slate-300">{TIER_LABEL[row.tier]}</td>
                        <td className="py-3 pr-4"><Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge></td>
                        <td className="py-3 font-mono text-slate-400">{formatDuration(row.duration_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex items-center justify-between gap-4 border-t border-line/60 pt-4">
                <p className="text-sm text-slate-400">
                  Page {page} of {totalPages} · {formatNumber(result.total)} reviews
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="px-3 py-1.5"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    icon={<ChevronLeft className="h-4 w-4" />}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-3 py-1.5"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>

        {selected && (
          <Card
            title={selected.roblox_username}
            description={`@${selected.tiktok_username}`}
            action={
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close details"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-raised hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            }
          >
            <dl className="flex flex-col gap-4 text-sm">
              <DetailRow label="Tier" value={TIER_LABEL[selected.tier]} />
              <DetailRow label="Outcome" value={STATUS_LABEL[selected.status]} />
              <DetailRow label="Started" value={formatDateTime(selected.review_started_at)} />
              <DetailRow label="Ended" value={formatDateTime(selected.review_ended_at)} />
              <DetailRow label="Duration" value={formatDuration(selected.duration_seconds)} />
              <DetailRow
                label="Catalog estimate"
                value={selected.estimated_catalog_value === null ? 'Not available' : `${formatNumber(selected.estimated_catalog_value)} R$`}
              />
            </dl>
          </Card>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/50 pb-3 last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-200">{value}</dd>
    </div>
  );
}
