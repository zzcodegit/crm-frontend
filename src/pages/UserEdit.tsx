import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { UserItem, GroupItem } from "../api";
import { useAuth } from "../contexts/AuthContext";

const isNew = (id: string | undefined) => id === "new" || !id;

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-primary)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  borderRadius: "12px",
  padding: "10px 14px",
  width: "100%",
};

export default function UserEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: me, refreshUser } = useAuth();
  const [user, setUser] = useState<UserItem | null | "new">(null);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [patronymic, setPatronymic] = useState("");
  const [password, setPassword] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set());
  const [impersonateBusy, setImpersonateBusy] = useState(false);

  useEffect(() => {
    if (isNew(id)) {
      setError("");
      api.getGroups().then((g) => { setUser("new"); setGroups(g); }).catch((e) => setError(e instanceof Error ? e.message : "Ошибка")).finally(() => setLoading(false));
      return;
    }
    const uid = Number(id);
    if (Number.isNaN(uid)) { setLoading(false); return; }
    setError("");
    Promise.all([api.getUser(uid), api.getGroups()])
      .then(([u, g]) => {
        setUser(u);
        setGroups(g);
        setUsername(u.username);
        setLastName(u.last_name ?? "");
        setFirstName(u.first_name ?? "");
        setPatronymic(u.patronymic ?? "");
        setTelegramId(u.telegram_id ?? "");
        setPhone(u.phone ?? "");
        setBirthDate(u.birth_date ?? "");
        setIsActive(u.is_active);
        setSelectedGroupIds(new Set(u.group_ids ?? []));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleImpersonate = async () => {
    if (!user || user === "new") return;
    setImpersonateBusy(true);
    setError("");
    try {
      const { access_token } = await api.impersonateUser(user.id);
      localStorage.setItem("token", access_token);
      await refreshUser();
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось авторизоваться под пользователем");
    } finally {
      setImpersonateBusy(false);
    }
  };

  const toggleGroup = (gid: number) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    if (user === "new") {
      if (!username.trim() || !password.trim()) { setError("Укажите логин и пароль"); setSaving(false); return; }
      api.createUser({
        username: username.trim(),
        password: password.trim(),
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        patronymic: patronymic.trim() || undefined,
        telegram_id: telegramId.trim() || undefined,
        phone: phone.trim() || undefined,
        birth_date: birthDate || undefined,
      })
        .then((created) => {
          const promises = [...selectedGroupIds].map((gid) => api.addGroupMember(gid, created.id));
          return Promise.all(promises).then(() => navigate("/settings/users"));
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
        .finally(() => setSaving(false));
      return;
    }
    if (!user) return;
    const uid = user.id;
    const payload: Parameters<typeof api.updateUser>[1] = {
      last_name: lastName.trim() || undefined,
      first_name: firstName.trim() || undefined,
      patronymic: patronymic.trim() || undefined,
      telegram_id: telegramId.trim() || undefined,
      phone: phone.trim() || undefined,
      birth_date: birthDate || null,
      is_active: isActive,
    };
    if (password.trim()) payload.password = password;
    api.updateUser(uid, payload).then(() => {
      const prev = new Set(user.group_ids ?? []);
      const add = [...selectedGroupIds].filter((gid) => !prev.has(gid));
      const remove = [...prev].filter((gid) => !selectedGroupIds.has(gid));
      return Promise.all([...add.map((gid) => api.addGroupMember(gid, uid)), ...remove.map((gid) => api.removeGroupMember(gid, uid))]);
    }).then(() => navigate("/settings/users")).catch((e) => setError(e instanceof Error ? e.message : "Ошибка")).finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span style={{ color: "var(--text-secondary)" }}>Загрузка…</span>
        </div>
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="max-w-2xl">
        <p className="mb-4" style={{ color: "var(--error)" }}>Пользователь не найден.</p>
        <Link to="/settings/users" className="text-sm font-medium hover:underline" style={{ color: "var(--accent)" }}>← К списку пользователей</Link>
      </div>
    );
  }

  const isCreate = user === "new";

  return (
    <div className="space-y-6 max-w-2xl animate-slide-in">
      <div className="flex items-center gap-2 text-sm">
        <Link to="/settings" className="transition-colors hover:underline" style={{ color: "var(--text-secondary)" }}>
          Настройки
        </Link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <Link to="/settings/users" className="transition-colors hover:underline" style={{ color: "var(--text-secondary)" }}>
          Пользователи
        </Link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span style={{ color: "var(--text-primary)" }}>{isCreate ? "Новый пользователь" : "Редактирование"}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          {isCreate ? "Новый пользователь" : `Редактирование: ${user.username}`}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {isCreate ? "Добавьте пользователя системы" : "Измените данные и группы пользователя"}
        </p>
      </div>

      {!isCreate && user && me?.is_admin === true && user.id !== me.id && (
        <div
          className="rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{ backgroundColor: "var(--accent-light)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            Войти в интерфейс от имени этого пользователя (без пароля). Вернётесь через панель сверху.
          </p>
          <button
            type="button"
            disabled={impersonateBusy || !user.is_active}
            onClick={() => void handleImpersonate()}
            className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
            style={{ background: "var(--accent)" }}
          >
            {impersonateBusy ? "Переход…" : "Авторизоваться под пользователем"}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 rounded-xl text-sm" style={{ backgroundColor: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}>
            {error}
          </div>
        )}

        <div className="rounded-2xl p-6 space-y-4" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Данные</h3>
          {isCreate && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Логин</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="Логин" className="w-full rounded-xl border outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]" style={inputStyle} />
            </div>
          )}
          {(["Фамилия", "Имя", "Отчество"] as const).map((label, i) => {
            const keys = [lastName, firstName, patronymic];
            const setters = [setLastName, setFirstName, setPatronymic];
            return (
              <div key={label}>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>{label}</label>
                <input type="text" value={keys[i]} onChange={(e) => setters[i](e.target.value)} placeholder={label} className="w-full rounded-xl border outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]" style={inputStyle} />
              </div>
            );
          })}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>{isCreate ? "Пароль" : "Пароль (пусто = не менять)"}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={isCreate} placeholder="••••••••" className="w-full rounded-xl border outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]" style={inputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>ID Telegram</label>
            <input type="text" value={telegramId} onChange={(e) => setTelegramId(e.target.value)} placeholder="123456789" className="w-full rounded-xl border outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]" style={inputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Номер телефона</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 (999) 123-45-67"
              className="w-full rounded-xl border outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Дата рождения</label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full rounded-xl border outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              style={inputStyle}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!isActive}
              onChange={(e) => setIsActive(!e.target.checked)}
              className="rounded"
              style={{ accentColor: "var(--accent)" }}
            />
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Блокировать пользователя</span>
          </label>
        </div>

        <div className="rounded-2xl p-6 space-y-4" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Группы</h3>
          <div className="flex flex-wrap gap-3">
            {groups.map((g) => (
              <label key={g.id} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors" style={{ borderColor: selectedGroupIds.has(g.id) ? "var(--accent)" : "var(--border)", background: selectedGroupIds.has(g.id) ? "var(--accent-light)" : "transparent", color: "var(--text-primary)" }}>
                <input type="checkbox" checked={selectedGroupIds.has(g.id)} onChange={() => toggleGroup(g.id)} className="rounded" style={{ accentColor: "var(--accent)" }} />
                <span className="text-sm">{g.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" disabled={saving} className="px-6 py-3 rounded-xl font-semibold text-white transition-opacity disabled:opacity-50" style={{ background: "var(--accent)" }}>
            {saving ? (isCreate ? "Создание…" : "Сохранение…") : isCreate ? "Создать" : "Сохранить"}
          </button>
          <Link to="/settings/users" className="inline-flex items-center px-6 py-3 rounded-xl font-medium transition-opacity hover:opacity-90" style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            Отмена
          </Link>
        </div>
      </form>
    </div>
  );
}
