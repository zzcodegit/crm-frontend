import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type NormativeActItem, type NormativeActSignReportItem } from "../api";
import { useAuth } from "../contexts/AuthContext";

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function NormativeActView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_admin === true;
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<NormativeActItem | null>(null);
  const [signing, setSigning] = useState(false);
  const [report, setReport] = useState<NormativeActSignReportItem[]>([]);

  const load = async (actId: number) => {
    setLoading(true);
    try {
      setItem(await api.normativeActs.get(actId));
      if (isAdmin) {
        setReport(await api.normativeActs.report(actId));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const actId = Number(id);
    if (!Number.isFinite(actId)) {
      navigate("/normative-acts", { replace: true });
      return;
    }
    void load(actId);
  }, [id]);

  const onSign = async () => {
    if (!item) return;
    setSigning(true);
    try {
      await api.normativeActs.sign(item.id);
      await load(item.id);
    } finally {
      setSigning(false);
    }
  };

  if (loading) return <div className="max-w-5xl mx-auto text-sm" style={{ color: "var(--text-secondary)" }}>Загрузка…</div>;
  if (!item) return null;

  return (
    <div className="max-w-5xl mx-auto animate-slide-in">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link to="/normative-acts" className="text-sm hover:underline" style={{ color: "var(--accent)" }}>← Ко всем документам</Link>
        <div className="flex gap-2">
          {isAdmin && <button type="button" onClick={() => navigate(`/normative-acts/${item.id}/report`)} className="px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>Отчет по подписям</button>}
          {isAdmin && <button type="button" onClick={() => navigate(`/normative-acts/${item.id}/edit`)} className="px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>Изменить</button>}
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        {item.preview_image_url && <div className="mb-4 rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}><img src={item.preview_image_url} alt={item.title} className="w-full max-h-[320px] object-cover" /></div>}
        <div className="text-[11px] mb-1 font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>{(item.section || "Общее").trim() || "Общее"}</div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>{item.title}</h1>
        <div className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>{item.created_by_username ? `Автор: ${item.created_by_username}` : "Автор не указан"} · {fmtDate(item.updated_at)}</div>
        <div className="mb-4 text-sm font-medium" style={{ color: item.signed_by_me ? "var(--success,#0a9f4b)" : "var(--error)" }}>
          {item.signed_by_me ? `Вы подписали документ ${fmtDate(item.signed_at)}` : "Документ не подписан"}
        </div>
        {!item.signed_by_me && (
          <button type="button" disabled={signing} onClick={onSign} className="mb-5 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60" style={{ background: "var(--accent)", color: "#fff" }}>
            {signing ? "Подписываем..." : "Подписать"}
          </button>
        )}
        {item.attachment_url && (
          <div className="mb-5">
            <a
              href={item.attachment_url}
              download={item.attachment_filename ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--accent)" }}
            >
              {item.attachment_filename ? `Скачать файл: ${item.attachment_filename}` : "Скачать прикреплённый файл"}
            </a>
          </div>
        )}
        <div className="prose prose-sm max-w-none" style={{ color: "var(--text-primary)" }} dangerouslySetInnerHTML={{ __html: item.content_html || "<p>Без текста</p>" }} />

        {isAdmin && (
          <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              Подписи пользователей ({report.filter((x) => x.signed).length}/{report.length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                <div className="text-xs font-semibold mb-2" style={{ color: "var(--success,#0a9f4b)" }}>Подписали</div>
                <div className="space-y-2 max-h-56 overflow-auto">
                  {report.filter((x) => x.signed).length === 0 ? (
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Пока никто не подписал</div>
                  ) : (
                    report.filter((x) => x.signed).map((u) => (
                      <div key={u.user_id} className="text-xs" style={{ color: "var(--text-primary)" }}>
                        {u.display_name} <span style={{ color: "var(--text-tertiary)" }}>({u.username})</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                <div className="text-xs font-semibold mb-2" style={{ color: "var(--error)" }}>Не подписали</div>
                <div className="space-y-2 max-h-56 overflow-auto">
                  {report.filter((x) => !x.signed).length === 0 ? (
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Все пользователи подписали</div>
                  ) : (
                    report.filter((x) => !x.signed).map((u) => (
                      <div key={u.user_id} className="text-xs" style={{ color: "var(--text-primary)" }}>
                        {u.display_name} <span style={{ color: "var(--text-tertiary)" }}>({u.username})</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
