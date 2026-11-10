import { useEffect, useState } from 'react';
import { DEFAULT_PATH, OVERLAY_PATH } from '@/components/navigation/routes';

function readPath(): string {
  const path = window.location.hash.replace(/^#/, '').split('?')[0];
  return path === '' ? DEFAULT_PATH : path;
}

export default function useHashPath(): string {
  const [path, setPath] = useState(readPath);

  useEffect(() => {
    const handleChange = () => setPath(readPath());
    window.addEventListener('hashchange', handleChange);
    return () => window.removeEventListener('hashchange', handleChange);
  }, []);

  return path;
}

export function isOverlayPath(path: string): boolean {
  return path === OVERLAY_PATH;
}
