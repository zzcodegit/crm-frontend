import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { ManufacturerItem } from "../api";

export default function Manufacturers() {
  const [manufacturers, setManufacturers] = useState<ManufacturerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadManufacturers();
  }, []);

  async function loadManufacturers() {
    try {
      setLoading(true);
      const data = await api.ref.manufacturers.list();
      setManufacturers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Удалить производителя?")) return;
    
    try {
      await api.ref.manufacturers.delete(id);
      setManufacturers(manufacturers.filter(m => m.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка удаления");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <span className="text-lg" style={{ color: 'var(--text-secondary)' }}>Загрузка...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className="p-8 rounded-2xl text-center"
        style={{ 
          backgroundColor: 'var(--error-light)',
          color: 'var(--error)',
          border: '1px solid var(--error)',
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
      {/* Навигация */}
      <div className="flex items-center gap-2 text-sm">
        <Link 
          to="/settings"
          className="transition-colors hover:underline"
          style={{ color: 'var(--text-secondary)' }}
        >
          Настройки
        </Link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <Link 
          to="/settings/references"
          className="transition-colors hover:underline"
          style={{ color: 'var(--text-secondary)' }}
        >
          Справочники
        </Link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span style={{ color: 'var(--text-primary)' }}>Производители</span>
      </div>

      {/* Заголовок и кнопка добавления */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Производители
          </h1>
          <p className="text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
            Управление производителями линз и оптики
          </p>
        </div>
        
        <button
          onClick={() => navigate('/settings/references/manufacturers/new')}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all whitespace-nowrap"
          style={{
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(0, 82, 204, 0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 82, 204, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 82, 204, 0.3)';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Добавить производителя
        </button>
      </div>

      {/* Статистика */}
      <div 
        className="p-6 rounded-2xl"
        style={{ 
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-4">
          <div 
            className="w-16 h-16 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-light)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
              <path d="M20 7h-9"/>
              <path d="M14 17H5"/>
              <circle cx="17" cy="17" r="3"/>
              <circle cx="7" cy="7" r="3"/>
            </svg>
          </div>
          <div>
            <div className="text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              {manufacturers.length}
            </div>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {manufacturers.length === 1 ? 'Производитель' : manufacturers.length < 5 ? 'Производителя' : 'Производителей'}
            </div>
          </div>
        </div>
      </div>

      {/* Список производителей */}
      {manufacturers.length === 0 ? (
        <div 
          className="p-12 rounded-2xl text-center"
          style={{ 
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="text-6xl mb-4">📦</div>
          <div className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            Нет производителей
          </div>
          <div className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Добавьте первого производителя для начала работы
          </div>
          <button
            onClick={() => navigate('/settings/references/manufacturers/new')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all"
            style={{
              backgroundColor: 'var(--accent)',
              color: '#ffffff',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Добавить производителя
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {manufacturers.map((manufacturer) => (
            <div
              key={manufacturer.id}
              className="group rounded-2xl overflow-hidden transition-all"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Изображение производителя */}
              {manufacturer.image_url && (
                <div 
                  className="h-40 flex items-center justify-center overflow-hidden"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <img 
                    src={manufacturer.image_url} 
                    alt={manufacturer.name}
                    className="w-full h-full object-contain p-4"
                  />
                </div>
              )}

              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  {!manufacturer.image_url && (
                    <div 
                      className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ 
                        background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                      }}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 7h-9"/>
                        <path d="M14 17H5"/>
                        <circle cx="17" cy="17" r="3"/>
                        <circle cx="7" cy="7" r="3"/>
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold mb-1 truncate" style={{ color: 'var(--text-primary)' }}>
                      {manufacturer.name}
                    </h3>
                    {manufacturer.country && (
                      <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        {manufacturer.country.name}
                      </div>
                    )}
                    {manufacturer.description && (
                      <p className="text-xs line-clamp-2 mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        {manufacturer.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/settings/references/manufacturers/${manufacturer.id}`)}
                    className="flex-1 py-2.5 rounded-lg font-medium text-sm transition-all"
                    style={{
                      backgroundColor: 'var(--accent-light)',
                      color: 'var(--accent)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--accent)';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--accent-light)';
                      e.currentTarget.style.color = 'var(--accent)';
                    }}
                  >
                    Редактировать
                  </button>
                  <button
                    onClick={() => handleDelete(manufacturer.id)}
                    className="px-4 py-2.5 rounded-lg transition-all"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--error-light)';
                      e.currentTarget.style.color = 'var(--error)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      <line x1="10" y1="11" x2="10" y2="17"/>
                      <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
