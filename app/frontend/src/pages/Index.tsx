import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Fai Fai customer launch screen.
 *
 * The welcome video is intentionally rendered without native controls.
 * If a browser blocks autoplay (or the video fails), we immediately use a
 * lightweight branded fallback instead of leaving the customer on a black
 * screen with a native play button.
 */
export default function Index() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showVideo, setShowVideo] = useState(true);
  const [showFallback, setShowFallback] = useState(false);

  const goToMenu = () => {
    if (fallbackTimer.current) {
      clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }
    navigate("/menu", { replace: true });
  };

  const startFallback = () => {
    setShowVideo(false);
    setShowFallback(true);

    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = setTimeout(goToMenu, 4000);
  };

  const tryPlay = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Autoplay was blocked. Do not show the browser's play button;
        // switch to the branded fallback and continue automatically.
        startFallback();
      });
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    tryPlay();

    return () => {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        overflow: "hidden",
        background: "#050505",
      }}
    >
      {showVideo && (
        <video
          ref={videoRef}
          src="/fai-fai-welcome-video.mp4"
          autoPlay
          muted
          playsInline
          preload="auto"
          controls={false}
          disablePictureInPicture
          disableRemotePlayback
          onCanPlay={tryPlay}
          onLoadedData={tryPlay}
          onEnded={goToMenu}
          onError={startFallback}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            pointerEvents: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        />
      )}

      {showFallback && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            background:
              "radial-gradient(circle at 50% 35%, rgba(239,68,68,.20), transparent 35%), radial-gradient(circle at 25% 80%, rgba(34,197,94,.16), transparent 30%), #050505",
            color: "#fff",
          }}
        >
          <div style={{ padding: 24 }}>
            <div
              style={{
                width: 82,
                height: 82,
                margin: "0 auto 20px",
                display: "grid",
                placeItems: "center",
                borderRadius: "50%",
                background: "linear-gradient(135deg,#ef4444,#f97316,#22c55e)",
                fontSize: 30,
                fontWeight: 900,
                boxShadow: "0 16px 45px rgba(0,0,0,.45)",
              }}
            >
              FF
            </div>
            <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1 }}>
              FAI FAI
            </div>
            <div
              style={{
                marginTop: 10,
                color: "rgba(255,255,255,.70)",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Fresh drinks made for you
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={goToMenu}
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          zIndex: 2,
          padding: "9px 17px",
          border: 0,
          borderRadius: 999,
          background: "rgba(0,0,0,.68)",
          color: "#fff",
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Skip
      </button>
    </div>
  );
}
