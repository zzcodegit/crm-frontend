import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PdfViewer from "../components/PdfViewer";
import { api } from "../api";

export default function LensCatalogPdfPage() {
  const [sp] = useSearchParams();
  const name = (sp.get("name") || "PDF каталог").trim();
  const pdf = (sp.get("pdf") || "").trim();
  const [resolvedPdf, setResolvedPdf] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!pdf) {
      setResolvedPdf("");
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const resolved = await api.pricelistOffline.resolveAssetUrl(pdf);
        if (!cancelled) setResolvedPdf(resolved || pdf);
      } catch {
        if (!cancelled) setResolvedPdf(pdf);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  if (!pdf) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>PDF не найден</h1>
        <p style={{ color: "var(--text-secondary)" }}>Ссылка на PDF-каталог отсутствует.</p>
        <Link to="/lens-catalog" className="inline-flex px-4 py-2 rounded-lg" style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)" }}>
          Назад к поставщикам
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{name}</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Отдельная страница просмотра PDF (в APK работает офлайн при загруженном кэше)
          </p>
        </div>
        <Link
          to="/lens-catalog"
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)" }}
        >
          Назад
        </Link>
      </div>
      <div
        className="rounded-2xl p-2 sm:p-4"
        style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}
      >
        {loading ? (
          <div className="py-10 text-center" style={{ color: "var(--text-secondary)" }}>Загружаем PDF...</div>
        ) : (
          <PdfViewer file={resolvedPdf || pdf} />
        )}
      </div>
    </div>
  );
}

