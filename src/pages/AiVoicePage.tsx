import { useEffect, useState, type FormEvent } from 'react';
import { Mic, Play, Save, Square, Volume2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import StateMessage from '@/components/ui/StateMessage';
import { NARRATION_STYLES, buildNarration } from '@/lib/narration';
import { getAppSetting, saveAppSetting } from '@/services/data/app-settings';
import { lookupRobloxAccount } from '@/services/roblox/roblox-lookup';
import type { NarrationSettings, NarrationStyle, RobloxLookupResult } from '@/types/live';

const NARRATION_SETTINGS_KEY = 'narration';
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

const DEFAULT_SETTINGS: NarrationSettings = {
  voice: '',
  rate: 1,
  pitch: 1,
  style: 'professional',
};

function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function useBrowserVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!speechAvailable()) return;
    const synth = window.speechSynthesis;
    const load = () => setVoices(synth.getVoices());
    load();
    synth.addEventListener('voiceschanged', load);
    return () => synth.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
}

export default function AiVoicePage() {
  const voices = useBrowserVoices();
  const [settings, setSettings] = useState<NarrationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<RobloxLookupResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAppSetting<NarrationSettings>(NARRATION_SETTINGS_KEY)
      .then((saved) => {
        if (!cancelled && saved) setSettings({ ...DEFAULT_SETTINGS, ...saved });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Settings could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (speechAvailable()) window.speechSynthesis.cancel();
    };
  }, []);

  const narrationText = previewResult ? buildNarration(previewResult, settings.style) : null;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      await saveAppSetting(NARRATION_SETTINGS_KEY, settings);
      setSaveMessage('Voice and style saved.');
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Settings could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = username.trim();
    if (!USERNAME_PATTERN.test(trimmed)) {
      setInputError('Use 3 to 20 letters, numbers, or underscores.');
      return;
    }
    setInputError(null);
    setPreviewing(true);
    setPreviewError(null);
    try {
      setPreviewResult(await lookupRobloxAccount(trimmed));
    } catch (error) {
      setPreviewResult(null);
      setPreviewError(error instanceof Error ? error.message : 'The preview could not be generated.');
    } finally {
      setPreviewing(false);
    }
  }

  function speak(text: string) {
    if (!speechAvailable()) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = voices.find((voice) => voice.name === settings.voice);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  }

  function stopSpeaking() {
    if (speechAvailable()) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  if (loading) {
    return (
      <div className="animate-fade-in-up">
        <PageHeader title="AI & Voice" description="Choose how narration sounds on stream." />
        <Card>
          <StateMessage kind="loading" title="Loading voice settings" />
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="AI & Voice"
        description="Narration is written only from verified Roblox data. Missing values are left out, never guessed."
        actions={<Badge tone={speechAvailable() ? 'success' : 'danger'} dot>{speechAvailable() ? 'Speech ready' : 'Speech unavailable'}</Badge>}
      />

      {loadError && (
        <div className="mb-6">
          <StateMessage kind="error" title="Settings not loaded" description={`${loadError} Showing defaults.`} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Voice and style" description="These settings apply to every narration on the overlay.">
          <form onSubmit={handleSave} className="flex flex-col gap-5">
            <div>
              <label htmlFor="narration-style" className="mb-2 block text-sm font-medium text-slate-300">Style</label>
              <select
                id="narration-style"
                className="field w-full"
                value={settings.style}
                onChange={(event) => setSettings({ ...settings, style: event.target.value as NarrationStyle })}
              >
                {NARRATION_STYLES.map((style) => (
                  <option key={style.value} value={style.value}>{style.label}</option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">
                {NARRATION_STYLES.find((style) => style.value === settings.style)?.description}
              </p>
            </div>

            <div>
              <label htmlFor="narration-voice" className="mb-2 block text-sm font-medium text-slate-300">Voice</label>
              {voices.length === 0 ? (
                <p className="rounded-lg border border-line bg-raised/60 px-4 py-2.5 text-sm text-slate-400">
                  No browser voices found. The default voice will be used.
                </p>
              ) : (
                <select
                  id="narration-voice"
                  className="field w-full"
                  value={settings.voice}
                  onChange={(event) => setSettings({ ...settings, voice: event.target.value })}
                >
                  <option value="">Browser default</option>
                  {voices.map((voice) => (
                    <option key={voice.name} value={voice.name}>{voice.name} ({voice.lang})</option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="narration-rate" className="mb-2 flex justify-between text-sm font-medium text-slate-300">
                  Speed <span className="font-mono text-slate-400">{settings.rate.toFixed(1)}x</span>
                </label>
                <input
                  id="narration-rate"
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={settings.rate}
                  onChange={(event) => setSettings({ ...settings, rate: Number(event.target.value) })}
                  className="w-full accent-primary-500"
                />
              </div>
              <div>
                <label htmlFor="narration-pitch" className="mb-2 flex justify-between text-sm font-medium text-slate-300">
                  Pitch <span className="font-mono text-slate-400">{settings.pitch.toFixed(1)}</span>
                </label>
                <input
                  id="narration-pitch"
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={settings.pitch}
                  onChange={(event) => setSettings({ ...settings, pitch: Number(event.target.value) })}
                  className="w-full accent-primary-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-400" role="status">{saveMessage ?? ''}</p>
              <Button type="submit" variant="primary" disabled={saving} icon={<Save className="h-4 w-4" />}>
                {saving ? 'Saving...' : 'Save voice settings'}
              </Button>
            </div>
          </form>
        </Card>

        <Card title="Test narration" description="Pick a public Roblox account to hear the narration for it.">
          <form onSubmit={handlePreview} className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <label htmlFor="preview-username" className="sr-only">Roblox username</label>
              <input
                id="preview-username"
                className="field w-full"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Roblox username"
                autoComplete="off"
                aria-invalid={inputError !== null}
              />
              {inputError && <p className="mt-2 text-sm text-danger-400">{inputError}</p>}
            </div>
            <Button type="submit" variant="secondary" disabled={previewing} icon={<Mic className="h-4 w-4" />}>
              {previewing ? 'Generating...' : 'Generate'}
            </Button>
          </form>

          <div className="mt-6">
            {previewing && <StateMessage kind="loading" title="Reading verified account data" />}
            {!previewing && previewError && <StateMessage kind="error" title="Preview unavailable" description={previewError} />}
            {!previewing && !previewError && !narrationText && (
              <StateMessage kind="empty" title="No preview yet" description="Generate a preview to see the script." />
            )}
            {!previewing && !previewError && narrationText && (
              <div className="flex flex-col gap-4 rounded-xl border border-line bg-raised/60 p-5">
                <p className="text-sm leading-relaxed text-slate-200">{narrationText}</p>
                <div className="flex flex-wrap gap-2">
                  {speaking ? (
                    <Button variant="secondary" icon={<Square className="h-4 w-4" />} onClick={stopSpeaking}>
                      Stop
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      icon={<Play className="h-4 w-4" />}
                      disabled={!speechAvailable()}
                      onClick={() => speak(narrationText)}
                    >
                      Play narration
                    </Button>
                  )}
                  <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Uses this browser's built-in voice
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
