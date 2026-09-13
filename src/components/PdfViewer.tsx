import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

let pdfWorkerReady: Promise<void> | null = null;

/** Worker поднимаем только при открытии PDF — не блокируем старт CRM на iPhone/Safari. */
function ensurePdfWorker(): Promise<void> {
  if (!pdfWorkerReady) {
    pdfWorkerReady = (async () => {
      if (typeof window === "undefined" || !pdfjs?.GlobalWorkerOptions) return;
      if (pdfjs.GlobalWorkerOptions.workerPort) return;
      const { default: PdfWorker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?worker");
      const worker = new PdfWorker();
      pdfjs.GlobalWorkerOptions.workerPort = worker;
    })().catch(() => undefined);
  }
  return pdfWorkerReady;
}

interface PdfViewerProps {
  /** URL PDF (относительный, например /uploads/xxx.pdf, или полный) */
  file: string;
  className?: string;
}

function getPageWidth() {
  if (typeof window === "undefined") return 900;
  return Math.min(900, window.innerWidth - 48);
}

function toPdfDocumentSource(file: string): string {
  const f = (file || "").trim();
  if (!f) return "";
  // blob:/data: — уже абсолютные (офлайн-кэш IndexedDB → createObjectURL); не склеивать с origin.
  if (f.startsWith("blob:") || f.startsWith("data:")) return f;
  if (f.startsWith("http://") || f.startsWith("https://")) return f;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${f.startsWith("/") ? "" : "/"}${f}`;
}

export default function PdfViewer({ file, className = "" }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workerReady, setWorkerReady] = useState(false);
  const [pageWidth, setPageWidth] = useState(getPageWidth);
  const scrollYRef = useRef(0);
  const fullUrl = toPdfDocumentSource(file);

  useEffect(() => {
    let cancelled = false;
    void ensurePdfWorker().then(() => {
      if (!cancelled) setWorkerReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setError(null);
    setNumPages(null);
  }, [file]);

  // Стабильная ширина страниц, обновление при resize
  useEffect(() => {
    const onResize = () => setPageWidth(getPageWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Сохраняем скролл при появлении страниц и отключаем scroll anchoring
  const onLoadSuccess = (payload: { numPages: number }) => {
    scrollYRef.current = window.scrollY;
    setNumPages(payload.numPages);
  };

  useEffect(() => {
    if (numPages === null) return;
    const saved = scrollYRef.current;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo(0, saved);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [numPages]);

  if (!fullUrl) {
    return (
      <div className={`p-4 rounded-xl text-center ${className}`} style={{ color: "var(--text-secondary)" }}>
        Не указан адрес PDF
      </div>
    );
  }

  if (!workerReady) {
    return (
      <div className={`flex items-center justify-center py-16 ${className}`} style={{ color: "var(--text-secondary)" }}>
        Загрузка PDF…
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ overflowAnchor: "none" }}
    >
      {error && (
        <div className="p-4 rounded-xl text-center" style={{ background: "var(--error-light)", color: "var(--error)" }}>
          {error}
        </div>
      )}
      <Document
        file={fullUrl}
        onLoadSuccess={onLoadSuccess}
        onLoadError={(e) => setError(e?.message || "Не удалось загрузить PDF")}
        loading={
          <div className="flex items-center justify-center py-16" style={{ color: "var(--text-secondary)" }}>
            Загрузка PDF…
          </div>
        }
      >
        {numPages !== null &&
          Array.from({ length: numPages }, (_, i) => (
            <div key={i} className="mb-4 flex justify-center" style={{ background: "var(--bg-secondary)" }}>
              <Page
                pageNumber={i + 1}
                width={pageWidth}
                renderTextLayer
                renderAnnotationLayer
              />
            </div>
          ))}
      </Document>
    </div>
  );
}
