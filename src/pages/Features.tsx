import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as api from "../api";
import { FEATURE_COLORS } from "./FeatureForm";

interface FeatureItem {
  id: number;
  name: string;
  icon_url?: string;
  color?: string;
  colors?: string[];
}

function getColorHex(colorName: string | undefined): string | undefined {
  if (!colorName) return undefined;
  return FEATURE_COLORS.find((c) => c.value === colorName)?.hex;
}

export default function Features() {
  const [features, setFeatures] = useState<FeatureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadFeatures();
  }, []);

  const loadFeatures = async () => {
    setLoading(true);
    try {
      const data = await api.api.ref.features.list();
      setFeatures(data);
    } catch (error) {
      console.error("Failed to load features:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Удалить эту особенность?")) return;
    try {
      await api.api.ref.features.delete(id);
      setFeatures(features.filter((f) => f.id !== id));
    } catch (error) {
      console.error("Failed to delete feature:", error);
      alert("Ошибка при удалении");
    }
  };

  if (loading) {
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
    <div className="max-w-6xl animate-slide-in space-y-6">
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
        <span style={{ color: "var(--text-primary)" }}>Особенности</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            Особенности
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Управление особенностями и характеристиками линз
          </p>
        </div>
        <button
          onClick={() => navigate("/settings/references/features/new")}
          className="px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 shadow-sm hover:shadow-md hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)",
            color: "#fff",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Добавить особенность
        </button>
      </div>

      {/* Features Grid */}
      {features.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
          }}
        >
          <div
            className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: "var(--bg-tertiary)" }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-secondary)" }}>
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            Нет особенностей
          </h3>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Добавьте первую особенность для линз
          </p>
          <button
            onClick={() => navigate("/settings/references/features/new")}
            className="px-6 py-2.5 rounded-xl font-medium transition-all inline-flex items-center gap-2"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)",
              color: "#fff",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Добавить особенность
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature) => (
            <div
              key={feature.id}
              className="rounded-2xl p-6 transition-all hover:shadow-lg group"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              {/* Icon */}
              <div className="mb-4">
                {feature.icon_url ? (
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden"
                    style={{ background: "var(--bg-tertiary)" }}
                  >
                    <img
                      src={feature.icon_url}
                      alt={feature.name}
                      className="w-12 h-12 object-contain"
                    />
                  </div>
                ) : (
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center"
                    style={{ background: "var(--bg-tertiary)" }}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-secondary)" }}>
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  </div>
                )}
              </div>

              {/* Name */}
              <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                {feature.name}
              </h3>

              {/* Цвета — один или несколько */}
              {((feature.colors && feature.colors.length) ? feature.colors : (feature.color ? [feature.color] : [])).length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {((feature.colors && feature.colors.length) ? feature.colors : (feature.color ? [feature.color] : [])).map((colorName, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span
                        className="w-4 h-4 rounded-full shrink-0 border border-white shadow-sm"
                        style={{
                          background: getColorHex(colorName) ?? "var(--bg-tertiary)",
                          borderColor: "var(--border-color)",
                        }}
                        title={colorName}
                      />
                      <span className="text-sm truncate max-w-[120px]" style={{ color: "var(--text-secondary)" }}>
                        {colorName}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {((feature.colors && feature.colors.length) ? feature.colors : (feature.color ? [feature.color] : [])).length === 0 && <div className="mb-4" />}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/settings/references/features/${feature.id}`)}
                  className="flex-1 px-4 py-2 rounded-lg font-medium transition-all"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                  }}
                >
                  Редактировать
                </button>
                <button
                  onClick={() => handleDelete(feature.id)}
                  className="px-4 py-2 rounded-lg font-medium transition-all hover:bg-red-50"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "#ff5630",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
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
