import { useEffect, useRef, useState } from 'react';

/** เล่นสตรีม HLS (Safari เล่นเองได้ เบราว์เซอร์อื่นใช้ hls.js) */
export function HlsPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    setErr(null);
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      void video.play().catch(() => undefined);
    } else {
      void import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) return setErr('เบราว์เซอร์นี้เล่น HLS ไม่ได้');
        const h = new Hls({ lowLatencyMode: true });
        h.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) setErr('เล่นสตรีมไม่ได้ (กล้องอาจยังไม่ส่งภาพ)');
        });
        h.loadSource(src);
        h.attachMedia(video);
        hls = h;
        void video.play().catch(() => undefined);
      });
    }
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [src]);

  return (
    <div className="player">
      <video ref={ref} controls muted playsInline />
      {err && <div className="player-err">{err}</div>}
    </div>
  );
}
