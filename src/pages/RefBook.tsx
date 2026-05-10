import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { RefItem } from "../api";

const REF_KEYS = ["order-statuses", "priorities", "manufacturers", "organizations", "departments", "authors", "vat-rates", "expense-articles", "taken-reasons", "taken-sources", "debt-reasons"] as const;
const TITLES: Record<string, string> = {
  "order-statuses": "Статусы заказов",
  priorities: "Приоритеты",
  manufacturers: "Производители",
  organizations: "Организации",
  departments: "Подразделения",
  authors: "Авторы",
  "vat-rates": "Ставки НДС",
  "expense-articles": "Статьи расходов",
  "taken-reasons": "Взято за что",
  "taken-sources": "Откуда взято",
  "debt-reasons": "Долг за что",
};

function getRefApi(key: string) {
  const m = {
    "order-statuses": api.ref.orderStatuses,
    priorities: api.ref.priorities,
    manufacturers: api.ref.manufacturers,
    organizations: api.ref.organizations,
    departments: api.ref.departments,
    authors: api.ref.authors,
    "vat-rates": api.ref.vatRates,
    "expense-articles": api.ref.expenseArticles,
    "taken-reasons": api.ref.takenReasons,
    "taken-sources": api.ref.takenSources,
    "debt-reasons": api.ref.debtReasons,
  } as const;
  return m[key as keyof typeof m];
}

export default function RefBook() {
  const { refKey } = useParams<{ refKey: string }>();
  const [items, setItems] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [editName, setEditName] = useState("");

  const refApi = refKey ? getRefApi(refKey) : null;
  const title = refKey ? TITLES[refKey] : "";

  const load = () => {
    if (!refApi) return;
    setError("");
    refApi.list().then(setItems).catch((e) => setError(e instanceof Error ? e.message : "Ошибка")).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!refKey || !REF_KEYS.includes(refKey as (typeof REF_KEYS)[number])) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load();
  }, [refKey]);

  if (!refKey || !refApi) {
    return (
      <div className="max-w-4xl animate-slide-in">
        <div 
          className="rounded-xl p-8 text-center"
          style={{ 
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="text-4xl mb-3">📚</div>
          <p className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            Справочник не найден
          </p>
          <Link 
            to="/settings/references" 
            className="inline-flex items-center gap-2 text-sm font-medium mt-4 transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Вернуться к справочникам
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl animate-slide-in">
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>{title}</h1>
        <div className="flex items-center gap-3 py-8">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Загрузка...</span>
        </div>
      </div>
    );
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError("");
    refApi.create({ name: newName.trim() }).then(() => { setNewName(""); load(); }).catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (editId == null || !editName.trim()) return;
    setError("");
    refApi.update(editId, { name: editName.trim() }).then(() => { setEditId(null); setEditName(""); load(); }).catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
  };

  const handleDelete = (id: number) => {
    if (!confirm("Удалить?")) return;
    setError("");
    refApi.delete(id).then(load).catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
  };

  return (
    <div className="max-w-4xl animate-slide-in space-y-6">
      {/* Header */}
      <div>
        <Link 
          to="/settings/references" 
          className="inline-flex items-center gap-2 text-sm font-medium mb-3 transition-colors hover:gap-3"
          style={{ color: 'var(--text-secondary)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Справочники
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h1>
      </div>

      {/* Error */}
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

      {/* Add Form */}
      <form onSubmit={handleCreate} className="flex gap-2">
        <input 
          type="text" 
          value={newName} 
          onChange={(e) => setNewName(e.target.value)} 
          placeholder="Введите название..." 
          className="flex-1 px-4 py-2.5 rounded-md text-sm transition-all focus:outline-none"
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
        <button 
          type="submit" 
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-semibold text-white transition-all"
          style={{ backgroundColor: 'var(--accent)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--accent)'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Добавить
        </button>
      </form>

      {/* Items List */}
      <div className="space-y-3">
        {items.length === 0 ? (
          <div 
            className="rounded-xl p-12 text-center"
            style={{ 
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="text-4xl mb-3">📝</div>
            <div className="text-base font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              Список пуст
            </div>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Добавьте первый элемент
            </div>
          </div>
        ) : (
          items.map((it) => (
            <div 
              key={it.id} 
              className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{ 
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
              }}
            >
              {editId === it.id ? (
                <form onSubmit={handleUpdate} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
                  <input 
                    type="text" 
                    value={editName} 
                    onChange={(e) => setEditName(e.target.value)} 
                    className="flex-1 px-4 py-2 rounded-md text-sm transition-all focus:outline-none"
                    style={{ 
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                    autoFocus 
                    onFocus={(e) => {
                      e.target.style.borderColor = 'var(--accent)';
                      e.target.style.boxShadow = '0 0 0 3px var(--accent-light)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'var(--border)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  <div className="flex gap-2">
                    <button 
                      type="submit" 
                      className="px-4 py-2 rounded-md text-sm font-semibold text-white transition-all"
                      style={{ backgroundColor: 'var(--accent)' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--accent)'}
                    >
                      Сохранить
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setEditId(null); setEditName(""); }} 
                      className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                      style={{ 
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{it.name}</span>
                  <div className="flex gap-2">
                    <button 
                      type="button" 
                      onClick={() => { setEditId(it.id); setEditName(it.name); }} 
                      className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                      style={{ 
                        color: 'var(--accent)',
                        backgroundColor: 'var(--accent-light)',
                      }}
                    >
                      Изменить
                    </button>
                    <button 
                      type="button" 
                      onClick={() => handleDelete(it.id)} 
                      className="px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-red-50"
                      style={{ color: 'var(--error)' }}
                    >
                      Удалить
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
