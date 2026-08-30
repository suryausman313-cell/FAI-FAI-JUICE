import React, { useEffect, useRef, useState } from "react";

export default function Index() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.volume = 0;
    v.play().catch(() => {});
  }, []);

  if (!visible) return null;

  return (
    <div style={{position:"fixed",inset:0,zIndex:2147483647,background:"#000",overflow:"hidden"}}>
      <video
        ref={videoRef}
        src="/fai-fai-welcome-video.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        controls={false}
        onEnded={() => setVisible(false)}
        style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}
      />
      <button
        type="button"
        onClick={() => setVisible(false)}
        style={{position:"absolute",top:18,right:18,zIndex:2147483648,padding:"9px 17px",
          border:0,borderRadius:999,background:"rgba(0,0,0,.65)",color:"#fff",
          fontSize:15,fontWeight:700}}
      >Skip</button>
    </div>
  );
}
