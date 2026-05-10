import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type DriveItem } from "../api";

function absoluteUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${window.location.origin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function officeViewerUrl(fileUrl: string): string {
  const src = encodeURIComponent(absoluteUrl(fileUrl));
  return `https://view.officeapps.live.com/op/embed.aspx?src=${src}`;
}

export default function DriveFileView() {
  const { id } = useParams<{ id: string }>();
  const itemId = Number(id);
  const [item, setItem] = useState<DriveItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!Number.isFinite(itemId)) {
      setErr("Некорректный id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr("");
    api.drive
      .get(itemId)
      .then(setItem)
      .catch((e) => setErr(e instanceof Error ? e.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [itemId]);

  const kind = useMemo(() => {
    const url = item?.file_url || "";
    const mime = item?.mime_type || "";
    const ext = url.split("?")[0]!.split("#")[0]!.split(".").pop()?.toLowerCase() || "";
    if (mime === "application/pdf" || ext === "pdf") return "pdf";
    if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return "office";
    return "other";
  }, [item]);

  if (loading) {
    return <div className="max-w-6xl mx-auto py-12 text-sm" style={{ color: "var(--text-secondary)" }}>Загрузка…</div>;
  }
  if (err) {
    return <div className="max-w-6xl mx-auto py-12 text-sm" style={{ color: "var(--error)" }}>{err}</div>;
  }
  if (!item || item.is_folder) {
    return <div className="max-w-6xl mx-auto py-12 text-sm" style={{ color: "var(--text-secondary)" }}>Файл не найден.</div>;
  }

  const fileUrl = item.file_url || "";

  return (
    <div className="max-w-6xl mx-auto animate-slide-in space-y-4 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/drive" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            ← К диску
          </Link>
          <div className="text-xl font-bold mt-2 truncate" style={{ color: "var(--text-primary)" }}>
            {item.name}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={fileUrl}
            download
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            Скачать
          </a>
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}
          >
            Открыть в новой вкладке
          </a>
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
        {kind === "pdf" ? (
          <iframe title="PDF" src={fileUrl} className="w-full" style={{ height: "75vh", border: "none" }} />
        ) : kind === "office" ? (
          <iframe title="Office" src={officeViewerUrl(fileUrl)} className="w-full" style={{ height: "75vh", border: "none" }} />
        ) : (
          <div className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>
            Для этого типа файла предпросмотр пока недоступен. Используйте «Скачать» или «Открыть в новой вкладке».
          </div>
        )}
      </div>
    </div>
  );
}

