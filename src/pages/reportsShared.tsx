import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";

export const inputStyle: React.CSSProperties = {
  background: "var(--bg-primary)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  borderRadius: "12px",
  padding: "10px 14px",
  width: "100%",
};

export function uploadReportFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const token = localStorage.getItem("token");
  return fetch("/api/upload/report", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text();
      let msg = "Ошибка загрузки";
      try {
        const d = JSON.parse(text);
        const detail = d.detail;
        if (typeof detail === "string") msg = detail;
        else if (Array.isArray(detail) && detail[0]?.msg) msg = detail.map((x: { msg?: string }) => x.msg).join("; ");
      } catch {
        if (res.status === 413) msg = "Файл слишком большой (максимум 100 МБ)";
        else if (res.status === 401) msg = "Нужна авторизация";
      }
      return Promise.reject(new Error(msg));
    }
    const d = (await res.json()) as { url?: string; filename?: string };
    const url = d?.url ?? (d?.filename ? `/uploads/${d.filename}` : "");
    if (!url) throw new Error("Нет ссылки в ответе");
    return url;
  });
}

export const isPdfUrl = (url: string) => url.toLowerCase().endsWith(".pdf");
/** Браузеры обычно не рендерят HEIC в img — не пытаемся показывать превью. */
export const isHeicUrl = (url: string) => {
  const u = url.toLowerCase().split("?")[0] ?? "";
  return u.endsWith(".heic") || u.endsWith(".heif");
};
export const fileFileName = (url: string) => url.split("/").pop() || "файл";

type HeicConverter = (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]>;

function useHeicPreviewUrl(url: string | null) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(url);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (!url) {
      setPreviewUrl(null);
      setLoading(false);
      setError(false);
      return;
    }

    if (!isHeicUrl(url)) {
      setPreviewUrl(url);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    setPreviewUrl(null);

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Не удалось загрузить HEIC");
        const srcBlob = await res.blob();
        const mod = await import("heic2any");
        const convert = (mod.default ?? mod) as unknown as HeicConverter;
        const converted = await convert({ blob: srcBlob, toType: "image/jpeg", quality: 0.92 });
        const outBlob = Array.isArray(converted) ? converted[0] : converted;
        objectUrl = URL.createObjectURL(outBlob);
        if (cancelled) return;
        setPreviewUrl(objectUrl);
      } catch {
        if (cancelled) return;
        setError(true);
        setPreviewUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return { previewUrl, loading, error };
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.15;

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}

/**
 * Полноэкранный просмотр вложений (Z-отчёт, сверка по картам): масштаб (колёсико в любом месте области,
 * с фокусом на курсор; кнопки), перетаскивание при увеличении, pinch на тач-экране, поворот на 90°.
 * Несколько снимков: стрелки на клавиатуре (←/→), кнопки «Пред./След.» и счётчик в панели.
 */
