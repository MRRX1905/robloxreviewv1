import { useEffect, useRef, useState, type RefObject } from 'react';
import { Check, Copy, ExternalLink, Monitor } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

const OVERLAY_WIDTH = 1920;
const OVERLAY_HEIGHT = 1080;

function buildOverlayUrl(): string {
  const base = window.location.href.split('#')[0];
  return `${base}#/overlay`;
}

function usePreviewScale(containerRef: RefObject<HTMLDivElement>): number {
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / OVERLAY_WIDTH);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);
  return scale;
}

export default function ObsOverlayPage() {
  const overlayUrl = buildOverlayUrl();
  const previewRef = useRef<HTMLDivElement>(null);
  const scale = usePreviewScale(previewRef);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      setCopyFailed(false);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="OBS Overlay"
        description="Add this page to OBS as a Browser Source so viewers see the current review on your stream."
        actions={<Badge tone="primary">1920 x 1080</Badge>}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Browser Source setup" description="Use these values in OBS." className="xl:col-span-1">
          <ol className="flex flex-col gap-4 text-sm text-slate-300">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-xs font-semibold text-primary-300 ring-1 ring-primary-500/30">1</span>
              In OBS, add a Browser source to your scene.
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-xs font-semibold text-primary-300 ring-1 ring-primary-500/30">2</span>
              Paste the address below into the URL field.
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-xs font-semibold text-primary-300 ring-1 ring-primary-500/30">3</span>
              Set Width to 1920 and Height to 1080, then keep the page visible while you stream.
            </li>
          </ol>

          <div className="mt-6 flex flex-col gap-3">
            <label htmlFor="overlay-url" className="text-sm font-medium text-slate-300">Browser Source address</label>
            <div className="flex gap-2">
              <input id="overlay-url" readOnly value={overlayUrl} className="field min-w-0 flex-1 font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
              <Button
                variant="secondary"
                onClick={copyUrl}
                icon={copied ? <Check className="h-4 w-4 text-success-300" /> : <Copy className="h-4 w-4" />}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            {copyFailed && (
              <p className="text-sm text-danger-400">The address could not be copied. Select it and copy it manually.</p>
            )}
            <a
              href={overlayUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary-300 transition hover:text-primary-200"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open the overlay in a new tab
            </a>
          </div>
        </Card>

        <Card
          title="Live preview"
          description="This is how the overlay looks on stream. Transparent areas show your scene."
          className="xl:col-span-2"
          action={<Monitor className="h-5 w-5 text-slate-500" aria-hidden="true" />}
        >
          <div
            ref={previewRef}
            className="relative w-full overflow-hidden rounded-xl bg-[linear-gradient(135deg,#0c1426,#0a2230)] ring-1 ring-line"
            style={{ height: `${OVERLAY_HEIGHT * scale}px` }}
          >
            <iframe
              title="Overlay preview"
              src={overlayUrl}
              width={OVERLAY_WIDTH}
              height={OVERLAY_HEIGHT}
              className="absolute left-0 top-0 origin-top-left border-0"
              style={{ transform: `scale(${scale})` }}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
