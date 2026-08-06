import { useEffect, useRef } from 'react';
import styles from './vacancy.module.css';

// Himoyalangan media: rasm canvas'ga chiziladi (img tegi DOM'da qolmaydi),
// video esa yuklab olish/PiP/kontekst menyusiz ko'rsatiladi.
// 100% himoya emas — maqsad saqlab olishni maksimal qiyinlashtirish.
function block(event) {
  event.preventDefault();
  return false;
}

export default function ProtectedMedia({ url, type }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (type !== 'image' || !url) return undefined;
    let alive = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (!alive) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxWidth = 260;
      const scale = Math.min(1, maxWidth / image.width);
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = url;
    return () => {
      alive = false;
    };
  }, [url, type]);

  if (type === 'video') {
    return (
      <video
        className={styles.protectedMedia}
        src={url}
        controls
        playsInline
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        onContextMenu={block}
        onDragStart={block}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={styles.protectedMedia}
      onContextMenu={block}
      onDragStart={block}
    />
  );
}