export function ReportImageLightbox({
  gallery,
  onClose,
}: {
  gallery: { urls: string[]; index: number } | null;
  onClose: () => void;
}) {
  const [internalIndex, setInternalIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!gallery?.urls?.length) return;
    setInternalIndex(Math.min(Math.max(0, gallery.index), gallery.urls.length - 1));
  }, [gallery]);

  const galleryLen = gallery?.urls.length ?? 0;
  const safeIndex = galleryLen > 0 ? Math.min(Math.max(0, internalIndex), galleryLen - 1) : 0;
  const url = gallery && galleryLen > 0 ? gallery.urls[safeIndex] : null;

  const { previewUrl, loading: heicLoading, error: heicError } = useHeicPreviewUrl(url);

  const canGoPrev = galleryLen > 1 && safeIndex > 0;
  const canGoNext = galleryLen > 1 && safeIndex < galleryLen - 1;

  useEffect(() => {
    if (url) {
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
    }
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (!gallery || gallery.urls.length <= 1) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setInternalIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setInternalIndex((i) => Math.min(gallery.urls.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, gallery]);

  const nudgeZoom = useCallback((delta: number) => {
    setZoom((z) => clampZoom(z + delta));
  }, []);

  const rotate90 = useCallback((dir: 1 | -1) => {
    setRotation((r) => (r + dir * 90 + 360) % 360);
  }, []);

  const viewportRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const touchPanRef = useRef<{ x: number; y: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  const applyWheelZoom = useCallback((e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dx = mx - cx;
    const dy = my - cy;

    let delta: number;
    if (e.ctrlKey) {
      // Тачпад (pinch / плавный зум): deltaY может быть дробным
      delta = -e.deltaY * 0.012;
    } else {
      delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    }

    setZoom((oldZ) => {
      const newZ = clampZoom(oldZ + delta);
      if (newZ === oldZ) return oldZ;
      const k = newZ / oldZ;
      setPan((p) => ({
        x: p.x + dx * (1 - k),
        y: p.y + dy * (1 - k),
      }));
      return newZ;
    });
  }, []);

  const zoomToViewportPoint = useCallback((clientX: number, clientY: number, delta: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const dx = mx - cx;
    const dy = my - cy;
    setZoom((oldZ) => {
      const newZ = clampZoom(oldZ + delta);
      if (newZ === oldZ) return oldZ;
      const k = newZ / oldZ;
      setPan((p) => ({
        x: p.x + dx * (1 - k),
        y: p.y + dy * (1 - k),
      }));
      return newZ;
    });
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !url) return;
    const fn = (e: WheelEvent) => applyWheelZoom(e);
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [url, applyWheelZoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-lightbox-controls='true']")) return;
    if (e.pointerType === "touch") return;
    if (e.button !== 0) return;
    draggingRef.current = true;
    dragMovedRef.current = false;
    setGrabbing(true);
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-lightbox-controls='true']")) return;
    if (e.pointerType === "touch") return;
    if (!draggingRef.current) return;
    const dx = e.clientX - lastPointerRef.current.x;
    const dy = e.clientY - lastPointerRef.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragMovedRef.current = true;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-lightbox-controls='true']")) return;
    if (e.pointerType === "touch") return;
    draggingRef.current = false;
    setGrabbing(false);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      touchPanRef.current = null;
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      if (dist > 0) pinchRef.current = { startDist: dist, startZoom: zoom };
    } else if (e.touches.length === 1) {
      pinchRef.current = null;
      const t = e.touches[0];
      touchPanRef.current = { x: t.clientX, y: t.clientY };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const { startDist, startZoom } = pinchRef.current;
      if (startDist <= 0) return;
      const newZ = clampZoom(startZoom * (dist / startDist));
      const el = viewportRef.current;
      if (!el) {
        setZoom(newZ);
        return;
      }
      const rect = el.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const mx = (a.clientX + b.clientX) / 2 - rect.left;
      const my = (a.clientY + b.clientY) / 2 - rect.top;
      const dx = mx - cx;
      const dy = my - cy;
      setZoom((prevZ) => {
        if (newZ === prevZ) return prevZ;
        const k = newZ / prevZ;
        setPan((p) => ({
          x: p.x + dx * (1 - k),
          y: p.y + dy * (1 - k),
        }));
        return newZ;
      });
      return;
    }
    if (e.touches.length === 1 && touchPanRef.current && !pinchRef.current) {
      e.preventDefault();
      const t = e.touches[0];
      const last = touchPanRef.current;
      const dx = t.clientX - last.x;
      const dy = t.clientY - last.y;
      touchPanRef.current = { x: t.clientX, y: t.clientY };
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) touchPanRef.current = null;
    else if (e.touches.length === 1) {
      const t = e.touches[0];
      touchPanRef.current = { x: t.clientX, y: t.clientY };
    }
  };

  if (!gallery || gallery.urls.length === 0 || !url) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: "rgba(0,0,0,0.82)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр изображения"
      onClick={onClose}
    >
      <div
        className="flex-shrink-0 flex flex-wrap items-center justify-center gap-2 px-3 py-3 border-b"
        style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.4)" }}
        data-lightbox-controls="true"
        onClick={(e) => e.stopPropagation()}
      >
        {galleryLen > 1 && (
          <>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white border transition-opacity hover:opacity-95 disabled:opacity-35"
              style={{ borderColor: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.08)" }}
              disabled={!canGoPrev}
              onClick={() => setInternalIndex((i) => Math.max(0, i - 1))}
              title="Предыдущее фото (←)"
              aria-label="Предыдущее фото"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Пред.
            </button>
            <span className="text-sm tabular-nums px-1 min-w-[4rem] text-center" style={{ color: "rgba(255,255,255,0.9)" }}>
              {safeIndex + 1} / {galleryLen}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white border transition-opacity hover:opacity-95 disabled:opacity-35"
              style={{ borderColor: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.08)" }}
              disabled={!canGoNext}
              onClick={() => setInternalIndex((i) => Math.min(galleryLen - 1, i + 1))}
              title="Следующее фото (→)"
              aria-label="Следующее фото"
            >
              След.
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <span className="hidden sm:inline w-px h-6 self-center" style={{ background: "rgba(255,255,255,0.2)" }} aria-hidden />
          </>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white border transition-opacity hover:opacity-95"
          style={{ borderColor: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.08)" }}
          onClick={() => nudgeZoom(-ZOOM_STEP)}
          title="Уменьшить (колёсико/двойной клик в нужной точке, перетаскивание — сдвиг)"
          aria-label="Уменьшить масштаб"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          Уменьшить
        </button>
        <span className="text-sm tabular-nums px-1 min-w-[4.5rem] text-center" style={{ color: "rgba(255,255,255,0.9)" }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white border transition-opacity hover:opacity-95"
          style={{ borderColor: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.08)" }}
          onClick={() => nudgeZoom(ZOOM_STEP)}
          title="Увеличить (колёсико/двойной клик — к точке курсора; на тачскрине — два пальца)"
          aria-label="Увеличить масштаб"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          Увеличить
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white border transition-opacity hover:opacity-95"
          style={{ borderColor: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.08)" }}
          onClick={() => rotate90(-1)}
          title="Повернуть против часовой стрелки"
          aria-label="Повернуть против часовой стрелки"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Влево
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white border transition-opacity hover:opacity-95"
          style={{ borderColor: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.08)" }}
          onClick={() => rotate90(1)}
          title="Повернуть по часовой стрелке"
          aria-label="Повернуть по часовой стрелке"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          Вправо
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white border transition-opacity hover:opacity-95"
          style={{ borderColor: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.08)" }}
          onClick={() => {
            setZoom(1);
            setRotation(0);
            setPan({ x: 0, y: 0 });
          }}
          aria-label="Сбросить масштаб и поворот"
        >
          Сброс
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-opacity hover:opacity-95"
          style={{ borderColor: "rgba(255,255,255,0.28)", background: "rgba(220,38,38,0.85)", color: "#fff" }}
          onClick={onClose}
          aria-label="Закрыть"
        >
          Закрыть
        </button>
      </div>
      <div
        ref={viewportRef}
        className="relative flex-1 min-h-0 overflow-hidden flex items-center justify-center"
        style={{
          touchAction: "none",
          cursor: grabbing ? "grabbing" : "grab",
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          zoomToViewportPoint(e.clientX, e.clientY, ZOOM_STEP * 2);
        }}
      >
        {galleryLen > 1 && (
          <>
            <button
              type="button"
              data-lightbox-controls="true"
              className="absolute left-2 sm:left-4 top-1/2 z-10 -translate-y-1/2 inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full text-white border transition-opacity disabled:opacity-25"
              style={{ borderColor: "rgba(255,255,255,0.35)", background: "rgba(0,0,0,0.45)" }}
              disabled={!canGoPrev}
              onClick={(e) => {
                e.stopPropagation();
                setInternalIndex((i) => Math.max(0, i - 1));
              }}
              title="Предыдущее фото (←)"
              aria-label="Предыдущее фото"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              data-lightbox-controls="true"
              className="absolute right-2 sm:right-4 top-1/2 z-10 -translate-y-1/2 inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full text-white border transition-opacity disabled:opacity-25"
              style={{ borderColor: "rgba(255,255,255,0.35)", background: "rgba(0,0,0,0.45)" }}
              disabled={!canGoNext}
              onClick={(e) => {
                e.stopPropagation();
                setInternalIndex((i) => Math.min(galleryLen - 1, i + 1));
              }}
              title="Следующее фото (→)"
              aria-label="Следующее фото"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </>
        )}
        <div
          className="absolute right-3 top-3 z-10 flex items-center gap-2"
          data-lightbox-controls="true"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-white border"
            style={{ borderColor: "rgba(255,255,255,0.3)", background: "rgba(0,0,0,0.45)" }}
            onClick={() => nudgeZoom(-ZOOM_STEP)}
            title="Уменьшить"
            aria-label="Уменьшить"
          >
            −
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-white border"
            style={{ borderColor: "rgba(255,255,255,0.3)", background: "rgba(0,0,0,0.45)" }}
            onClick={() => nudgeZoom(ZOOM_STEP)}
            title="Увеличить"
            aria-label="Увеличить"
          >
            +
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-white border"
            style={{ borderColor: "rgba(255,255,255,0.3)", background: "rgba(0,0,0,0.45)" }}
            onClick={() => rotate90(1)}
            title="Повернуть"
            aria-label="Повернуть"
          >
            ↻
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-white border"
            style={{ borderColor: "rgba(255,255,255,0.3)", background: "rgba(220,38,38,0.75)" }}
            onClick={onClose}
            title="Закрыть"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Предпросмотр"
            className="select-none max-w-[min(92vw,1600px)] max-h-[78vh] w-auto h-auto object-contain pointer-events-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
              transformOrigin: "center center",
              transition: grabbing ? "none" : "transform 0.12s ease-out",
            }}
            draggable={false}
          />
        ) : (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{ color: "rgba(255,255,255,0.9)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)" }}
          >
            {heicLoading ? "Подготавливаем превью HEIC..." : heicError ? "Не удалось показать превью HEIC в браузере." : "Нет данных для предпросмотра."}
          </div>
        )}
      </div>
    </div>
  );
}

export function FileThumbnail({ url, onRemove }: { url: string; onRemove: () => void }) {
  const [imgError, setImgError] = useState(false);
  const isPdf = isPdfUrl(url);
  const { previewUrl, loading: heicLoading, error: heicError } = useHeicPreviewUrl(url);
  const showImage = !isPdf && !!previewUrl && !imgError;
  return (
    <div
      className="relative flex flex-col rounded-xl overflow-hidden border flex-shrink-0"
      style={{ width: 100, borderColor: "var(--border)", background: "var(--bg-secondary)" }}
    >
      <div className="aspect-square w-full flex items-center justify-center overflow-hidden" style={{ minHeight: 80 }}>
        {showImage ? (
          <img src={previewUrl!} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 p-2" style={{ color: "var(--text-tertiary)" }}>
            {isPdf ? (
              <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2 5 5h-5V4zm-2 9v5H9v-5H7v-2h4v-2h2v4h-2zm4 2v2h-1v-2h1zm0-3v2h-1v-2h1zm-2-2v2h-1v-2h1z" />
              </svg>
            ) : (
              <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 9h6M9 13h6M9 17h4" />
              </svg>
            )}
            <span className="text-[10px] font-medium uppercase">
              {isPdf ? "PDF" : isHeicUrl(url) ? (heicLoading ? "HEIC..." : heicError ? "HEIC" : "HEIC") : "файл"}
            </span>
          </div>
        )}
      </div>
      <p className="truncate text-xs px-2 py-1.5" style={{ color: "var(--text-secondary)" }} title={fileFileName(url)}>
        {fileFileName(url)}
      </p>
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold opacity-90 hover:opacity-100"
        style={{ background: "var(--error)" }}
        title="Удалить"
      >
        ×
      </button>
    </div>
  );
}
