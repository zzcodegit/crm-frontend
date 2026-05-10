import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { RefItem } from "../api";

export default function Colors() {
  const [items, setItems] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await api.ref.colors.list();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Удалить этот цвет из справочника?")) return;
    try {
      await api.ref.colors.delete(id);
      setItems(items.filter((c) => c.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка удаления");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span className="text-lg" style={{ color: "var(--text-secondary)" }}>Загрузка...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl text-center" style={{ backgroundColor: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}>
        <div className="text-5xl mb-4">⚠️</div>
        <div className="text-xl font-semibold mb-2">Ошибка</div>
        <div className="text-sm opacity-80">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link to="/settings" className="transition-colors hover:underline" style={{ color: "var(--text-secondary)" }}>Настройки</Link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}><polyline points="9 18 15 12 9 6" /></svg>
        <Link to="/settings/references" className="transition-colors hover:underline" style={{ color: "var(--text-secondary)" }}>Справочники</Link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}><polyline points="9 18 15 12 9 6" /></svg>
        <span style={{ color: "var(--text-primary)" }}>Цвета</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Справочник цветов</h1>
          <p className="text-sm sm:text-base" style={{ color: "var(--text-secondary)" }}>
            Цвета для особенностей линз (хамелеоны, цвет остаточного рефлекса). Используются в особенностях и в прайслисте.
          </p>
        </div>
        <button
          onClick={() => navigate("/settings/references/colors/new")}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all whitespace-nowrap"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Добавить цвет
        </button>
      </div>

      <div className="p-6 rounded-2xl" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        {items.length === 0 ? (
          <div className="p-12 rounded-xl text-center" style={{ backgroundColor: "var(--bg-secondary)", border: "1px dashed var(--border)" }}>
            <div className="text-6xl mb-4">🎨</div>
            <div className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Нет цветов</div>
            <div className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>Добавьте цвета для использования в особенностях (Серый, Коричневый, Зелёный и т.д.)</div>
            <button onClick={() => navigate("/settings/references/colors/new")} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all" style={{ backgroundColor: "var(--accent)", color: "#ffffff" }}>
              Добавить цвет
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl p-4" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{c.name}</span>
                <div className="flex gap-2">
                  <button onClick={() => navigate(`/settings/references/colors/${c.id}`)} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: "var(--accent-light)", color: "var(--accent)" }}>Изменить</button>
                  <button onClick={() => handleDelete(c.id)} className="p-2 rounded-lg" style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)" }} title="Удалить">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
