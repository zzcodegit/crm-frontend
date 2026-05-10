import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

export default function ColorForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState("");
  const isEdit = id && id !== "new";

  useEffect(() => {
    if (isEdit) {
      setInitialLoading(true);
      api.ref.colors
        .get(Number(id))
        .then((c) => setName(c.name))
        .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"))
        .finally(() => setInitialLoading(false));
    }
  }, [id, isEdit]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Введите название цвета");
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (isEdit) {
        await api.ref.colors.update(Number(id), { name: trimmed });
        navigate("/settings/references/colors");
      } else {
        await api.ref.colors.create({ name: trimmed });
        navigate("/settings/references/colors");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span style={{ color: "var(--text-secondary)" }}>Загрузка...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2 text-sm">
        <Link to="/settings" className="transition-colors hover:underline" style={{ color: "var(--text-secondary)" }}>Настройки</Link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}><polyline points="9 18 15 12 9 6" /></svg>
        <Link to="/settings/references" className="transition-colors hover:underline" style={{ color: "var(--text-secondary)" }}>Справочники</Link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}><polyline points="9 18 15 12 9 6" /></svg>
        <Link to="/settings/references/colors" className="transition-colors hover:underline" style={{ color: "var(--text-secondary)" }}>Цвета</Link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}><polyline points="9 18 15 12 9 6" /></svg>
        <span style={{ color: "var(--text-primary)" }}>{isEdit ? "Редактирование" : "Новый цвет"}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          {isEdit ? "Редактировать цвет" : "Новый цвет"}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {isEdit ? "Измените название цвета" : "Добавьте цвет в справочник (например: Серый, Коричневый)"}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-4 p-4 rounded-xl text-sm" style={{ backgroundColor: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}>
            {error}
          </div>
        )}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Название цвета</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Серый"
            className="w-full px-4 py-3 rounded-xl border transition-colors"
            style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            autoFocus
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={loading} className="px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-50" style={{ background: "var(--accent)", color: "#ffffff" }}>
            {loading ? "Сохранение…" : isEdit ? "Сохранить" : "Добавить"}
          </button>
          <Link to="/settings/references/colors" className="px-6 py-3 rounded-xl font-medium inline-flex items-center gap-2" style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            Отмена
          </Link>
        </div>
      </form>
    </div>
  );
}
