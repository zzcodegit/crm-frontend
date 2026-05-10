import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { WarehouseItem } from "../api";

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadWarehouses();
  }, []);

  async function loadWarehouses() {
    try {
      setLoading(true);
      const data = await api.ref.warehouses.list();
      setWarehouses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Удалить склад?")) return;

    try {
      await api.ref.warehouses.delete(id);
      setWarehouses(warehouses.filter((w) => w.id !== id));
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
      <div
        className="p-8 rounded-2xl text-center"
        style={{
          backgroundColor: "var(--error-light)",
          color: "var(--error)",
          border: "1px solid var(--error)",
        }}
      >
        <div className="text-5xl mb-4">⚠️</div>
        <div className="text-xl font-semibold mb-2">Ошибка</div>
        <div className="text-sm opacity-80">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link to="/settings" className="transition-colors hover:underline" style={{ color: "var(--text-secondary)" }}>
          Настройки
        </Link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <Link to="/settings/references" className="transition-colors hover:underline" style={{ color: "var(--text-secondary)" }}>
          Справочники
        </Link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span style={{ color: "var(--text-primary)" }}>Склады</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            Склады
          </h1>
          <p className="text-sm sm:text-base" style={{ color: "var(--text-secondary)" }}>
            Управление складами. Менеджер заполняется при обмене с 1С или задаётся вручную.
          </p>
        </div>

        <button
          onClick={() => navigate("/settings/references/warehouses/new")}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all whitespace-nowrap"
          style={{
            background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)",
            color: "#ffffff",
            boxShadow: "0 4px 12px rgba(0, 82, 204, 0.3)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 6px 16px rgba(0, 82, 204, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 82, 204, 0.3)";
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Добавить склад
        </button>
      </div>

      {warehouses.length === 0 ? (
        <div
          className="p-12 rounded-2xl text-center"
          style={{
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="text-6xl mb-4">📦</div>
          <div className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            Нет складов
          </div>
          <div className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Добавьте первый склад. Менеджеры заполняются при обмене с 1С.
          </div>
          <button
            onClick={() => navigate("/settings/references/warehouses/new")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all"
            style={{ backgroundColor: "var(--accent)", color: "#ffffff" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Добавить склад
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {warehouses.map((w) => (
            <div
              key={w.id}
              className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border)",
              }}
            >
              <div>
                <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  {w.name}
                </div>
                {w.manager_name && (
                  <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                    Менеджер: {w.manager_name}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/settings/references/warehouses/${w.id}`}
                  className="px-4 py-2.5 rounded-lg font-medium text-sm transition-all"
                  style={{
                    backgroundColor: "var(--accent-light)",
                    color: "var(--accent)",
                  }}
                >
                  Редактировать
                </Link>
                <button
                  onClick={() => handleDelete(w.id)}
                  className="px-4 py-2.5 rounded-lg transition-all"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-secondary)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--error-light)";
                    e.currentTarget.style.color = "var(--error)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
