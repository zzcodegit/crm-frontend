import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

// Worker для pdf.js (Vite): поднимаем через ?worker, чтобы избежать
// dynamic import ошибок .mjs на части прод-конфигов и WebView.
if (typeof window !== "undefined" && pdfjs?.GlobalWorkerOptions) {
  try {
    const worker = new PdfWorker();
    pdfjs.GlobalWorkerOptions.workerPort = worker;
  } catch {
    // fallback: пусть react-pdf покажет ошибку загрузки, если worker не поднялся
  }
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

export default function PdfViewer({ file, className = "" }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(getPageWidth);
  const scrollYRef = useRef(0);
  const fullUrl = file.startsWith("http") ? file : `${window.location.origin}${file}`;

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
