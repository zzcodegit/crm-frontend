import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type TrainingArticleItem } from "../api";
import { useAuth } from "../contexts/AuthContext";

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TrainingArticleView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_admin === true;

  const [loading, setLoading] = useState(true);
  const [article, setArticle] = useState<TrainingArticleItem | null>(null);

  useEffect(() => {
    const articleId = Number(id);
    if (!Number.isFinite(articleId)) {
      navigate("/training", { replace: true });
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.training.get(articleId);
        setArticle(data);
      } catch {
        navigate("/training", { replace: true });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, navigate]);

  if (loading) return <div className="max-w-5xl mx-auto text-sm" style={{ color: "var(--text-secondary)" }}>Загрузка…</div>;
  if (!article) return null;

  return (
    <div className="max-w-5xl mx-auto animate-slide-in">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link to="/training" className="text-sm hover:underline" style={{ color: "var(--accent)" }}>← Ко всем статьям</Link>
        {isAdmin && (
          <button
            type="button"
            onClick={() => navigate(`/training/${article.id}/edit`)}
            className="px-3 py-2 rounded-xl text-sm"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            Изменить
          </button>
        )}
      </div>

      <div className="rounded-2xl p-5" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        <div className="text-[11px] mb-1 font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
          {(article.section || "Общее").trim() || "Общее"}
        </div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>{article.title}</h1>
        <div className="text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
          {article.created_by_username ? `Автор: ${article.created_by_username}` : "Автор не указан"} · {fmtDate(article.updated_at)}
        </div>
        <div
          className="prose prose-sm max-w-none"
          style={{ color: "var(--text-primary)" }}
          dangerouslySetInnerHTML={{ __html: article.content_html || "<p>Без текста</p>" }}
        />
      </div>
    </div>
  );
}
