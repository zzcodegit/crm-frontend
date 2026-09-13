import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type TrainingArticleAnalyticsItem } from "../api";

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

export default function TrainingArticlesAnalytics() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TrainingArticleAnalyticsItem[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        setRows(await api.training.articlesAnalytics());
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const totals = useMemo(() => {
    const articles = rows.length;
    const viewers = rows.reduce((acc, r) => acc + r.unique_viewers, 0);
    const views = rows.reduce((acc, r) => acc + r.total_views, 0);
    return { articles, viewers, views };
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto animate-slide-in">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            Аналитика статей обучения
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Статей: {totals.articles}. Уникальных зрителей (сумма по статьям): {totals.viewers}. Всего просмотров:{" "}
            {totals.views}
          </p>
        </div>
        <Link
          to="/training"
          className="px-3 py-2 rounded-xl text-sm"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          К обучению
        </Link>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        {loading ? (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Загрузка…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Статей пока нет
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2">Статья</th>
                  <th className="text-left py-2">Раздел</th>
                  <th className="text-left py-2">Опубликована</th>
                  <th className="text-right py-2">Зрители</th>
                  <th className="text-right py-2">Просмотры</th>
                  <th className="text-left py-2">Последний визит</th>
                  <th className="text-left py-2">Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.article_id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="py-2 font-medium" style={{ color: "var(--text-primary)" }}>
                      {r.title}
                    </td>
                    <td className="py-2" style={{ color: "var(--text-secondary)" }}>
                      {r.section || "Общее"}
                    </td>
                    <td className="py-2" style={{ color: r.is_published ? "var(--success,#0a9f4b)" : "var(--text-tertiary)" }}>
                      {r.is_published ? "Да" : "Черновик"}
                    </td>
                    <td className="py-2 text-right" style={{ color: "var(--text-primary)" }}>
                      {r.unique_viewers}
                    </td>
                    <td className="py-2 text-right" style={{ color: "var(--text-primary)" }}>
                      {r.total_views}
                    </td>
                    <td className="py-2" style={{ color: "var(--text-secondary)" }}>
                      {fmtDate(r.last_viewed_at)}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <Link
                          to={`/training/${r.article_id}/report`}
                          className="px-2.5 py-1.5 rounded-lg text-xs"
                          style={{
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border)",
                            color: "var(--text-primary)",
                          }}
                        >
                          Подробнее
                        </Link>
                        <Link
                          to={`/training/${r.article_id}`}
                          className="px-2.5 py-1.5 rounded-lg text-xs"
                          style={{
                            background: "var(--accent-light)",
                            border: "1px solid var(--accent)",
                            color: "var(--accent)",
                          }}
                        >
                          Открыть
                        </Link>
                      </div>
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
