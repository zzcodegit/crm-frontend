import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link, useParams, useLocation } from "react-router-dom";
import { pricelistBasePathFromPathname } from "../utils/pricelistRoutes";
import { formatPricelistPriceRub } from "../utils/pricelistPrice";
import LensTranspositionDrawer from "../components/LensTranspositionDrawer";
import PricelistMarkdownView from "../components/PricelistMarkdownView";

type PricelistDetailLocationState = {
  fromPricelist?: { pathname: string; search: string; hash?: string };
};
import Barcode from "react-barcode";
import { api } from "../api";
import { useAuth } from "../contexts/AuthContext";
import type { PricelistItemResponse, FeatureItem, CustomFieldItem } from "../api";
import { isNativeAppShell } from "../utils/nativeApp";

/** Цвета для особенностей (фотохром и др.) — справочник из settings/references/features */
const COLOR_NAME_TO_HEX: Record<string, string> = {
  Голубой: "#0ea5e9",
  Зелёный: "#22c55e",
  Зеленый: "#22c55e",
  Синий: "#2563eb",
  "Сине-фиолетовый": "#6366f1",
  Золотистый: "#eab308",
  "Пурпурный / Сиреневый": "#a855f7",
  Пурпурный: "#a855f7",
  Сиреневый: "#c084fc",
  Фиолетовый: "#7c3aed",
  "Зеленовато-желтый": "#84cc16",
  Желтоватый: "#facc15",
  Янтарный: "#f59e0b",
  Бирюзовый: "#14b8a6",
  Розовый: "#ec4899",
  Красный: "#dc2626",
  Оранжевый: "#ea580c",
  Коричневый: "#92400e",
  "Темно-серый (ахроматический, почти прозрачный)": "#4b5563",
  "Темно-серый": "#4b5563",
  Рубиновый: "#be123c",
  Сапфировый: "#1e40af",
  Изумрудный: "#047857",
  Серый: "#6b7280",
  Жёлтый: "#eab308",
  Чёрный: "#1f2937",
  Другой: "#6b7280",
};

