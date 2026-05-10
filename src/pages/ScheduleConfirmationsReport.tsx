import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type WorkScheduleConfirmationReport } from "../api";
import { buildMoscowWeekDays } from "../utils/workScheduleStorage";

export default function ScheduleConfirmationsReport() {
  const [baseDate, setBaseDate] = useState(() => new Date());
  const weekDays = useMemo(() => buildMoscowWeekDays(baseDate), [baseDate]);
  const weekStartKey = weekDays[0]?.key ?? "";

  const [report, setReport] = useState<WorkScheduleConfirmationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!weekStartKey) return;
    let cancelled = false;
    setLoading(true);
    setErr("");
    api.workSchedule
      .getConfirmationsReport(weekStartKey)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setReport(null);
          setErr(e instanceof Error ? e.message : "Не удалось загрузить отчёт");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStartKey]);

  return (
    <div className="animate-slide-in max-w-4xl mx-auto w-full min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            Подтверждения консультантов
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Консультанты, которые указаны в опубликованном графике на эту неделю, и нажали «Подтверждаю» на главной.
          </p>
        </div>
        <Link
          to="/schedule-management"
          className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium shrink-0"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        >
          ← К графику работ
        </Link>
      </div>

      <div className="rounded-2xl p-5 mb-6 border shadow-sm" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
        <div className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
          Неделя отчёта
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setBaseDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            ← Предыдущая неделя
          </button>
          <button
            type="button"
            onClick={() => setBaseDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            Следующая неделя →
          </button>
        </div>
        {weekDays.length > 0 && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {new Date(weekDays[0].key + "T12:00:00").toLocaleDateString("ru-RU")} —{" "}
            {new Date(weekDays[weekDays.length - 1].key + "T12:00:00").toLocaleDateString("ru-RU")}
          </p>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden border shadow-sm" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            Сводка
          </h2>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Загрузка…
            </div>
          ) : err ? (
            <div className="text-sm" style={{ color: "var(--error,#b91c1c)" }}>
              {err}
            </div>
          ) : report ? (
            <>
              <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                Неделя с{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {new Date(report.week_start + "T12:00:00").toLocaleDateString("ru-RU")}
                </strong>
                : подтвердили{" "}
                <strong style={{ color: "var(--accent)" }}>{report.confirmed_count}</strong> из {report.total_consultants}
              </p>
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-sm min-w-[320px]">
                  <thead style={{ background: "var(--bg-secondary)" }}>
                    <tr>
                      <th className="text-left py-2 px-3" style={{ color: "var(--text-secondary)" }}>
                        Сотрудник
                      </th>
                      <th className="text-left py-2 px-3" style={{ color: "var(--text-secondary)" }}>
                        Статус
                      </th>
                      <th className="text-left py-2 px-3 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        Время
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={row.user_id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="py-2 px-3" style={{ color: "var(--text-primary)" }}>
                          {row.display_name}
                          <span className="text-xs block opacity-80" style={{ color: "var(--text-tertiary)" }}>
                            {row.username}
                          </span>
                        </td>
                        <td className="py-2 px-3" style={{ color: row.confirmed_at ? "var(--accent)" : "var(--text-tertiary)" }}>
                          {row.confirmed_at ? "Подтвердил" : "Нет"}
                        </td>
                        <td className="py-2 px-3 tabular-nums whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                          {row.confirmed_at
                            ? new Date(row.confirmed_at).toLocaleString("ru-RU", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Нет данных
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
