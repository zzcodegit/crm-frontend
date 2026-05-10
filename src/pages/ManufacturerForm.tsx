import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { CountryItem } from "../api";
import CountrySelect from "../components/CountrySelect";

export default function ManufacturerForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [countryId, setCountryId] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [catalogPdfUrl, setCatalogPdfUrl] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [showInLensCatalog, setShowInLensCatalog] = useState(true);
  const [openPdfInLensCatalog, setOpenPdfInLensCatalog] = useState(true);
  const [showCountryInLensCatalog, setShowCountryInLensCatalog] = useState(true);
  const [showDescriptionInLensCatalog, setShowDescriptionInLensCatalog] = useState(true);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const isEdit = id && id !== 'new';

  useEffect(() => {
    loadCountries();
    if (isEdit) {
      loadManufacturer();
    }
  }, [id]);

  async function loadCountries() {
    try {
      const data = await api.ref.countries.list();
      setCountries(data);
    } catch (err) {
      console.error("Ошибка загрузки стран:", err);
    }
  }

  async function loadManufacturer() {
    try {
      setLoading(true);
      const manufacturer = await api.ref.manufacturers.get(parseInt(id!));
      setName(manufacturer.name);
      setDescription(manufacturer.description || "");
      setCountryId(manufacturer.country_id || null);
      setImageUrl(manufacturer.image_url || "");
      setImagePreview(manufacturer.image_url || "");
      setCatalogPdfUrl(manufacturer.catalog_pdf_url || null);
      setShowInLensCatalog(manufacturer.show_in_lens_catalog ?? true);
      setOpenPdfInLensCatalog(manufacturer.open_pdf_in_lens_catalog ?? true);
      setShowCountryInLensCatalog(manufacturer.show_country_in_lens_catalog ?? true);
      setShowDescriptionInLensCatalog(manufacturer.show_description_in_lens_catalog ?? true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Проверка типа файла
    if (!file.type.startsWith('image/')) {
      setError("Пожалуйста, выберите изображение");
      return;
    }

    // Проверка размера (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Файл слишком большой. Максимальный размер: 5MB");
      return;
    }

    setImageFile(file);
    
    // Создаем предпросмотр
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function uploadImage(): Promise<string | null> {
    if (!imageFile) return imageUrl || null;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', imageFile);

      const token = localStorage.getItem('token');
      const response = await fetch('/api/upload/image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Ошибка загрузки изображения');
      }

      const data = await response.json();
      return data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки изображения");
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function uploadPdf(): Promise<string | null> {
    if (!pdfFile) return catalogPdfUrl || null;
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", pdfFile);
      const token = localStorage.getItem("token");
      const res = await fetch("/api/upload/pdf", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Ошибка загрузки PDF");
      }
      const data = await res.json();
      return data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки PDF");
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!name.trim()) {
      setError("Введите название производителя");
      return;
    }

    try {
      setLoading(true);
      setError("");
      
      // Загружаем изображение, если выбрано
      let finalImageUrl = imageUrl;
      if (imageFile) {
        const uploadedUrl = await uploadImage();
        if (uploadedUrl) {
          finalImageUrl = uploadedUrl;
        } else {
          return;
        }
      }
      let finalPdfUrl = catalogPdfUrl;
      if (pdfFile) {
        const uploadedUrl = await uploadPdf();
        if (uploadedUrl) {
          finalPdfUrl = uploadedUrl;
        } else {
          return;
        }
      }

      const data: {
        name: string;
        description?: string;
        country_id?: number;
        image_url?: string;
        catalog_pdf_url?: string | null;
        show_in_lens_catalog?: boolean;
        open_pdf_in_lens_catalog?: boolean;
        show_country_in_lens_catalog?: boolean;
        show_description_in_lens_catalog?: boolean;
      } = {
        name: name.trim(),
        description: description.trim() || undefined,
        country_id: countryId || undefined,
        image_url: finalImageUrl || undefined,
        catalog_pdf_url: finalPdfUrl ?? undefined,
        show_in_lens_catalog: showInLensCatalog,
        open_pdf_in_lens_catalog: openPdfInLensCatalog,
        show_country_in_lens_catalog: showCountryInLensCatalog,
        show_description_in_lens_catalog: showDescriptionInLensCatalog,
      };
      if (finalPdfUrl === null) data.catalog_pdf_url = null;
      
      if (isEdit) {
        await api.ref.manufacturers.update(parseInt(id!), data);
      } else {
        await api.ref.manufacturers.create({ ...data, catalog_pdf_url: data.catalog_pdf_url ?? undefined });
      }
      
      navigate('/settings/references/manufacturers');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  }

  if (loading && isEdit) {
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Навигация */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
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
        <Link 
          to="/settings/references/manufacturers"
          className="transition-colors hover:underline"
          style={{ color: 'var(--text-secondary)' }}
        >
          Производители
        </Link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span style={{ color: 'var(--text-primary)' }}>
          {isEdit ? 'Редактирование' : 'Новый производитель'}
        </span>
      </div>

      {/* Заголовок */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          {isEdit ? 'Редактирование производителя' : 'Новый производитель'}
        </h1>
        <p className="text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
          {isEdit ? 'Измените данные производителя' : 'Добавьте нового производителя линз'}
        </p>
      </div>

      {/* Форма */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div 
          className="p-6 sm:p-8 rounded-2xl space-y-6"
          style={{ 
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
          }}
        >
          {/* Ошибка */}
          {error && (
            <div 
              className="p-4 rounded-xl flex items-start gap-3 animate-slide-in"
              style={{ 
                backgroundColor: 'var(--error-light)',
                color: 'var(--error)',
                border: '1px solid var(--error)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Название */}
          <div>
            <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Название производителя <span style={{ color: 'var(--error)' }}>*</span>
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
                  <path d="M20 7h-9"/>
                  <path d="M14 17H5"/>
                  <circle cx="17" cy="17" r="3"/>
                  <circle cx="7" cy="7" r="3"/>
                </svg>
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: HOYA, ESSILOR, ZEISS"
                required
                disabled={loading || uploading}
                className="w-full pl-12 pr-4 py-3.5 rounded-xl text-base transition-all"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '2px solid var(--border)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.boxShadow = '0 0 0 4px var(--accent-light)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
          </div>

          {/* Страна */}
          <div>
            <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Страна
            </label>
            <CountrySelect
              value={countryId}
              onChange={setCountryId}
              countries={countries}
              disabled={loading || uploading}
            />
            <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Выберите страну производителя
            </p>
          </div>

          {/* Изображение */}
          <div>
            <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Изображение производителя
            </label>
            
            {/* Зона загрузки */}
            <div 
              className="relative rounded-xl p-6 transition-all cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '2px dashed var(--border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.backgroundColor = 'var(--accent-light)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              }}
              onClick={() => document.getElementById('image-upload')?.click()}
            >
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={loading || uploading}
                className="hidden"
              />
              
              {imagePreview ? (
                <div className="flex flex-col items-center gap-3">
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="max-w-full max-h-48 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageFile(null);
                      setImagePreview("");
                      setImageUrl("");
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                      backgroundColor: 'var(--error-light)',
                      color: 'var(--error)',
                    }}
                  >
                    Удалить изображение
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div 
                    className="w-16 h-16 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'var(--accent-light)' }}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                      Нажмите для загрузки изображения
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      PNG, JPG, GIF, WebP или SVG (макс. 5MB)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Каталог PDF */}
          <div>
            <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Каталог (PDF)
            </label>
            <div
              className="rounded-xl p-6 transition-all cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '2px dashed var(--border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.backgroundColor = 'var(--accent-light)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              }}
              onClick={() => document.getElementById('pdf-upload')?.click()}
            >
              <input
                id="pdf-upload"
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 50 * 1024 * 1024) {
                      setError("PDF не более 50 МБ");
                      return;
                    }
                    setPdfFile(file);
                    setError("");
                  }
                }}
                disabled={loading || uploading}
                className="hidden"
              />
              {pdfFile || catalogPdfUrl ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--error)' }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                      <polyline points="10 9 9 9 8 9"/>
                    </svg>
                    {pdfFile ? pdfFile.name : "Каталог PDF загружен"}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPdfFile(null);
                      setCatalogPdfUrl(null);
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{ backgroundColor: 'var(--error-light)', color: 'var(--error)' }}
                  >
                    Удалить PDF
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--accent-light)' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                      <polyline points="10 9 9 9 8 9"/>
                    </svg>
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Нажмите для загрузки каталога (PDF)
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Макс. 50 МБ
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Настройки отображения на странице поставщиков */}
          <div>
            <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Настройки страницы поставщиков
            </label>
            <div
              className="space-y-3 rounded-xl p-4"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInLensCatalog}
                  onChange={(e) => setShowInLensCatalog(e.target.checked)}
                  disabled={loading || uploading}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Показывать поставщика на странице «Поставщики»
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Если выключено — поставщик будет скрыт из каталога поставщиков.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={openPdfInLensCatalog}
                  onChange={(e) => setOpenPdfInLensCatalog(e.target.checked)}
                  disabled={loading || uploading}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    При клике открывать PDF-каталог (если загружен)
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Если PDF отсутствует или опция выключена — будет открыт прайс-лист.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCountryInLensCatalog}
                  onChange={(e) => setShowCountryInLensCatalog(e.target.checked)}
                  disabled={loading || uploading}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Показывать страну на карточке поставщика
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showDescriptionInLensCatalog}
                  onChange={(e) => setShowDescriptionInLensCatalog(e.target.checked)}
                  disabled={loading || uploading}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Показывать описание на карточке поставщика
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Описание */}
          <div>
            <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Описание
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Краткое описание производителя, его особенности и преимущества..."
              rows={4}
              disabled={loading || uploading}
              className="w-full px-4 py-3.5 rounded-xl text-base transition-all resize-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '2px solid var(--border)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.boxShadow = '0 0 0 4px var(--accent-light)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Опишите производителя, его историю, преимущества продукции
            </p>
          </div>
        </div>

        {/* Кнопки */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={loading || uploading}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold text-base transition-all disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(0, 82, 204, 0.3)',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 82, 204, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 82, 204, 0.3)';
            }}
          >
            {loading || uploading ? (
              <>
                <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                {uploading ? 'Загрузка изображения...' : 'Сохранение...'}
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                {isEdit ? 'Сохранить изменения' : 'Создать производителя'}
              </>
            )}
          </button>
          
          <button
            type="button"
            onClick={() => navigate('/settings/references/manufacturers')}
            disabled={loading || uploading}
            className="px-6 py-4 rounded-xl font-medium text-base transition-all disabled:opacity-50"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
            }}
          >
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}
