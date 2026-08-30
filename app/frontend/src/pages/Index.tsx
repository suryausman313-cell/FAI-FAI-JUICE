import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const WELCOME_SEEN_KEY = 'fai_fai_welcome_ad_seen_v2';
const AD_DURATION_MS = 22000;

function hasSeenWelcomeAd(): boolean {
  try {
    return sessionStorage.getItem(WELCOME_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markWelcomeAdSeen() {
  try {
    sessionStorage.setItem(WELCOME_SEEN_KEY, '1');
  } catch {
    // If storage is unavailable, the ad still works for this render.
  }
}

export default function Index() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(() => !hasSeenWelcomeAd());
  const timerRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    markWelcomeAdSeen();
    setVisible(false);
    // Keep the customer on the real Home/Menu route after the ad.
    navigate('/menu', { replace: true });
  };

  useEffect(() => {
    if (!visible) return;

    // The welcome artwork is an animated WebP rather than a <video> element.
    // This completely removes browser video controls/play overlays.
    timerRef.current = window.setTimeout(finish, AD_DURATION_MS);

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      aria-label="Welcome advertisement"
      role="dialog"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        background: '#000',
        overflow: 'hidden',
      }}
    >
      <img
        src="/fai-fai-welcome-animation-v2.webp?v=20260830-2"
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      <button
        type="button"
        onClick={finish}
        style={{
          position: 'absolute',
          top: 18,
          right: 18,
          zIndex: 2,
          padding: '9px 17px',
          border: 0,
          borderRadius: 999,
          background: 'rgba(0,0,0,.65)',
          color: '#fff',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Skip
      </button>
    </div>
  );
}
