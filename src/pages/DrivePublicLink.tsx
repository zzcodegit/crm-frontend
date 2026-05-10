import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type DrivePublicItemResponse } from "../api";
import { useAuth } from "../contexts/AuthContext";

function absoluteUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${window.location.origin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function officeViewerUrl(fileUrl: string): string {
  const src = encodeURIComponent(absoluteUrl(fileUrl));
  return `https://view.officeapps.live.com/op/embed.aspx?src=${src}`;
}

export default function DrivePublicLink() {
  const { token } = useParams<{ token: string }>();
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<DrivePublicItemResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) {
      setErr("Некорректная ссылка");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr("");
    api.drive
      .publicGet(token)
      .then((d) => {
        setData(d);
        if (user) {
          nav(`/drive/view/${d.item_id}`, { replace: true });
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Ссылка не найдена"))
      .finally(() => setLoading(false));
  }, [token, user, nav]);

  const kind = useMemo(() => {
    const url = data?.file_url || "";
    const mime = data?.mime_type || "";
    const ext = url.split("?")[0]!.split("#")[0]!.split(".").pop()?.toLowerCase() || "";
    if (mime === "application/pdf" || ext === "pdf") return "pdf";
    if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return "office";
    if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image";
    return "other";
  }, [data]);

  if (authLoading || loading) {
    return <div className="max-w-3xl mx-auto py-12 text-sm" style={{ color: "var(--text-secondary)" }}>Загрузка…</div>;
  }
  if (err) {
    return <div className="max-w-3xl mx-auto py-12 text-sm" style={{ color: "var(--error)" }}>{err}</div>;
  }
  if (!data) {
    return <div className="max-w-3xl mx-auto py-12 text-sm" style={{ color: "var(--text-secondary)" }}>Ссылка не найдена.</div>;
  }
  if (user) {
    return <div className="max-w-3xl mx-auto py-12 text-sm" style={{ color: "var(--text-secondary)" }}>Перенаправляю в диск…</div>;
  }

  const fileUrl = data.file_url || "";

  return (
    <div className="max-w-4xl mx-auto animate-slide-in space-y-4 pb-12 px-3 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
            Общий доступ по ссылке
          </div>
          <div className="text-xl font-bold mt-1 truncate" style={{ color: "var(--text-primary)" }}>
            {data.name}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            Если у вас есть аккаунт — войдите, и файл откроется в диске.
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
            Открыть
          </a>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}
          >
            Войти
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
        {kind === "pdf" ? (
          <iframe title="PDF" src={fileUrl} className="w-full" style={{ height: "75vh", border: "none" }} />
        ) : kind === "office" ? (
          <iframe title="Office" src={officeViewerUrl(fileUrl)} className="w-full" style={{ height: "75vh", border: "none" }} />
        ) : kind === "image" ? (
          <div className="p-3">
            <img src={fileUrl} alt="" className="w-full h-auto rounded-xl" />
          </div>
        ) : (
          <div className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>
            Предпросмотр недоступен. Используйте «Скачать» или «Открыть».
          </div>
        )}
      </div>
    </div>
  );
}

