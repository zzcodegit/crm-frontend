import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type TrainingArticleItem, type TrainingArticleViewReportItem } from "../api";

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TrainingArticleReport() {
  const { id } = useParams();
  const articleId = Number(id);
  const [article, setArticle] = useState<TrainingArticleItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TrainingArticleViewReportItem[]>([]);

  useEffect(() => {
    if (!Number.isFinite(articleId)) return;
    const load = async () => {
      setLoading(true);
      try {
        const [art, report] = await Promise.all([
          api.training.get(articleId),
          api.training.articleReport(articleId),
        ]);
        setArticle(art);
        setRows(report);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [articleId]);

  const stats = useMemo(() => {
    const visited = rows.filter((x) => x.visited).length;
    return { visited, notVisited: rows.length - visited, total: rows.length };
  }, [rows]);

  return (
    <div className="max-w-5xl mx-auto animate-slide-in">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            Статистика просмотров
          </h1>
          {article ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {article.title} · заходили: {stats.visited} / {stats.total}, не заходили: {stats.notVisited}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/training/analytics"
            className="px-3 py-2 rounded-xl text-sm"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            Вся аналитика
          </Link>
          <Link
            to={`/training/${articleId}`}
            className="px-3 py-2 rounded-xl text-sm"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            К статье
          </Link>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        {loading ? (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Загрузка…
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2">Пользователь</th>
                  <th className="text-left py-2">Статус</th>
                  <th className="text-left py-2">Первый визит</th>
                  <th className="text-left py-2">Последний визит</th>
                  <th className="text-right py-2">Просмотров</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="py-2">
                      <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {r.display_name}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {r.username}
                      </div>
                    </td>
                    <td className="py-2" style={{ color: r.visited ? "var(--success,#0a9f4b)" : "var(--error)" }}>
                      {r.visited ? "Заходил" : "Не заходил"}
                    </td>
                    <td className="py-2" style={{ color: "var(--text-secondary)" }}>
                      {fmtDate(r.first_viewed_at)}
                    </td>
                    <td className="py-2" style={{ color: "var(--text-secondary)" }}>
                      {fmtDate(r.last_viewed_at)}
                    </td>
                    <td className="py-2 text-right" style={{ color: "var(--text-secondary)" }}>
                      {r.view_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
