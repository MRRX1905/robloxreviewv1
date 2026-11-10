import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, Database, Radio, RefreshCw, Save, ScrollText, Settings2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import StateMessage from '@/components/ui/StateMessage';
import { useLive } from '@/context/live-context';
import { formatClockTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { ConnectionState } from '@/services/tikfinity/tikfinity-connection';
import type { ConnectionSettings } from '@/types/live';

const CONNECTION_TONE: Record<ConnectionState, BadgeTone> = {
  connected: 'success',
  connecting: 'warning',
  reconnecting: 'warning',
  disconnected: 'danger',
};

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
};

const PORT_MIN = 1;
const PORT_MAX = 65535;

type DatabaseCheck =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok'; checkedAt: string }
  | { status: 'error'; message: string };

export default function SystemSettingsPage() {
  const { connection, diagnostics, updateConnectionSettings, reportError } = useLive();
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [database, setDatabase] = useState<DatabaseCheck>({ status: 'idle' });

  useEffect(() => {
    if (!connection.settings) return;
    setHost(connection.settings.host);
    setPort(String(connection.settings.port));
  }, [connection.settings]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedHost = host.trim();
    const portNumber = Number(port);
    if (trimmedHost.length === 0 || /\s|\/|:/.test(trimmedHost)) {
      setFormError('Enter the host name or IP address only, for example localhost.');
      return;
    }
    if (!Number.isInteger(portNumber) || portNumber < PORT_MIN || portNumber > PORT_MAX) {
      setFormError('Port must be a whole number between 1 and 65535.');
      return;
    }
    const next: ConnectionSettings = { host: trimmedHost, port: portNumber };
    setSaving(true);
    setFormError(null);
    setSaveMessage(null);
    try {
      await updateConnectionSettings(next);
      setSaveMessage('Connection saved. TikFinity will reconnect with these settings.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'The connection settings could not be saved.';
      setFormError(text);
      reportError(text);
    } finally {
      setSaving(false);
    }
  }

  async function checkDatabase() {
    setDatabase({ status: 'checking' });
    const { error } = await supabase.from('gift_rules').select('id', { count: 'exact', head: true });
    if (error) {
      setDatabase({ status: 'error', message: 'The database did not respond. Check the project connection settings.' });
      return;
    }
    setDatabase({ status: 'ok', checkedAt: new Date().toISOString() });
  }

  useEffect(() => {
    void checkDatabase();
  }, []);

  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="System Settings"
        description="Connection to TikFinity, service status, and recent activity logs."
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card
          title="TikFinity connection"
          description="Use the address shown in TikFinity Desktop. The default is localhost on port 21213."
          className="xl:col-span-2"
          action={<Badge tone={CONNECTION_TONE[connection.state]} dot>{CONNECTION_LABEL[connection.state]}</Badge>}
        >
          <form onSubmit={handleSave} className="grid gap-4 md:grid-cols-[1fr_200px]">
            <div>
              <label htmlFor="tikfinity-host" className="mb-2 block text-sm font-medium text-slate-300">Host</label>
              <input
                id="tikfinity-host"
                className="field w-full font-mono"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="localhost"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="tikfinity-port" className="mb-2 block text-sm font-medium text-slate-300">Port</label>
              <input
                id="tikfinity-port"
                className="field w-full font-mono"
                inputMode="numeric"
                value={port}
                onChange={(event) => setPort(event.target.value)}
                placeholder="21213"
              />
            </div>
            <div className="flex flex-col gap-3 md:col-span-2 md:flex-row md:items-center md:justify-between">
              <div className="min-h-5 text-sm" role="status">
                {formError && <span className="text-danger-400">{formError}</span>}
                {!formError && saveMessage && <span className="text-success-300">{saveMessage}</span>}
                {!formError && !saveMessage && <span className="text-slate-500">{connection.detail}</span>}
              </div>
              <Button type="submit" variant="primary" disabled={saving} icon={<Save className="h-4 w-4" />}>
                {saving ? 'Saving...' : 'Save connection'}
              </Button>
            </div>
          </form>
        </Card>

        <Card title="Service status" description="Checked each time this page opens.">
          <ul className="flex flex-col gap-4 text-sm">
            <StatusRow
              icon={<Radio className="h-4 w-4" />}
              label="TikFinity WebSocket"
              value={CONNECTION_LABEL[connection.state]}
              tone={CONNECTION_TONE[connection.state]}
            />
            <StatusRow
              icon={<Database className="h-4 w-4" />}
              label="Database"
              value={
                database.status === 'ok'
                  ? `Responding (${formatClockTime(database.checkedAt)})`
                  : database.status === 'checking'
                    ? 'Checking...'
                    : database.status === 'error'
                      ? 'Not responding'
                      : 'Not checked'
              }
              tone={database.status === 'ok' ? 'success' : database.status === 'error' ? 'danger' : 'neutral'}
            />
            <StatusRow
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Browser speech"
              value={speechSupported ? 'Available' : 'Not supported in this browser'}
              tone={speechSupported ? 'success' : 'warning'}
            />
          </ul>
          <div className="mt-5">
            <Button variant="secondary" onClick={checkDatabase} disabled={database.status === 'checking'} icon={<RefreshCw className="h-4 w-4" />}>
              Check database again
            </Button>
          </div>
          {database.status === 'error' && (
            <div className="mt-4">
              <StateMessage kind="error" title="Database unreachable" description={database.message} />
            </div>
          )}
        </Card>

        <Card
          title="Activity log"
          description="The most recent messages received from TikFinity in this session. Newest first."
          className="xl:col-span-3"
          action={<ScrollText className="h-5 w-5 text-slate-500" aria-hidden="true" />}
        >
          {diagnostics.length === 0 ? (
            <StateMessage
              kind="empty"
              title="No messages yet"
              description="When TikFinity sends events, a short preview of each one appears here."
            />
          ) : (
            <ul className="max-h-96 divide-y divide-line/60 overflow-y-auto font-mono text-xs">
              {diagnostics.map((entry) => (
                <li key={entry.id} className="flex items-start gap-4 py-2.5">
                  <span className="shrink-0 text-slate-500">{formatClockTime(entry.receivedAt)}</span>
                  <Badge tone={entry.recognized ? 'success' : 'warning'}>{entry.recognized ? 'Recognized' : 'Ignored'}</Badge>
                  <span className="min-w-0 truncate text-slate-300">{entry.preview}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Roblox and cache" description="Public lookups are stored briefly so repeat checks load quickly." className="xl:col-span-3">
          <div className="grid gap-4 md:grid-cols-3">
            <InfoBlock icon={<Settings2 className="h-4 w-4" />} title="Cache lifetime" text="Account lookups are reused for 30 minutes before Roblox is queried again." />
            <InfoBlock icon={<Settings2 className="h-4 w-4" />} title="Catalog estimates" text="Values are catalog prices of priced items only. They are not spending or market value." />
            <InfoBlock icon={<Settings2 className="h-4 w-4" />} title="Private inventories" text="When a Roblox inventory is private, only equipped items are shown and the page says so." />
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatusRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: BadgeTone;
}) {
  return (
    <li className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-slate-300">
        <span className="text-slate-500">{icon}</span>
        {label}
      </span>
      <Badge tone={tone}>{value}</Badge>
    </li>
  );
}

function InfoBlock({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-line bg-raised/50 p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
        <span className="text-primary-300">{icon}</span>
        {title}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
    </div>
  );
}
