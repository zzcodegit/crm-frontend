import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, type ManufacturerItem } from "../api";

type ViewMode = 'grid' | 'list';

export default function LensCatalog() {
  const [manufacturers, setManufacturers] = useState<ManufacturerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

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

  function getManufacturerHref(manufacturer: ManufacturerItem): string {
    const shouldOpenPdf = (manufacturer.open_pdf_in_lens_catalog ?? true) && !!manufacturer.catalog_pdf_url;
    if (shouldOpenPdf && manufacturer.catalog_pdf_url) {
      const sp = new URLSearchParams({
        name: manufacturer.name,
        pdf: manufacturer.catalog_pdf_url,
      });
      return `/lens-catalog/pdf?${sp.toString()}`;
    }
    return `/pricelist?manufacturer=${encodeURIComponent(manufacturer.name)}`;
  }

  function getManufacturerTitle(manufacturer: ManufacturerItem): string {
    const shouldOpenPdf = (manufacturer.open_pdf_in_lens_catalog ?? true) && !!manufacturer.catalog_pdf_url;
    return shouldOpenPdf
      ? `Открыть PDF-каталог: ${manufacturer.name}`
      : `Открыть прайслист: ${manufacturer.name}`;
  }

  const filteredManufacturers = manufacturers.filter((manufacturer) => {
    if (manufacturer.show_in_lens_catalog === false) return false;
    return (
      manufacturer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manufacturer.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manufacturer.country?.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <span style={{ color: 'var(--text-secondary)' }}>Загрузка...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className="p-6 rounded-xl text-center"
        style={{ 
          backgroundColor: 'var(--error-light)',
          color: 'var(--error)',
          border: '1px solid var(--error)',
        }}
      >
        <div className="text-4xl mb-2">⚠️</div>
        <div className="font-semibold mb-1">Ошибка загрузки</div>
        <div className="text-sm opacity-80">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Поставщики
        </h1>
        <p className="text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
          Выберите поставщика для просмотра ассортимента линз
        </p>
      </div>

      {/* Панель управления */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        {/* Поиск */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск производителей..."
            className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm transition-all"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '2px solid var(--border)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-light)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Переключатель вида */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: '2px solid var(--border)' }}>
          <button
            onClick={() => setViewMode('grid')}
            className="px-4 py-2.5 transition-all flex items-center gap-2"
            style={{
              backgroundColor: viewMode === 'grid' ? 'var(--accent)' : 'var(--bg-secondary)',
              color: viewMode === 'grid' ? '#ffffff' : 'var(--text-secondary)',
            }}
            title="Каталог"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
            <span className="hidden sm:inline text-sm font-medium">Каталог</span>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className="px-4 py-2.5 transition-all flex items-center gap-2"
            style={{
              backgroundColor: viewMode === 'list' ? 'var(--accent)' : 'var(--bg-secondary)',
              color: viewMode === 'list' ? '#ffffff' : 'var(--text-secondary)',
              borderLeft: '1px solid var(--border)',
            }}
            title="Список"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/>
              <line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            <span className="hidden sm:inline text-sm font-medium">Список</span>
          </button>
        </div>
      </div>

      {/* Список производителей */}
      {filteredManufacturers.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🔍</div>
          <div className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            {manufacturers.length === 0 ? 'Нет производителей' : 'Ничего не найдено'}
          </div>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {manufacturers.length === 0 ? 'Добавьте производителей в справочнике' : 'Попробуйте изменить запрос'}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredManufacturers.map((manufacturer) => (
            <Link
              key={manufacturer.id}
              to={getManufacturerHref(manufacturer)}
              target={((manufacturer.open_pdf_in_lens_catalog ?? true) && manufacturer.catalog_pdf_url) ? "_blank" : undefined}
              rel={((manufacturer.open_pdf_in_lens_catalog ?? true) && manufacturer.catalog_pdf_url) ? "noopener noreferrer" : undefined}
              className="group rounded-2xl overflow-hidden transition-all"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '2px solid var(--border)',
              }}
              title={getManufacturerTitle(manufacturer)}
            >
              {/* Изображение производителя */}
              {manufacturer.image_url ? (
                <div 
                  className="h-48 flex items-center justify-center overflow-hidden"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <img 
                    src={manufacturer.image_url} 
                    alt={manufacturer.name}
                    className="w-full h-full object-contain p-6"
                  />
                </div>
              ) : (
                <div 
                  className="h-48 p-6 relative overflow-hidden"
                  style={{ 
                    background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                  }}
                >
                  <div className="relative z-10 h-full flex items-center justify-center">
                    <h3 className="text-3xl font-bold text-white text-center">
                      {manufacturer.name}
                    </h3>
                  </div>
                  <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-white/10" />
                  <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/10" />
                </div>
              )}

              {/* Информация */}
              <div className="p-6">
                {manufacturer.image_url && (
                  <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                    {manufacturer.name}
                  </h3>
                )}
                
                {(manufacturer.show_country_in_lens_catalog ?? true) && manufacturer.country && (
                  <div className="flex items-center gap-2 text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    {manufacturer.country.name}
                  </div>
                )}

                {(manufacturer.show_description_in_lens_catalog ?? true) && manufacturer.description && (
                  <p className="text-sm mb-4 whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                    {manufacturer.description}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredManufacturers.map((manufacturer) => (
            <Link
              key={manufacturer.id}
              to={getManufacturerHref(manufacturer)}
              target={((manufacturer.open_pdf_in_lens_catalog ?? true) && manufacturer.catalog_pdf_url) ? "_blank" : undefined}
              rel={((manufacturer.open_pdf_in_lens_catalog ?? true) && manufacturer.catalog_pdf_url) ? "noopener noreferrer" : undefined}
              className="group rounded-2xl overflow-hidden transition-all flex"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
              }}
              title={getManufacturerTitle(manufacturer)}
            >
              {/* Изображение */}
              <div 
                className="w-32 sm:w-48 flex-shrink-0 flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                {manufacturer.image_url ? (
                  <img 
                    src={manufacturer.image_url} 
                    alt={manufacturer.name}
                    className="w-full h-full object-contain p-4"
                  />
                ) : (
                  <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ 
                      background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                    }}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 7h-9"/>
                      <path d="M14 17H5"/>
                      <circle cx="17" cy="17" r="3"/>
                      <circle cx="7" cy="7" r="3"/>
                    </svg>
                  </div>
                )}
              </div>

              {/* Информация */}
              <div className="flex-1 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                    {manufacturer.name}
                  </h3>
                  
                  {(manufacturer.show_country_in_lens_catalog ?? true) && manufacturer.country && (
                    <div className="flex items-center gap-2 text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      {manufacturer.country.name}
                    </div>
                  )}

                  {(manufacturer.show_description_in_lens_catalog ?? true) && manufacturer.description && (
                    <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-tertiary)' }}>
                      {manufacturer.description}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
