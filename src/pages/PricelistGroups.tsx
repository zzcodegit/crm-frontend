import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { PricelistGroupItem } from "../api";

export type PricelistGroupsCatalog = "warehouse" | "rx" | "mkl";

const CATALOG: Record<
  PricelistGroupsCatalog,
  {
    list: () => Promise<PricelistGroupItem[]>;
    delete: (id: number) => Promise<unknown>;
    basePath: string;
    pageTitle: string;
    pageDescription: string;
    deleteConfirm: string;
    emptyHint: string;
  }
> = {
  warehouse: {
    list: () => api.ref.pricelistGroups.list(),
    delete: (id) => api.ref.pricelistGroups.delete(id),
    basePath: "/settings/references/pricelist-groups",
    pageTitle: "Группы прайслиста",
    pageDescription:
      "Группы для позиций прайслиста. Порядок отображения на прайслисте и в сайдбаре задаётся индексом сортировки.",
    deleteConfirm: "Удалить эту группу? Позиции прайслиста с этой группой не будут удалены.",
    emptyHint: "Добавьте группы для фильтрации прайслиста (например: Однофокальные, Прогрессивные)",
  },
  rx: {
    list: () => api.ref.pricelistRxGroups.list(),
    delete: (id) => api.ref.pricelistRxGroups.delete(id),
    basePath: "/settings/references/pricelist-rx-groups",
    pageTitle: "Группы RX",
    pageDescription:
      "Группы для позиций RX (/pricelist-rx). Порядок на странице и в сайдбаре задаётся индексом сортировки.",
    deleteConfirm: "Удалить эту группу? Позиции RX с этой группой не будут удалены.",
    emptyHint: "Добавьте группы для разделов RX (как на основном прайслисте).",
  },
  mkl: {
    list: () => api.ref.pricelistMklGroups.list(),
    delete: (id) => api.ref.pricelistMklGroups.delete(id),
    basePath: "/settings/references/pricelist-mkl-groups",
    pageTitle: "Группы прайслиста МКЛ",
    pageDescription:
      "Группы для позиций прайслиста МКЛ (/pricelist-mkl). Порядок на странице и в сайдбаре задаётся индексом сортировки.",
    deleteConfirm: "Удалить эту группу? Позиции прайслиста МКЛ с этой группой не будут удалены.",
    emptyHint: "Добавьте группы для разделов прайслиста МКЛ.",
  },
};

export function PricelistGroupsPage({ catalog }: { catalog: PricelistGroupsCatalog }) {
  const c = CATALOG[catalog];
  const [groups, setGroups] = useState<PricelistGroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadGroups();
  }, [catalog]);

  async function loadGroups() {
    try {
      setLoading(true);
      const data = await c.list();
      setGroups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(c.deleteConfirm)) return;
    try {
      await c.delete(id);
      setGroups(groups.filter((g) => g.id !== id));
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
        <span style={{ color: "var(--text-primary)" }}>{c.pageTitle}</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>{c.pageTitle}</h1>
          <p className="text-sm sm:text-base" style={{ color: "var(--text-secondary)" }}>
            {c.pageDescription}
          </p>
        </div>
        <button
          onClick={() => navigate(`${c.basePath}/new`)}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all whitespace-nowrap"
          style={{ background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)", color: "#ffffff", boxShadow: "0 4px 12px rgba(0, 82, 204, 0.3)" }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(0, 82, 204, 0.4)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 82, 204, 0.3)"; }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Добавить группу
        </button>
      </div>

      <div className="p-6 rounded-2xl" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ backgroundColor: "var(--accent-light)" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <div>
            <div className="text-3xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>{groups.length}</div>
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{groups.length === 1 ? "Группа" : groups.length < 5 ? "Группы" : "Групп"}</div>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="p-12 rounded-xl text-center" style={{ backgroundColor: "var(--bg-secondary)", border: "1px dashed var(--border)" }}>
            <div className="text-6xl mb-4">📋</div>
            <div className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Нет групп</div>
            <div className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>{c.emptyHint}</div>
            <button onClick={() => navigate(`${c.basePath}/new`)} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all" style={{ backgroundColor: "var(--accent)", color: "#ffffff" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Добавить группу
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((g) => (
              <div key={g.id} className="group rounded-xl p-5 transition-all" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 4px 12px var(--shadow)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}>
                <h3 className="text-lg font-semibold mb-1 truncate" style={{ color: "var(--text-primary)" }}>{g.name}</h3>
                <div className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>Порядок: {g.sort_index ?? 0}</div>
                <div className="flex gap-2">
                  <button onClick={() => navigate(`${c.basePath}/${g.id}`)} className="flex-1 py-2.5 rounded-lg font-medium text-sm transition-all" style={{ backgroundColor: "var(--accent-light)", color: "var(--accent)" }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--accent)"; e.currentTarget.style.color = "#ffffff"; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--accent-light)"; e.currentTarget.style.color = "var(--accent)"; }}>Редактировать</button>
                  <button onClick={() => handleDelete(g.id)} className="px-4 py-2.5 rounded-lg transition-all" style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)" }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--error-light)"; e.currentTarget.style.color = "var(--error)"; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-tertiary)"; e.currentTarget.style.color = "var(--text-secondary)"; }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
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

export default function PricelistGroups() {
  return <PricelistGroupsPage catalog="warehouse" />;
}
