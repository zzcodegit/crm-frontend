import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../api";

const COLOR_HEX: Record<string, string> = {
  "Серый": "#6b7280", "Коричневый": "#92400e", "Зелёный": "#22c55e", "Синий": "#2563eb", "Розовый": "#ec4899",
  "Жёлтый": "#eab308", "Оранжевый": "#f97316", "Фиолетовый": "#8b5cf6", "Чёрный": "#1f2937", "Другой": "#9ca3af",
  "Зеленый": "#22c55e", "Голубой": "#0ea5e9", "Сине-фиолетовый": "#6366f1", "Пурпурный": "#a855f7",
  "Золотистый": "#eab308", "Янтарный": "#f59e0b", "Красный": "#ef4444", "Бирюзовый": "#14b8a6",
  "Изумрудный": "#059669", "Сапфировый": "#1e40af", "Рубиновый": "#be123c",
};

/** Для совместимости со списком особенностей (Features.tsx): массив { value, hex } */
export const FEATURE_COLORS = Object.entries(COLOR_HEX).map(([value, hex]) => ({ value, hex }));

export default function FeatureForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = id !== "new";

  const [name, setName] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [colorsRef, setColorsRef] = useState<{ id: number; name: string }[]>([]);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [existingIconUrl, setExistingIconUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);

  useEffect(() => {
    api.api.ref.colors.list().then(setColorsRef).catch(() => setColorsRef([]));
  }, []);

  useEffect(() => {
    if (isEdit) {
      loadFeature();
    } else {
      setInitialLoading(false);
    }
  }, [id]);

  const loadFeature = async () => {
    try {
      const feature = await api.api.ref.features.get(Number(id));
      setName(feature.name);
      setColors((feature.colors && feature.colors.length) ? feature.colors : (feature.color ? [feature.color] : []));
      if (feature.icon_url) {
        setExistingIconUrl(feature.icon_url);
      }
    } catch (error) {
      console.error("Failed to load feature:", error);
      alert("Ошибка при загрузке данных");
    } finally {
      setInitialLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ["image/png", "image/svg+xml", "image/jpeg", "image/jpg"];
      if (!validTypes.includes(file.type)) {
        alert("Пожалуйста, выберите PNG или SVG файл");
        return;
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        alert("Размер файла не должен превышать 2MB");
        return;
      }

      setIconFile(file);
      setIconPreview(URL.createObjectURL(file));
      setExistingIconUrl(null);
    }
  };

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/upload/image", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Failed to upload image");
    }

    const data = await response.json();
    return data.url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert("Пожалуйста, заполните название");
      return;
    }

    setLoading(true);
    setUploading(!!iconFile);

    try {
      let iconUrl = existingIconUrl;

      // Upload new icon if selected
      if (iconFile) {
        iconUrl = await uploadImage(iconFile);
        setUploading(false);
      }

      const data = {
        name: name.trim(),
        icon_url: iconUrl || undefined,
        colors: colors.length ? colors : undefined,
      };

      if (isEdit) {
        await api.api.ref.features.update(Number(id), data);
      } else {
        await api.api.ref.features.create(data);
      }

      navigate("/settings/references/features");
    } catch (error) {
      console.error("Failed to save feature:", error);
      alert("Ошибка при сохранении");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  const handleDeleteIcon = () => {
    setIconFile(null);
    setIconPreview(null);
    setExistingIconUrl(null);
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: "var(--accent) transparent transparent transparent" }}
          />
          <span style={{ color: "var(--text-secondary)" }}>Загрузка...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl animate-slide-in space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        <Link to="/settings" className="hover:underline">
          Настройки
        </Link>
        <span>/</span>
        <Link to="/settings/references" className="hover:underline">
          Справочники
        </Link>
        <span>/</span>
        <Link to="/settings/references/features" className="hover:underline">
          Особенности
        </Link>
        <span>/</span>
        <span style={{ color: "var(--text-primary)" }}>
          {isEdit ? "Редактирование" : "Создание"}
        </span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          {isEdit ? "Редактировать особенность" : "Новая особенность"}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {isEdit ? "Обновите информацию об особенности" : "Добавьте новую особенность для линз"}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div
          className="rounded-2xl p-8 space-y-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
          }}
        >
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Название <span style={{ color: "#ff5630" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Защита от УФ"
              required
              className="w-full px-4 py-3 rounded-xl transition-all outline-none"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Цвета из справочника — можно выбрать несколько */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Цвета (из справочника «Цвета»: для фотохромных, цвета рефлекса и т.д.)
            </label>
            {colorsRef.length === 0 ? (
              <p className="text-sm py-2" style={{ color: "var(--text-secondary)" }}>
                Нет цветов в справочнике. <Link to="/settings/references/colors" className="underline" style={{ color: "var(--accent)" }}>Добавьте цвета</Link>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {colorsRef.map((c) => {
                  const isSelected = colors.includes(c.name);
                  const hex = COLOR_HEX[c.name] ?? "#9ca3af";
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 cursor-pointer rounded-xl px-3 py-2 transition-colors"
                      style={{
                        background: isSelected ? (hex + "22") : "var(--bg-primary)",
                        border: `2px solid ${isSelected ? hex : "var(--border-color)"}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setColors((prev) =>
                            isSelected ? prev.filter((x) => x !== c.name) : [...prev, c.name]
                          );
                        }}
                        className="rounded border-gray-300"
                      />
                      <span
                        className="w-4 h-4 rounded-full shrink-0 border border-white shadow-sm"
                        style={{ backgroundColor: hex }}
                        title={c.name}
                      />
                      <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                        {c.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Icon Upload */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Иконка (PNG или SVG)
            </label>

            {/* Preview */}
            {(iconPreview || existingIconUrl) && (
              <div className="mb-4 flex items-center gap-4">
                <div
                  className="w-24 h-24 rounded-xl flex items-center justify-center overflow-hidden"
                  style={{ background: "var(--bg-tertiary)" }}
                >
                  <img
                    src={iconPreview || existingIconUrl || ""}
                    alt="Preview"
                    className="w-20 h-20 object-contain"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleDeleteIcon}
                  className="px-4 py-2 rounded-lg font-medium transition-all"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "#ff5630",
                  }}
                >
                  Удалить
                </button>
              </div>
            )}

            {/* Upload Zone */}
            {!iconPreview && !existingIconUrl && (
              <div
                className="border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer hover:border-opacity-100"
                style={{
                  borderColor: "var(--border-color)",
                  background: "var(--bg-primary)",
                }}
                onClick={() => document.getElementById("icon-upload")?.click()}
              >
                <div
                  className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{ background: "var(--bg-tertiary)" }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-secondary)" }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <p className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  Нажмите для загрузки
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  PNG или SVG, максимум 2MB
                </p>
              </div>
            )}

            <input
              id="icon-upload"
              type="file"
              accept=".png,.svg,image/png,image/svg+xml"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: loading
                  ? "var(--bg-tertiary)"
                  : "linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)",
                color: "#fff",
              }}
            >
              {loading ? (
                <>
                  <div
                    className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: "#fff transparent transparent transparent" }}
                  />
                  {uploading ? "Загрузка иконки..." : "Сохранение..."}
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {isEdit ? "Сохранить изменения" : "Создать особенность"}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate("/settings/references/features")}
              disabled={loading}
              className="px-6 py-3 rounded-xl font-medium transition-all disabled:opacity-50"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
