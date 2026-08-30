import React, { useCallback, useEffect, useRef, useState } from 'react';

interface IndexProps {
  onDone?: () => void;
}

/**
 * Welcome advertisement overlay.
 *
 * The customer Menu is rendered underneath this overlay by App.tsx, so when
 * the ad finishes (or Skip is pressed) the real Home/Menu is already mounted
 * and is revealed immediately. The overlay never navigates to another route.
 */
export default function Index({ onDone }: IndexProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const [visible, setVisible] = useState(true);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setVisible(false);
    onDone?.();
  }, [onDone]);

  const startVideo = useCallback(async () => {
    const video = videoRef.current;
    if (!video || doneRef.current) return;

    // Set these as properties as well as JSX attributes. This is important on
    // Android/Samsung browsers where autoplay policy is checked very early.
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;

    try {
      await video.play();
    } catch {
      // Autoplay can be blocked by the browser. We keep the video visually
      // hidden until it actually starts, and a tap anywhere retries playback.
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;

    // Try immediately and again after the media is ready. Some Android WebViews
    // reject play() until the media element has loaded enough data.
    void startVideo();
    const retry = () => void startVideo();
    video.addEventListener('loadeddata', retry);
    video.addEventListener('canplay', retry);

    return () => {
      video.removeEventListener('loadeddata', retry);
      video.removeEventListener('canplay', retry);
    };
  }, [startVideo]);

  useEffect(() => {
    if (!visible) return;

    const retryOnVisible = () => {
      if (document.visibilityState === 'visible') void startVideo();
    };

    document.addEventListener('visibilitychange', retryOnVisible);
    return () => document.removeEventListener('visibilitychange', retryOnVisible);
  }, [visible, startVideo]);

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
      onPointerDown={() => void startVideo()}
      onTouchStart={() => void startVideo()}
    >
      {/*
        The poster is shown until playback really starts. This prevents the
        browser's native centered ▶ overlay from ever being visible when
        autoplay is temporarily blocked.
      */}
      <img
        src="/fai-fai-welcome-poster.jpg"
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: videoPlaying ? 0 : 1,
          transition: 'opacity 120ms linear',
          pointerEvents: 'none',
        }}
      />

      <video
        ref={videoRef}
        src="/fai-fai-welcome-video.mp4"
        autoPlay
        muted
        defaultMuted
        playsInline
        preload="auto"
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        onPlaying={() => setVideoPlaying(true)}
        onEnded={finish}
        onError={finish}
        // Prevent browser-specific media UI from being requested.
        controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: videoPlaying ? 1 : 0,
          pointerEvents: 'none',
          background: 'transparent',
        }}
      />

      {/* The only visible control is our own Skip button. */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          finish();
        }}
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
        }}
      >
        Skip
      </button>
    </div>
  );
}
