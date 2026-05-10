import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { removeWeekOverridesFromStorage } from "../utils/workScheduleStorage";

function weekRangeLabel(mondayYmd: string): string {
  const m = new Date(mondayYmd + "T12:00:00");
  const sun = new Date(m);
  sun.setDate(m.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
  return `${m.toLocaleDateString("ru-RU", opts)} — ${sun.toLocaleDateString("ru-RU", opts)}`;
}

export default function PublishedWeeksPanel({
  refreshKey,
  onWeekDeleted,
}: {
  refreshKey: number;
  /** После снятия недели с публикации — перечитать редактор */
  onWeekDeleted?: () => void;
}) {
  const [weeks, setWeeks] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const data = await api.workSchedule.getPublished();
      setWeeks(data.weeks ?? {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось загрузить");
      setWeeks({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const keys = Object.keys(weeks).sort();

  const handleDelete = async (ws: string) => {
    if (
      !window.confirm(
        `Снять с публикации неделю ${weekRangeLabel(ws)}? На главной эта неделя перестанет отображаться у консультантов.`
      )
    )
      return;
    setDeleting(ws);
    setErr(null);
    try {
      await api.workSchedule.deletePublishedWeek(ws);
      removeWeekOverridesFromStorage(ws);
      setWeeks((prev) => {
        const next = { ...prev };
        delete next[ws];
        return next;
      });
      onWeekDeleted?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div
      className="mb-6 p-4 rounded-xl border min-w-0"
      style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
    >
      <div className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        Опубликованные недели
      </div>
      <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
        Изменить график: «Открыть в редакторе» — правки в таблице ниже — «Опубликовать». На сервер уходят недели из локального хранилища этого браузера; они дополняют уже опубликованное, остальные недели не удаляются.
      </p>
      {err && (
        <p className="text-sm mb-2" style={{ color: "var(--error,#b91c1c)" }}>
          {err}
        </p>
      )}
      {loading ? (
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Загрузка…
        </div>
      ) : keys.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Нет опубликованных недель.
        </p>
      ) : (
        <ul className="space-y-2">
          {keys.map((ws) => (
            <li
              key={ws}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
            >
              <span className="text-sm min-w-0" style={{ color: "var(--text-primary)" }}>
                {weekRangeLabel(ws)}{" "}
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  (пн. {ws})
                </span>
              </span>
              <span className="flex flex-wrap gap-2 shrink-0">
                <Link
                  to={`/schedule-management?week=${encodeURIComponent(ws)}`}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                >
                  Открыть в редакторе
                </Link>
                <button
                  type="button"
                  disabled={deleting === ws}
                  onClick={() => void handleDelete(ws)}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                  style={{ background: "#fee2e2", border: "1px solid #fecaca", color: "#b91c1c" }}
                >
                  {deleting === ws ? "Удаление…" : "Снять с публикации"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
