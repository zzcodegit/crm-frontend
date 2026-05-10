import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { UserItem, GroupItem } from "../api";

type Tab = "users" | "groups";

function membersCountLabel(n: number): string {
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return `${n} участников`;
  if (d === 1) return `${n} участник`;
  if (d >= 2 && d <= 4) return `${n} участника`;
  return `${n} участников`;
}

export default function Users() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "groups" ? "groups" : "users";
  const setTab = (t: Tab) => {
    if (t === "groups") setSearchParams({ tab: "groups" });
    else setSearchParams({});
  };
  const [users, setUsers] = useState<UserItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchUsers, setSearchUsers] = useState("");
  const [onlyNeverLoggedIn, setOnlyNeverLoggedIn] = useState(false);
  const [searchGroups, setSearchGroups] = useState("");
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

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

  const load = () => {
    setError("");
    Promise.all([api.getUsers(), api.getGroups()])
      .then(([u, g]) => { setUsers(u); setGroups(g); })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filteredUsers = useMemo(() => {
    let list = onlyNeverLoggedIn ? users.filter((u) => formatLastLogin(u.last_login_at) === "—") : users;
    const q = searchUsers.trim().toLowerCase();
    if (q) list = list.filter((u) => u.username.toLowerCase().includes(q));
    return list;
  }, [users, searchUsers, onlyNeverLoggedIn]);

  const filteredGroups = useMemo(() => {
    const q = searchGroups.trim().toLowerCase();
    return q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups;
  }, [groups, searchGroups]);

  if (loading) {
    return (
      <div className="max-w-5xl animate-slide-in">
        <div className="flex items-center gap-3 py-8">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Загрузка...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl animate-slide-in space-y-6">
      {/* Header */}
      <div>
        <Link 
          to="/settings" 
          className="inline-flex items-center gap-2 text-sm font-medium mb-3 transition-colors hover:gap-3"
          style={{ color: 'var(--text-secondary)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Настройки
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Пользователи и группы
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button 
          type="button" 
          onClick={() => setTab("users")} 
          className="px-4 py-2 rounded-md text-sm font-medium transition-all"
          style={{
            backgroundColor: tab === "users" ? 'var(--accent)' : 'transparent',
            color: tab === "users" ? '#ffffff' : 'var(--text-primary)',
            border: `1px solid ${tab === "users" ? 'var(--accent)' : 'var(--border)'}`,
          }}
        >
          Пользователи ({users.length})
        </button>
        <button 
          type="button" 
          onClick={() => setTab("groups")} 
          className="px-4 py-2 rounded-md text-sm font-medium transition-all"
          style={{
            backgroundColor: tab === "groups" ? 'var(--accent)' : 'transparent',
            color: tab === "groups" ? '#ffffff' : 'var(--text-primary)',
            border: `1px solid ${tab === "groups" ? 'var(--accent)' : 'var(--border)'}`,
          }}
        >
          Группы ({groups.length})
        </button>
      </div>
      {error && (
        <div 
          className="p-4 rounded-xl text-sm flex items-start gap-3"
          style={{ 
            backgroundColor: 'rgba(222, 53, 11, 0.08)',
            color: 'var(--error)',
            border: '1px solid var(--border)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span className="flex-1">{error}</span>
          <button 
            type="button" 
            onClick={() => setError("")} 
            className="text-xl leading-none hover:opacity-70"
            style={{ color: 'var(--error)' }}
          >
            ×
          </button>
        </div>
      )}
      {tab === "users" && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
              </div>
              <input 
                type="search" 
                placeholder="Поиск по логину..." 
                value={searchUsers} 
                onChange={(e) => setSearchUsers(e.target.value)} 
                className="w-full pl-10 pr-4 py-2.5 rounded-md text-sm transition-all focus:outline-none"
                style={{ 
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--accent)';
                  e.target.style.boxShadow = '0 0 0 3px var(--accent-light)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
            <Link 
              to="/settings/users/new" 
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-sm font-semibold text-white transition-all"
              style={{ backgroundColor: 'var(--accent)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--accent)'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Добавить пользователя
            </Link>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-sm font-semibold text-white transition-all"
              style={{ backgroundColor: 'var(--purple)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--purple)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--purple)'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
              Пригласить пользователя
            </button>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm" style={{ color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={onlyNeverLoggedIn}
                onChange={(e) => setOnlyNeverLoggedIn(e.target.checked)}
                className="w-4 h-4 rounded border shrink-0"
                style={{ accentColor: "var(--accent)", borderColor: "var(--border)" }}
              />
              <span>Только без входа (последний вход: —)</span>
            </label>
          </div>

          <div className="space-y-3">
            {filteredUsers.length === 0 ? (
              <div 
                className="rounded-xl p-12 text-center"
                style={{ 
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="text-4xl mb-3">👤</div>
                <div className="text-base font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  {searchUsers.trim()
                    ? "Ничего не найдено"
                    : onlyNeverLoggedIn
                      ? "Нет таких пользователей"
                      : "Нет пользователей"}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {searchUsers.trim()
                    ? `По запросу «${searchUsers}» ничего не найдено`
                    : onlyNeverLoggedIn
                      ? "У всех выбранных пользователей уже есть отметка последнего входа"
                      : "Добавьте первого пользователя"}
                </div>
              </div>
            ) : (
              filteredUsers.map((u) => (
                <div 
                  key={u.id} 
                  className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{ 
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="flex items-center justify-center w-10 h-10 rounded-full"
                      style={{ backgroundColor: 'var(--accent-light)' }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                    </div>
                    <div>
                      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{u.username}</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : 'Пользователь'}
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                        Последний вход: {formatLastLogin(u.last_login_at)}
                      </div>
                    </div>
                    <span 
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: u.is_active ? 'rgba(0, 135, 90, 0.1)' : 'var(--bg-secondary)',
                        color: u.is_active ? 'var(--success)' : 'var(--text-tertiary)',
                      }}
                    >
                      {u.is_active ? "Активен" : "Неактивен"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Link 
                      to={`/settings/users/${u.id}`} 
                      className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                      style={{ 
                        color: 'var(--accent)',
                        backgroundColor: 'var(--accent-light)',
                      }}
                    >
                      Изменить
                    </Link>
                    <button 
                      type="button" 
                      onClick={() => { 
                        if (confirm("Удалить пользователя?")) { 
                          setError(""); 
                          api.deleteUser(u.id).then(load).catch((e) => setError(e instanceof Error ? e.message : "Ошибка")); 
                        } 
                      }} 
                      className="px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-red-50"
                      style={{ color: 'var(--error)' }}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
      {tab === "groups" && (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
              </div>
              <input 
                type="search" 
                placeholder="Поиск по названию..." 
                value={searchGroups} 
                onChange={(e) => setSearchGroups(e.target.value)} 
                className="w-full pl-10 pr-4 py-2.5 rounded-md text-sm transition-all focus:outline-none"
                style={{ 
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--accent)';
                  e.target.style.boxShadow = '0 0 0 3px var(--accent-light)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
            <button 
              type="button" 
              onClick={() => setAddGroupOpen(true)} 
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-sm font-semibold text-white transition-all"
              style={{ backgroundColor: 'var(--accent)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--accent)'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Добавить группу
            </button>
          </div>

          <div className="space-y-3">
            {filteredGroups.length === 0 ? (
              <div 
                className="rounded-xl p-12 text-center"
                style={{ 
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="text-4xl mb-3">👥</div>
                <div className="text-base font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  {searchGroups.trim() ? "Ничего не найдено" : "Нет групп"}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {searchGroups.trim() ? `По запросу "${searchGroups}" ничего не найдено` : "Добавьте первую группу"}
                </div>
              </div>
            ) : (
              filteredGroups.map((g) => {
                const memberCount = users.filter((u) => u.group_ids?.includes(g.id)).length;
                return (
                <div 
                  key={g.id} 
                  className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{ 
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <Link
                    to={`/settings/groups/${g.id}`}
                    className="flex flex-1 items-center gap-3 min-w-0 rounded-lg -m-1 p-1 transition-opacity hover:opacity-90 no-underline"
                    style={{ color: 'inherit' }}
                  >
                    <div 
                      className="flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0"
                      style={{ backgroundColor: 'var(--purple)' + '20' }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--purple)' }}>
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{g.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {membersCountLabel(memberCount)}
                      </div>
                    </div>
                    <span className="text-sm font-medium flex-shrink-0 hidden sm:inline" style={{ color: 'var(--accent)' }}>
                      Состав →
                    </span>
                  </Link>
                  <div className="flex gap-2 sm:flex-shrink-0">
                    <Link
                      to={`/settings/groups/${g.id}`}
                      className="sm:hidden px-4 py-2 rounded-md text-sm font-medium text-center"
                      style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-light)' }}
                    >
                      Состав
                    </Link>
                    <button 
                      type="button" 
                      onClick={() => { 
                        if (confirm("Удалить группу?")) { 
                          setError(""); 
                          api.deleteGroup(g.id).then(load).catch((e) => setError(e instanceof Error ? e.message : "Ошибка")); 
                        } 
                      }} 
                      className="px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-red-50"
                      style={{ color: 'var(--error)' }}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
                );
              })
            )}
          </div>
        </>
      )}
      {inviteOpen && (
        <InviteModal onClose={() => setInviteOpen(false)} onSaved={() => { setInviteOpen(false); load(); }} onError={setError} />
      )}
      {addGroupOpen && (
        <GroupModal onClose={() => setAddGroupOpen(false)} onSaved={() => { setAddGroupOpen(false); load(); }} onError={setError} />
      )}
    </div>
  );
}

function InviteModal({
  onClose,
  onSaved,
  onError,
}: {
  onClose: () => void;
  onSaved: () => void;
  onError: (s: string) => void;
}) {
  const [fio, setFio] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = fio.trim();
    if (!trimmed) return;
    setSaving(true);
    onError("");
    api
      .inviteUser(trimmed)
      .then(onSaved)
      .catch((e) => onError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setSaving(false));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-xl p-6 animate-slide-in"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          Пригласить пользователя
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              ФИО
            </span>
            <input
              type="text"
              value={fio}
              onChange={(e) => setFio(e.target.value)}
              className="w-full px-4 py-2.5 rounded-md text-sm transition-all focus:outline-none"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              placeholder="Например: Иванов Иван Иванович"
              onFocus={(e) => {
                e.target.style.borderColor = "var(--accent)";
                e.target.style.boxShadow = "0 0 0 3px var(--accent-light)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "var(--border)";
                e.target.style.boxShadow = "none";
              }}
            />
          </label>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-secondary)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-md text-white font-semibold disabled:opacity-70 transition-all"
              style={{ backgroundColor: "var(--accent)" }}
              onMouseEnter={(e) => !saving && (e.currentTarget.style.backgroundColor = "var(--accent-hover)")}
              onMouseLeave={(e) => !saving && (e.currentTarget.style.backgroundColor = "var(--accent)")}
            >
              {saving ? "Приглашаем..." : "Пригласить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GroupModal({ onClose, onSaved, onError }: { onClose: () => void; onSaved: () => void; onError: (s: string) => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    onError("");
    api.createGroup(name.trim()).then(onSaved).catch((e) => onError(e instanceof Error ? e.message : "Ошибка")).finally(() => setSaving(false));
  };
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4" 
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md rounded-xl shadow-xl p-6 animate-slide-in" 
        style={{ 
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Новая группа
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Название
            </span>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              className="w-full px-4 py-2.5 rounded-md text-sm transition-all focus:outline-none" 
              style={{ 
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              placeholder="Название группы"
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--accent)';
                e.target.style.boxShadow = '0 0 0 3px var(--accent-light)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </label>
          <div className="flex gap-2 justify-end pt-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Отмена
            </button>
            <button 
              type="submit" 
              disabled={saving} 
              className="px-5 py-2 rounded-md text-white font-semibold disabled:opacity-70 transition-all"
              style={{ backgroundColor: 'var(--accent)' }}
              onMouseEnter={(e) => !saving && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
              onMouseLeave={(e) => !saving && (e.currentTarget.style.backgroundColor = 'var(--accent)')}
            >
              {saving ? "Создание..." : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
