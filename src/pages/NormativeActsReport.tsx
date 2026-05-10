import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type NormativeActItem } from "../api";

type ActReportRow = {
  act: NormativeActItem;
  total: number;
  signed: number;
  unsigned: number;
};

export default function NormativeActsReport() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ActReportRow[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const acts = await api.normativeActs.list();
        const reportRows = await Promise.all(
          acts.map(async (act) => {
            const report = await api.normativeActs.report(act.id);
            const signed = report.filter((x) => x.signed).length;
            const total = report.length;
            return { act, total, signed, unsigned: total - signed };
          })
        );
        reportRows.sort((a, b) => {
          const aTs = a.act.updated_at ? new Date(a.act.updated_at).getTime() : 0;
          const bTs = b.act.updated_at ? new Date(b.act.updated_at).getTime() : 0;
          return bTs - aTs;
        });
        setRows(reportRows);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totals = useMemo(() => {
    const docs = rows.length;
    const totalUsersChecks = rows.reduce((acc, r) => acc + r.total, 0);
    const signedUsersChecks = rows.reduce((acc, r) => acc + r.signed, 0);
    return { docs, totalUsersChecks, signedUsersChecks, unsignedUsersChecks: totalUsersChecks - signedUsersChecks };
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto animate-slide-in">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>Отчет по нормативным актам</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Документы: {totals.docs}. Подписей: {totals.signedUsersChecks}/{totals.totalUsersChecks}, не подписано: {totals.unsignedUsersChecks}
          </p>
        </div>
        <Link to="/normative-acts" className="px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
          Назад к документам
        </Link>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        {loading ? (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Загрузка…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Документов пока нет</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2">Документ</th>
                  <th className="text-left py-2">Подписали</th>
                  <th className="text-left py-2">Не подписали</th>
                  <th className="text-left py-2">Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.act.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="py-2">
                      <div className="font-medium" style={{ color: "var(--text-primary)" }}>{r.act.title}</div>
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{r.act.section || "Общее"}</div>
                    </td>
                    <td className="py-2" style={{ color: "var(--success,#0a9f4b)" }}>{r.signed} / {r.total}</td>
                    <td className="py-2" style={{ color: "var(--error)" }}>{r.unsigned}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <Link to={`/normative-acts/${r.act.id}/report`} className="px-2.5 py-1.5 rounded-lg text-xs" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                          Детально
                        </Link>
                        <Link to={`/normative-acts/${r.act.id}`} className="px-2.5 py-1.5 rounded-lg text-xs" style={{ background: "var(--accent-light)", border: "1px solid var(--accent)", color: "var(--accent)" }}>
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
