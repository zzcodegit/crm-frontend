import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const HTML_CLASS = "crm-chat-image-lightbox-open";
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

type ChatImageLightboxProps = {
  url: string;
  filename?: string | null;
  onClose: () => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Просмотр фото из чата: портал в body, изоляция от overflow чата,
 * блокировка системного pinch-zoom Safari, зум/пан без setState на каждый touchmove.
 */
export default function ChatImageLightbox({ url, filename, onClose }: ChatImageLightboxProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const applyTransform = useCallback(() => {
    const el = layerRef.current;
    if (!el) return;
    const { x, y } = panRef.current;
    const z = zoomRef.current;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${z})`;
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add(HTML_CLASS);
    window.dispatchEvent(new CustomEvent("crm-chat-image-lightbox-open"));

    const preventGesture = (e: Event) => {
      e.preventDefault();
    };
    const preventDocumentTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };

    document.addEventListener("gesturestart", preventGesture, { passive: false });
    document.addEventListener("gesturechange", preventGesture, { passive: false });
    document.addEventListener("gestureend", preventGesture, { passive: false });
    document.addEventListener("touchmove", preventDocumentTouchMove, { passive: false });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      html.classList.remove(HTML_CLASS);
      window.dispatchEvent(new CustomEvent("crm-chat-image-lightbox-close"));
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("gestureend", preventGesture);
      document.removeEventListener("touchmove", preventDocumentTouchMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      panStartRef.current = null;
      const a = e.touches[0];
      const b = e.touches[1];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      if (dist > 0) pinchRef.current = { dist, zoom: zoomRef.current };
      return;
    }
    if (e.touches.length === 1 && zoomRef.current > 1) {
      pinchRef.current = null;
      const t = e.touches[0];
      panStartRef.current = { x: t.clientX, y: t.clientY, panX: panRef.current.x, panY: panRef.current.y };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.touches.length === 2 && pinchRef.current) {
      const a = e.touches[0];
      const b = e.touches[1];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const { dist: startDist, zoom: startZoom } = pinchRef.current;
      if (startDist > 0) {
        zoomRef.current = clamp(startZoom * (dist / startDist), ZOOM_MIN, ZOOM_MAX);
        if (zoomRef.current <= 1) {
          panRef.current = { x: 0, y: 0 };
        }
        applyTransform();
      }
      return;
    }

    if (e.touches.length === 1 && panStartRef.current && zoomRef.current > 1) {
      const t = e.touches[0];
      const s = panStartRef.current;
      panRef.current = {
        x: s.panX + (t.clientX - s.x),
        y: s.panY + (t.clientY - s.y),
      };
      applyTransform();
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) {
      panStartRef.current = null;
      if (zoomRef.current <= 1.02) {
        zoomRef.current = 1;
        panRef.current = { x: 0, y: 0 };
        applyTransform();
      }
      return;
    }
    if (e.touches.length === 1 && zoomRef.current > 1) {
      const t = e.touches[0];
      panStartRef.current = { x: t.clientX, y: t.clientY, panX: panRef.current.x, panY: panRef.current.y };
    }
  };

  const content = (
    <div
      className="crm-chat-image-lightbox fixed inset-0 flex flex-col"
      style={{
        zIndex: 10050,
        background: "rgba(0,0,0,0.9)",
        touchAction: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={filename || "Фото"}
      onClick={onClose}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-2 px-3 py-3 border-b"
        style={{ borderColor: "rgba(255,255,255,0.12)", paddingTop: "max(12px, env(safe-area-inset-top))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm truncate text-white/90 min-w-0">{filename || "Фото"}</div>
        <div className="flex gap-2 shrink-0">
          <a
            href={url}
            download={filename || undefined}
            className="px-3 py-2 rounded-xl text-sm text-white border"
            style={{ borderColor: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            Скачать
          </a>
          <button
            type="button"
            className="px-3 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "rgba(220,38,38,0.85)" }}
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
      </div>
      <div
        className="relative flex-1 min-h-0 overflow-hidden flex items-center justify-center"
        style={{ touchAction: "none" }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div ref={layerRef} style={{ transformOrigin: "center center" }}>
          <img
            src={url}
            alt={filename || "Фото"}
            className="select-none max-w-[min(96vw,1200px)] max-h-[min(78dvh,1200px)] w-auto h-auto object-contain pointer-events-none"
            draggable={false}
            decoding="async"
          />
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