function getLuminance(hex: string): number {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return 0;
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function FieldRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-sm font-medium shrink-0 w-40" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className={`text-sm flex-1 min-w-0 whitespace-pre-wrap break-words ${mono ? "font-mono" : ""}`} style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

/** Как в форме редактирования: значения через запятую выравниваются по строкам таблицы. */
function strToRows(s: string | null | undefined): string[] {
  if (!s || !s.trim()) return [""];
  const parts = s.split(/,\s*/).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : [""];
}

function zipLensParamRows(
  sph?: string | null,
  cyl?: string | null,
  step?: string | null,
  diameters?: string | null,
  replacementMode?: string | null,
  baseCurve?: string | null
): { sph: string; cyl: string; step: string; diameters: string; replacementMode: string; baseCurve: string }[] {
  const A = strToRows(sph ?? "");
  const B = strToRows(cyl ?? "");
  const C = strToRows(step ?? "");
  const D = strToRows(diameters ?? "");
  const E = strToRows(replacementMode ?? "");
  const F = strToRows(baseCurve ?? "");
  const n = Math.max(A.length, B.length, C.length, D.length, E.length, F.length, 1);
  return Array.from({ length: n }, (_, i) => ({
    sph: A[i] ?? "",
    cyl: B[i] ?? "",
    step: C[i] ?? "",
    diameters: D[i] ?? "",
    replacementMode: E[i] ?? "",
    baseCurve: F[i] ?? "",
  }));
}

export default function PricelistDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const basePath = pricelistBasePathFromPathname(location.pathname);
  const catalog = basePath === "/pricelist-rx" ? "rx" : basePath === "/pricelist-mkl" ? "mkl" : "warehouse";
  const plApi = catalog === "rx" ? api.pricelistRx : catalog === "mkl" ? api.pricelistMkl : api.pricelist;
  const state = location.state as PricelistDetailLocationState | null;
  const backToPricelistHref =
    state?.fromPricelist != null
      ? `${state.fromPricelist.pathname}${state.fromPricelist.search}${state.fromPricelist.hash ?? ""}`
      : basePath;
  const { user } = useAuth();
  const isAdmin = user?.is_admin === true;
  const [item, setItem] = useState<PricelistItemResponse | null>(null);
  const [features, setFeatures] = useState<FeatureItem[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldItem[]>([]);
  const customFieldsSorted = useMemo(
    () => [...customFields].sort((a, b) => a.sort_index - b.sort_index || a.id - b.id),
    [customFields]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [transposeOpen, setTransposeOpen] = useState(false);
  const [resolvedPhotos, setResolvedPhotos] = useState<string[]>([]);

  const photosAll = useMemo(() => {
    if (!item) return [];
    return item.photo_urls && item.photo_urls.length ? item.photo_urls : item.photo_url ? [item.photo_url] : [];
  }, [item]);

  const photosForCard = useMemo(() => (item?.hide_photo ? [] : photosAll), [item, photosAll]);
  useEffect(() => {
    let cancelled = false;
    let objectUrls: string[] = [];
    (async () => {
      if (!photosForCard.length) {
        setResolvedPhotos([]);
        return;
      }
      // Показываем мгновенно исходные URL, потом по мере готовности заменяем на офлайн blob URL.
      if (!cancelled) setResolvedPhotos(photosForCard);
      photosForCard.forEach((u, idx) => {
        void (async () => {
          try {
            const v = await api.pricelistOffline.resolveAssetUrl(u);
            if (cancelled) return;
            if (v.startsWith("blob:")) objectUrls.push(v);
            setResolvedPhotos((prev) => {
              const base = prev.length === photosForCard.length ? [...prev] : [...photosForCard];
              base[idx] = v;
              return base;
            });
          } catch {
            // keep original URL
          }
        })();
      });
    })();
    return () => {
      cancelled = true;
      objectUrls.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {
          // ignore
        }
      });
    };
  }, [photosForCard]);


  const showPhotoGalleryColumn = useMemo(() => {
    if (!item) return false;
    return item.hide_photo !== true;
  }, [item]);

  const photosLength = photosForCard.length;
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i <= 0 ? Math.max(0, photosLength - 1) : i - 1));
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i >= photosLength - 1 ? 0 : i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, photosLength]);

  useEffect(() => {
    if (!id) return;
    const numId = parseInt(id, 10);
    if (Number.isNaN(numId)) {
      setError("Неверный идентификатор");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    (async () => {
      try {
        const data = await plApi.get(numId);
        if (isNativeAppShell() && data.admin_only) {
          setItem(null);
          setError("Позиция недоступна в приложении");
          return;
        }
        setItem(data);
        const [feats, cFields] = await Promise.all([
          api.ref.features.list().catch(() => []),
          api.ref.customFields.list().catch(() => []),
        ]);
        setFeatures(Array.isArray(feats) ? feats : []);
        const filteredFields = (Array.isArray(cFields) ? cFields : []).filter((x) => {
          if (catalog === "rx") return x.show_in_rx !== false;
          if (catalog === "mkl") return x.show_in_mkl !== false;
          return x.show_in_warehouse !== false;
        });
        setCustomFields(filteredFields);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, catalog]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3" style={{ color: "var(--text-secondary)" }}>
          <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--accent)" }}>
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
          Загрузка…
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <div className="p-6 rounded-2xl text-center" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
          <p className="text-lg font-medium mb-4" style={{ color: "var(--error)" }}>{error || "Позиция не найдена"}</p>
          <Link to={backToPricelistHref} className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: "var(--accent)" }}>
            ← {basePath === "/pricelist-rx" ? "Вернуться к RX" : basePath === "/pricelist-mkl" ? "Вернуться к Прайс МКЛ" : "Вернуться к Прайс склад"}
          </Link>
        </div>
      </div>
    );
  }

  const FEATURES_WITH_COLORS = ["Фотохромные линзы (хамелеоны)", "Цвет остаточного рефлекса линзы"];
  const featureHasColors = (name: string) => FEATURES_WITH_COLORS.some((n) => name.includes(n) || n.includes(name));

  const featureDisplay = (item.feature_ids || []).map((fid) => {
    const feat = features.find((f) => f.id === fid);
    const name = feat?.name;
    const colors = item.feature_colors?.[String(fid)];
    return { name, colors: Array.isArray(colors) ? colors.filter(Boolean) : [] };
  }).filter((x) => x.name);

  const colorFeaturesAbovePrice = featureDisplay.filter((f) => f.name && featureHasColors(f.name) && f.colors.length > 0);

  const hasUvProtection = !!item.uv_protection;
  const materialValue = item.material?.trim() || "";

  const photos = resolvedPhotos.length > 0 ? resolvedPhotos : photosForCard;
  const customValueHasContent = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === "boolean") return true;
    if (Array.isArray(value)) return value.some((v) => String(v).trim() !== "");
    return String(value).trim() !== "";
  };

  const customDisplay = customFieldsSorted
    .map((f) => ({ field: f, value: item.custom_values?.[f.code] }))
    .filter((x) => customValueHasContent(x.value));

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };
  const closeLightbox = () => setLightboxOpen(false);
  const goPrev = () => setLightboxIndex((i) => (i <= 0 ? photosForCard.length - 1 : i - 1));
  const goNext = () => setLightboxIndex((i) => (i >= photosForCard.length - 1 ? 0 : i + 1));

  return (
    <div className="w-full max-w-none animate-slide-in pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <Link
          to={backToPricelistHref}
          className="inline-flex items-center gap-2 text-sm font-medium"
          style={{ color: "var(--accent)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {basePath === "/pricelist-rx" ? "К RX" : basePath === "/pricelist-mkl" ? "К прайсу МКЛ" : "К Прайс склад"}
        </Link>
        {isAdmin && id && (
          <Link
            to={`${basePath}/${id}/edit`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Редактировать
          </Link>
        )}
      </div>

      {/* Попап галереи — рендер в body, чтобы перекрывать хедер и сайдбар */}
      {lightboxOpen && photosForCard.length > 0 && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.9)", zIndex: 9999 }}
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Галерея фото"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            aria-label="Закрыть"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          {photosForCard.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                aria-label="Предыдущее"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                aria-label="Следующее"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </>
          )}
          <img
            src={photosForCard[lightboxIndex]}
            alt={`${item.lens_name} — фото ${lightboxIndex + 1}`}
            className="max-w-[90vw] max-h-[85vh] w-auto h-auto object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {photosForCard.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 text-white text-sm">
              {lightboxIndex + 1} / {photosForCard.length}
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Основная карточка: слева фото на весь блок, справа данные */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border)",
          boxShadow: "0 4px 24px var(--shadow)",
        }}
      >
        <div className="flex flex-col md:flex-row">
          {showPhotoGalleryColumn && (
            <div
              className="md:min-w-[320px] md:w-[380px] shrink-0 flex flex-col items-center justify-start p-4 md:p-6"
              style={{
                background: "var(--bg-secondary)",
                borderRight: "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {photos.length > 0 ? (
                <>
                  <div
                    className="relative w-full flex items-center justify-center rounded-xl overflow-hidden cursor-pointer max-h-[260px] md:max-h-[300px]"
                    style={{ border: "1px solid var(--border)", boxShadow: "0 2px 12px var(--shadow)" }}
                    onClick={() => openLightbox(0)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openLightbox(0))}
                  >
                    <img src={photos[0]} alt={item.lens_name} className="max-w-full max-h-[260px] md:max-h-[300px] w-auto h-auto object-contain bg-white" />
                    {photos.length > 1 && (
                      <span className="absolute bottom-2 right-2 px-2 py-1 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                        {photos.length} фото · нажмите
                      </span>
                    )}
                  </div>
                  {photos.length > 1 && (
                    <div className="flex gap-2 mt-3 flex-wrap justify-center">
                      {photos.map((url, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => openLightbox(i)}
                          className="w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-2"
                          style={{ borderColor: i === 0 ? "var(--accent)" : "var(--border)" }}
                        >
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div
                  className="w-full h-full min-h-[240px] rounded-2xl flex flex-col items-center justify-center gap-2 px-4 text-center"
                  style={{ border: "2px dashed var(--border)", color: "var(--text-tertiary)" }}
                >
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
              )}
            </div>
          )}

          {/* Блок справа — все заполненные значения */}
          <div className={`flex-1 min-w-0 p-6 md:p-8 ${!showPhotoGalleryColumn ? "w-full" : ""}`}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>Производитель</div>
            <div className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{item.manufacturer_name || "—"}</div>
            <h1 className="text-2xl md:text-3xl font-bold leading-tight mb-3" style={{ color: "var(--text-primary)" }}>{item.lens_name}</h1>
            {(item.full_description?.trim() || item.description) && (
              <div className="mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-tertiary)" }}>Детальное описание</span>
                {item.full_description?.trim() ? (
                  catalog === "rx" || catalog === "mkl" ? (
                    <PricelistMarkdownView source={item.full_description.trim()} />
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{item.full_description.trim()}</p>
                  )
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{item.description}</p>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2 mb-4">
              {item.group && (
                <span className="px-3 py-1.5 rounded-xl text-sm font-medium" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>{item.group}</span>
              )}
              {item.coefficient && catalog !== "mkl" && (
                <span className="px-3 py-1.5 rounded-xl text-sm" style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                  Коэф. {item.coefficient}
                </span>
              )}
            </div>
            {colorFeaturesAbovePrice.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {colorFeaturesAbovePrice.map(({ name, colors }, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{name}:</span>
                    {colors.map((c) => {
                      const hex = COLOR_NAME_TO_HEX[c] ?? "#6b7280";
                      const useDarkText = getLuminance(hex) > 180;
                      return (
                        <span
                          key={c}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold border-2"
                          style={{
                            backgroundColor: hex,
                            color: useDarkText ? "#1f2937" : "#fff",
                            borderColor: "rgba(0,0,0,0.15)",
                            textShadow: useDarkText ? "none" : "0 1px 2px rgba(0,0,0,0.2)",
                          }}
                        >
                          <span className="w-3 h-3 rounded-full shrink-0 border border-white/50" style={{ backgroundColor: hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1)" }} aria-hidden />
                          {c}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            {(item.sph?.trim() ||
              item.cyl?.trim() ||
              item.step?.trim() ||
              item.diameters?.trim() ||
              (catalog === "mkl" && (item.material?.trim() || item.coefficient?.trim()))) && (
              <div className="mt-5 pt-5" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
                  Параметры линзы
                </div>
                <div className="overflow-x-auto -mx-1 px-1">
                  <table
                    className="w-full min-w-[min(100%,36rem)] text-sm border-collapse rounded-xl overflow-hidden"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    <thead>
                      <tr style={{ background: "var(--bg-secondary)" }}>
                        <th className="text-left px-3 py-2 font-semibold border-b" style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
                        >
                          SPH
                        </th>
                        <th className="text-left px-3 py-2 font-semibold border-b" style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
                        >
                          CYL
                        </th>
                        <th className="text-left px-3 py-2 font-semibold border-b" style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
                        >
                          Шаг
                        </th>
                        <th className="text-left px-3 py-2 font-semibold border-b" style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
                        >
                          {catalog === "mkl" ? "Матриал/Влаг" : "Ø"}
                        </th>
                        {catalog === "mkl" ? (
                          <>
                            <th className="text-left px-3 py-2 font-semibold border-b" style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}>
                              Режим замены
                            </th>
                            <th className="text-left px-3 py-2 font-semibold border-b" style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}>
                              ВС
                            </th>
                          </>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {zipLensParamRows(
                        item.sph,
                        item.cyl,
                        item.step,
                        item.diameters,
                        catalog === "mkl" ? item.material : undefined,
                        catalog === "mkl" ? item.coefficient : undefined
                      ).map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td className="px-3 py-2 align-top font-mono text-xs sm:text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>
                            {row.sph.trim() || "—"}
                          </td>
                          <td className="px-3 py-2 align-top font-mono text-xs sm:text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>
                            {row.cyl.trim() || "—"}
                          </td>
                          <td className="px-3 py-2 align-top font-mono text-xs sm:text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>
                            {row.step.trim() || "—"}
                          </td>
                          <td className="px-3 py-2 align-top font-mono text-xs sm:text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>
                            {row.diameters.trim() || "—"}
                          </td>
                          {catalog === "mkl" ? (
                            <>
                              <td className="px-3 py-2 align-top font-mono text-xs sm:text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>
                                {row.replacementMode.trim() || "—"}
                              </td>
                              <td className="px-3 py-2 align-top font-mono text-xs sm:text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>
                                {row.baseCurve.trim() || "—"}
                              </td>
                            </>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="text-2xl font-bold tabular-nums pt-2" style={{ color: item.is_promo ? "var(--error)" : "var(--accent)" }}>{formatPricelistPriceRub(Number(item.price), item.price_from)}</div>
            {item.enable_transposition_calc ? (
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => setTransposeOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <span aria-hidden>⇄</span>
                  <span>Калькулятор транспозиции</span>
                </button>
              </div>
            ) : null}

            {customDisplay.length > 0 && (
              <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--border)" }}>
                {customDisplay.map(({ field, value }) => (
                  <FieldRow
                    key={field.id}
                    label={field.label}
                    value={
                      field.field_type === "checkbox"
                        ? (Boolean(value) ? "Да" : "Нет")
                        : field.field_type === "string_multi"
                          ? Array.isArray(value)
                            ? (
                                <ul className="list-disc pl-5 space-y-1">
                                  {value
                                    .map((v) => String(v).trim())
                                    .filter(Boolean)
                                    .map((v, idx) => (
                                      <li key={`${field.id}-${idx}`} className="whitespace-pre-wrap break-words">
                                        {v}
                                      </li>
                                    ))}
                                </ul>
                              )
                            : (
                                <span className="whitespace-pre-wrap break-words">{String(value ?? "")}</span>
                              )
                        : field.field_type === "multi_select"
                          ? Array.isArray(value)
                            ? (
                                <ul className="list-disc pl-5 space-y-3">
                                  {value
                                    .map((v) => String(v))
                                    .filter((v) => v.trim() !== "")
                                    .map((v, idx) => (
                                      <li key={`${field.id}-${idx}`} className="whitespace-pre-wrap break-words">
                                        {(() => {
                                          const s = v.trim();
                                          if (s.startsWith("{")) {
                                            try {
                                              const parsed = JSON.parse(s) as { id?: unknown; text?: unknown };
                                              const id = typeof parsed.id === "number" ? parsed.id : Number.NaN;
                                              const text = typeof parsed.text === "string" ? parsed.text : "";
                                              const label = Number.isFinite(id)
                                                ? (field.options || []).find((o) => o.id === id)?.value
                                                : undefined;
                                              if (label) {
                                                return (
                                                  <div>
                                                    <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                                                      {label}
                                                    </div>
                                                    {text.trim() !== "" && (
                                                      <div className="whitespace-pre-wrap break-words" style={{ color: "var(--text-secondary)" }}>
                                                        {text}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              }
                                            } catch {
                                              // ignore, fallback below
                                            }
                                          }
                                          return v;
                                        })()}
                                      </li>
                                    ))}
                                </ul>
                              )
                            : (
                                <span className="whitespace-pre-wrap break-words">{String(value ?? "")}</span>
                              )
                          : Array.isArray(value)
                            ? (
                                <ul className="list-disc pl-5 space-y-1">
                                  {value
                                    .map((v) => String(v).trim())
                                    .filter(Boolean)
                                    .map((v, idx) => (
                                      <li key={`${field.id}-${idx}`} className="whitespace-pre-wrap break-words">{v}</li>
                                    ))}
                                </ul>
                              )
                            : (
                                <span className="whitespace-pre-wrap break-words">{String(value)}</span>
                              )
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {((item.barcodes && item.barcodes.length) || item.barcode?.trim() || (item.lens_id != null && item.lens_id !== 0)) && (
          <div className="px-6 md:px-8 py-6" style={{ borderTop: "1px solid var(--border)" }}>
            {(() => {
              const normalizeEntry = (b: { code: string; price?: number | null; description?: string | null } | string) =>
                typeof b === "string"
                  ? { code: b, price: null as number | null, description: null as string | null }
                  : { code: b.code, price: b.price ?? null, description: b.description ?? null };
              const sections =
                item.barcode_sections && item.barcode_sections.length > 0
                  ? item.barcode_sections
                      .map((sec) => ({
                        name: sec.name?.trim() || null,
                        entries: (sec.items ?? []).map(normalizeEntry).filter((x) => x.code?.trim()),
                      }))
                      .filter((s) => s.entries.length > 0)
                  : [];
              const flatFromLegacy = (item.barcodes && item.barcodes.length
                ? item.barcodes
                : item.barcode
                  ? [item.barcode]
                  : []
              ).map((b) => normalizeEntry(b as { code: string; price?: number | null; description?: string | null })).filter((x) => x.code?.trim());
              const displaySections =
                sections.length > 0
                  ? sections
                  : flatFromLegacy.length > 0
                    ? [{ name: null as string | null, entries: flatFromLegacy }]
                    : [];
              const showBarcodesBlock = displaySections.some((s) => s.entries.length > 0);
              return showBarcodesBlock && (
                <div className="py-2 space-y-4">
                  {displaySections.map((sec, si) => (
                    <div
                      key={si}
                      className="space-y-3 p-4 rounded-xl"
                      style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)" }}
                    >
                      {sec.name ? (
                        <div
                          className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold"
                          style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent)" }}
                        >
                          {sec.name}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-3">
                        {sec.entries.map((b, i) => (
                          <div key={`${si}-${i}`} className="flex items-center gap-6 p-4 rounded-xl" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                            <div className="bg-white p-3 rounded-lg shrink-0">
                              <Barcode value={b.code} width={2} height={56} fontSize={12} background="#ffffff" lineColor="#000000" />
                            </div>
                            {(b.price != null || b.description) && (
                              <div className="flex flex-col gap-1 min-w-0">
                                {b.price != null && (
                                  <div className="text-xl font-bold tabular-nums" style={{ color: "var(--accent)" }}>
                                    {b.price.toLocaleString("ru-RU")} ₽
                                  </div>
                                )}
                                {b.description && (
                                  <div className="text-lg italic font-medium leading-snug whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>
                                    {b.description}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {item.lens_id != null && item.lens_id !== 0 && <FieldRow label="ID линзы (каталог)" value={String(item.lens_id)} mono />}
          </div>
        )}

        {/* Особенности — показываем и для новых параметров */}
        {(featureDisplay.length > 0 || hasUvProtection || !!materialValue) && (
          <div className="px-6 md:px-8 pb-6 md:pb-8" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2 pt-6" style={{ color: "var(--text-tertiary)" }}>Особенности</div>
            <div className="flex flex-wrap gap-2">
              {hasUvProtection && (
                <span className="px-3 py-1.5 rounded-xl text-sm" style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                  UV-защита
                </span>
              )}
              {!!materialValue && catalog !== "mkl" && (
                <span className="px-3 py-1.5 rounded-xl text-sm" style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                  Материал: {materialValue}
                </span>
              )}
              {featureDisplay.map(({ name, colors }, i) => (
                <span key={i} className="px-3 py-1.5 rounded-xl text-sm" style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                  {name}
                  {colors.length > 0 && (
                    <span className="ml-1.5 font-semibold">
                      ({colors.map((c, idx) => (
                        <span key={c}>
                          {idx > 0 && ", "}
                          <span style={{ color: COLOR_NAME_TO_HEX[c] ?? "var(--accent)" }}>{c}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <LensTranspositionDrawer open={transposeOpen} onClose={() => setTransposeOpen(false)} />
    </div>
  );
}
