"use client";
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';

export default function MediaPreview({ contentKey, kind, keyStr }: { contentKey: string; kind: 'image'|'video'; keyStr: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/media/download-url?key=${encodeURIComponent(contentKey)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (isMounted) setUrl(data.url);
      } catch {}
    })();
    return () => { isMounted = false; };
  }, [contentKey]);

  if (!url) return <span>loading media…</span>;
  return kind === 'image' ? (
    <img src={url} alt="image" style={{ maxWidth: '100%', maxHeight: 200, display: 'block' }} />
  ) : (
    <video src={url} controls style={{ maxWidth: '100%', maxHeight: 240, display: 'block' }} />
  );
}

