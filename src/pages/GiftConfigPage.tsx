import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import StateMessage from '@/components/ui/StateMessage';
import { useLive } from '@/context/live-context';
import { TIER_LABEL } from '@/lib/review-queue';
import { formatNumber } from '@/lib/format';
import {
  createGiftRule,
  deleteGiftRule,
  setGiftRuleEnabled,
  updateGiftRule,
  type GiftRuleInput,
} from '@/services/data/gift-rules';
import type { GiftRule, QueueTier } from '@/types/live';

const TIER_OPTIONS: QueueTier[] = ['vip_express', 'fast_track', 'normal'];

const TIER_TONE: Record<QueueTier, 'accent' | 'warning' | 'primary'> = {
  vip_express: 'accent',
  fast_track: 'warning',
  normal: 'primary',
};

interface FormState {
  giftName: string;
  coinValue: string;
  tier: QueueTier;
  enabled: boolean;
}

const EMPTY_FORM: FormState = { giftName: '', coinValue: '', tier: 'fast_track', enabled: true };

function toFormState(rule: GiftRule): FormState {
  return {
    giftName: rule.gift_name,
    coinValue: String(rule.coin_value),
    tier: rule.tier,
    enabled: rule.enabled,
  };
}

function validate(form: FormState): { input: GiftRuleInput } | { error: string } {
  const giftName = form.giftName.trim();
  if (giftName.length === 0) return { error: 'Enter the gift name exactly as TikTok shows it.' };
  if (giftName.length > 80) return { error: 'Gift names can be up to 80 characters.' };
  const coinValue = Number(form.coinValue);
  if (!Number.isInteger(coinValue) || coinValue <= 0) {
    return { error: 'Coin value must be a whole number greater than zero.' };
  }
  return { input: { gift_name: giftName, coin_value: coinValue, tier: form.tier, enabled: form.enabled } };
}

type EditorState = { mode: 'create' } | { mode: 'edit'; rule: GiftRule } | null;

export default function GiftConfigPage() {
  const { giftRules, refreshGiftRules, reportError } = useLive();
  const [editor, setEditor] = useState<EditorState>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function openCreate() {
    setEditor({ mode: 'create' });
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function openEdit(rule: GiftRule) {
    setEditor({ mode: 'edit', rule });
    setForm(toFormState(rule));
    setFormError(null);
  }

  function closeEditor() {
    setEditor(null);
    setFormError(null);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(form);
    if ('error' in result) {
      setFormError(result.error);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editor?.mode === 'edit') {
        await updateGiftRule(editor.rule.id, result.input);
      } else {
        await createGiftRule(result.input);
      }
      await refreshGiftRules();
      closeEditor();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The gift rule could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function runRowAction(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setActionError(null);
    try {
      await action();
      await refreshGiftRules();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'The change could not be saved.';
      setActionError(text);
      reportError(text);
    } finally {
      setBusyId(null);
    }
  }

  function handleDelete(rule: GiftRule) {
    if (!window.confirm(`Delete the rule for "${rule.gift_name}"? Past gifts keep their records.`)) return;
    runRowAction(rule.id, () => deleteGiftRule(rule.id));
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Gift Configuration"
        description="Choose which TikTok gifts earn a queue priority, and how much each one is worth."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Add gift rule
          </Button>
        }
      />

      {actionError && (
        <div className="mb-6">
          <StateMessage kind="error" title="Change not saved" description={actionError} />
        </div>
      )}

      {editor && (
        <Card
          className="mb-6"
          title={editor.mode === 'edit' ? `Edit "${editor.rule.gift_name}"` : 'New gift rule'}
          description="A viewer earns the tier once their gift total reaches the coin value."
          action={
            <button
              type="button"
              onClick={closeEditor}
              aria-label="Close editor"
              className="rounded-lg p-2 text-slate-400 transition hover:bg-raised hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          }
        >
          <form onSubmit={handleSave} className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="gift-name" className="mb-2 block text-sm font-medium text-slate-300">Gift name</label>
              <input
                id="gift-name"
                className="field w-full"
                value={form.giftName}
                onChange={(event) => setForm({ ...form, giftName: event.target.value })}
                placeholder="Rose"
                maxLength={80}
              />
            </div>
            <div>
              <label htmlFor="coin-value" className="mb-2 block text-sm font-medium text-slate-300">Coin value</label>
              <input
                id="coin-value"
                className="field w-full"
                inputMode="numeric"
                value={form.coinValue}
                onChange={(event) => setForm({ ...form, coinValue: event.target.value })}
                placeholder="100"
              />
            </div>
            <div>
              <label htmlFor="gift-tier" className="mb-2 block text-sm font-medium text-slate-300">Priority tier</label>
              <select
                id="gift-tier"
                className="field w-full"
                value={form.tier}
                onChange={(event) => setForm({ ...form, tier: event.target.value as QueueTier })}
              >
                {TIER_OPTIONS.map((tier) => (
                  <option key={tier} value={tier}>{TIER_LABEL[tier]}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-3 self-end rounded-lg border border-line bg-raised/60 px-4 py-2.5 text-sm text-slate-200">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary-500"
                checked={form.enabled}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
              />
              Rule is active
            </label>
            {formError && (
              <p role="alert" className="text-sm text-danger-400 md:col-span-2">{formError}</p>
            )}
            <div className="flex justify-end gap-2 md:col-span-2">
              <Button variant="ghost" onClick={closeEditor}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save rule'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Rules" description="Active rules are checked against every gift that arrives.">
        {giftRules.length === 0 ? (
          <StateMessage
            kind="empty"
            title="No gift rules yet"
            description="Add a rule to start giving queue priority for specific gifts."
            action={<Button variant="secondary" onClick={openCreate}>Add the first rule</Button>}
          />
        ) : (
          <ul className="divide-y divide-line/60">
            {giftRules.map((rule) => (
              <li key={rule.id} className="flex flex-col gap-3 py-4 transition hover:bg-raised/30 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-white">{rule.gift_name}</p>
                    <Badge tone={TIER_TONE[rule.tier]}>{TIER_LABEL[rule.tier]}</Badge>
                    {!rule.enabled && <Badge tone="neutral">Paused</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{formatNumber(rule.coin_value)} coins</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    className="px-3 py-1.5"
                    disabled={busyId === rule.id}
                    onClick={() => runRowAction(rule.id, () => setGiftRuleEnabled(rule.id, !rule.enabled))}
                  >
                    {rule.enabled ? 'Pause' : 'Activate'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5"
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    disabled={busyId === rule.id}
                    onClick={() => openEdit(rule)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    className="px-3 py-1.5"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    disabled={busyId === rule.id}
                    onClick={() => handleDelete(rule)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
