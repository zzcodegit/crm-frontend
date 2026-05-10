import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import Barcode from "react-barcode";
import { api } from "../api";

interface Lens {
  id: number;
  name: string;
  code: string;
  characteristics?: {
    id: number;
    name: string;
  }[];
}

export default function LensDetail() {
  const { id } = useParams<{ id: string }>();
  const [lens, setLens] = useState<Lens | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadLens();
  }, [id]);

  async function loadLens() {
    if (!id) return;
    
    try {
      setLoading(true);
      const products = await api.ref.products.list();
      const product = products.find(p => p.id === parseInt(id));
      
      if (!product) {
        setError("Линза не найдена");
        return;
      }

      const characteristics = await api.ref.productCharacteristics.list(product.id);
      
      setLens({
        ...product,
        code: product.code ?? "",
        characteristics
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
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

  if (error || !lens) {
    return (
      <div className="max-w-2xl mx-auto">
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
          <div className="text-sm opacity-80 mb-6">{error || "Линза не найдена"}</div>
          <Link
            to="/lens-catalog"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all"
            style={{
              backgroundColor: 'var(--accent)',
              color: '#ffffff',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            Вернуться в каталог
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Навигация */}
      <div className="flex items-center gap-2 text-sm">
        <Link 
          to="/lens-catalog"
          className="transition-colors hover:underline"
          style={{ color: 'var(--text-secondary)' }}
        >
          Поставщики
        </Link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span style={{ color: 'var(--text-primary)' }}>{lens.name}</span>
      </div>

      {/* Основной контент */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Левая колонка - Изображение и штрихкод */}
        <div className="space-y-6">
          {/* Изображение */}
          <div 
            className="aspect-square rounded-2xl flex items-center justify-center"
            style={{ 
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
            }}
          >
            <div 
              className="w-48 h-48 rounded-full flex items-center justify-center"
              style={{ 
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                boxShadow: '0 20px 60px rgba(0, 82, 204, 0.3)',
              }}
            >
              <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
          </div>

          {/* Штрихкод */}
          <div 
            className="p-6 rounded-2xl"
            style={{ 
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              Штрихкод для печати
            </div>
            <div className="bg-white p-6 rounded-xl flex items-center justify-center">
              <Barcode 
                value={lens.code || `LENS${lens.id}`}
                width={2}
                height={80}
                fontSize={14}
                background="#ffffff"
                lineColor="#000000"
              />
            </div>
            <button
              onClick={() => window.print()}
              className="w-full mt-4 px-6 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--accent-light)';
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.color = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Распечатать штрихкод
            </button>
          </div>
        </div>

        {/* Правая колонка - Информация */}
        <div className="space-y-6">
          {/* Заголовок и код */}
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              {lens.name}
            </h1>
            {lens.code && (
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Артикул:
                </span>
                <span 
                  className="text-sm font-mono px-3 py-1.5 rounded-lg"
                  style={{ 
                    backgroundColor: 'var(--accent-light)',
                    color: 'var(--accent)',
                    fontWeight: 600,
                  }}
                >
                  {lens.code}
                </span>
              </div>
            )}
          </div>

          {/* Характеристики */}
          {lens.characteristics && lens.characteristics.length > 0 && (
            <div 
              className="p-6 rounded-2xl"
              style={{ 
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="flex items-center gap-2 mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Доступные характеристики
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {lens.characteristics.map((char) => (
                  <div
                    key={char.id}
                    className="p-4 rounded-xl transition-all cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--accent-light)';
                      e.currentTarget.style.borderColor = 'var(--accent)';
                      e.currentTarget.style.transform = 'translateX(4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: 'var(--accent)' }}
                      />
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {char.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Всего вариантов: <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{lens.characteristics.length}</span>
                </div>
              </div>
            </div>
          )}

          {/* Информационный блок */}
          <div 
            className="p-6 rounded-2xl"
            style={{ 
              backgroundColor: 'var(--accent-light)',
              border: '1px solid var(--accent)',
            }}
          >
            <div className="flex items-start gap-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }} className="flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <div>
                <div className="font-semibold mb-1" style={{ color: 'var(--accent)' }}>
                  Внутренний каталог
                </div>
                <div className="text-sm" style={{ color: 'var(--accent)' }}>
                  Данная страница предназначена для внутреннего использования сотрудниками. Здесь вы можете просмотреть все характеристики линзы и распечатать штрихкод.
                </div>
              </div>
            </div>
          </div>

          {/* Кнопка возврата */}
          <Link
            to="/lens-catalog"
            className="flex items-center justify-center gap-2 w-full px-6 py-4 rounded-xl font-semibold text-base transition-all"
            style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
              color: '#ffffff',
              boxShadow: '0 4px 16px rgba(0, 82, 204, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 82, 204, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 82, 204, 0.3)';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            Вернуться в каталог
          </Link>
        </div>
      </div>
    </div>
  );
}
