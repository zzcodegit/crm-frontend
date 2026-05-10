import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type NormativeActSignReportItem } from "../api";

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function NormativeActReport() {
  const { id } = useParams();
  const actId = Number(id);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<NormativeActSignReportItem[]>([]);

  useEffect(() => {
    if (!Number.isFinite(actId)) return;
    const load = async () => {
      setLoading(true);
      try {
        setRows(await api.normativeActs.report(actId));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [actId]);

  const stats = useMemo(() => {
    const signed = rows.filter((x) => x.signed).length;
    return { signed, unsigned: rows.length - signed, total: rows.length };
  }, [rows]);

  return (
    <div className="max-w-5xl mx-auto animate-slide-in">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>Отчет по подписям</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Подписали: {stats.signed} / {stats.total}, не подписали: {stats.unsigned}</p>
        </div>
        <Link to={`/normative-acts/${actId}`} className="px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Назад к документу</Link>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        {loading ? (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Загрузка…</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2">Пользователь</th>
                  <th className="text-left py-2">Статус</th>
                  <th className="text-left py-2">Дата подписи</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="py-2">
                      <div className="font-medium" style={{ color: "var(--text-primary)" }}>{r.display_name}</div>
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{r.username}</div>
                    </td>
                    <td className="py-2" style={{ color: r.signed ? "var(--success,#0a9f4b)" : "var(--error)" }}>
                      {r.signed ? "Подписал" : "Не подписал"}
                    </td>
                    <td className="py-2" style={{ color: "var(--text-secondary)" }}>{fmtDate(r.signed_at)}</td>
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
