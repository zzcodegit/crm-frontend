import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { GroupItem, UserItem } from "../api";

export default function GroupMembers() {
  const { groupId: groupIdParam } = useParams<{ groupId: string }>();
  const groupId = groupIdParam ? Number.parseInt(groupIdParam, 10) : NaN;

  const [group, setGroup] = useState<GroupItem | null>(null);
  const [members, setMembers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const formatLastLogin = (v?: string | null) => {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  useEffect(() => {
    if (!Number.isFinite(groupId)) {
      setLoading(false);
      setError("Некорректная группа");
      return;
    }
    setError("");
    setLoading(true);
    Promise.all([api.getGroup(groupId), api.getGroupMembers(groupId)])
      .then(([g, m]) => {
        setGroup(g);
        setMembers(m);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [groupId]);

  if (loading) {
    return (
      <div className="max-w-5xl animate-slide-in">
        <div className="flex items-center gap-3 py-8">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Загрузка...</span>
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="max-w-5xl animate-slide-in space-y-4">
        <Link
          to="/settings/users?tab=groups"
          className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:gap-3"
          style={{ color: "var(--text-secondary)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          К группам
        </Link>
        <div
          className="p-4 rounded-xl text-sm"
          style={{
            backgroundColor: "rgba(222, 53, 11, 0.08)",
            color: "var(--error)",
            border: "1px solid var(--border)",
          }}
        >
          {error || "Группа не найдена"}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl animate-slide-in space-y-6">
      <div>
        <Link
          to="/settings/users?tab=groups"
          className="inline-flex items-center gap-2 text-sm font-medium mb-3 transition-colors hover:gap-3"
          style={{ color: "var(--text-secondary)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Группы
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          {group.name}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Участников: {members.length}
        </p>
      </div>

      <div className="space-y-3">
        {members.length === 0 ? (
          <div
            className="rounded-xl p-12 text-center"
            style={{
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="text-4xl mb-3">👤</div>
            <div className="text-base font-medium mb-1" style={{ color: "var(--text-primary)" }}>
              В группе пока никого нет
            </div>
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Назначьте группу пользователю в карточке редактирования
            </div>
          </div>
        ) : (
          members.map((u) => (
            <div
              key={u.id}
              className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-full"
                  style={{ backgroundColor: "var(--accent-light)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{u.username}</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {u.first_name || u.last_name ? `${u.first_name || ""} ${u.last_name || ""}`.trim() : "Пользователь"}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    Последний вход: {formatLastLogin(u.last_login_at)}
                  </div>
                </div>
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: u.is_active ? "rgba(0, 135, 90, 0.1)" : "var(--bg-secondary)",
                    color: u.is_active ? "var(--success)" : "var(--text-tertiary)",
                  }}
                >
                  {u.is_active ? "Активен" : "Неактивен"}
                </span>
              </div>
              <Link
                to={`/settings/users/${u.id}`}
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors self-start sm:self-auto"
                style={{
                  color: "var(--accent)",
                  backgroundColor: "var(--accent-light)",
                }}
              >
                Карточка пользователя
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
