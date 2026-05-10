import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { api } from "../api";
import type { PricelistGroupsCatalog } from "./PricelistGroups";

const FORM_CATALOG: Record<
  PricelistGroupsCatalog,
  {
    basePath: string;
    listTitle: string;
    newTitle: string;
    editTitle: string;
    subtitleNew: string;
    subtitleEdit: string;
    get: (id: number) => ReturnType<typeof api.ref.pricelistGroups.get>;
    create: (d: Parameters<typeof api.ref.pricelistGroups.create>[0]) => ReturnType<typeof api.ref.pricelistGroups.create>;
    update: (id: number, d: Parameters<typeof api.ref.pricelistGroups.update>[1]) => ReturnType<typeof api.ref.pricelistGroups.update>;
  }
> = {
  warehouse: {
    basePath: "/settings/references/pricelist-groups",
    listTitle: "Группы прайслиста",
    newTitle: "Новая группа прайслиста",
    editTitle: "Редактировать группу",
    subtitleNew: "Добавьте группу для позиций прайслиста (например: Однофокальные, Прогрессивные)",
    subtitleEdit: "Измените название группы",
    get: (id) => api.ref.pricelistGroups.get(id),
    create: (d) => api.ref.pricelistGroups.create(d),
    update: (id, d) => api.ref.pricelistGroups.update(id, d),
  },
  rx: {
    basePath: "/settings/references/pricelist-rx-groups",
    listTitle: "Группы RX",
    newTitle: "Новая группа RX",
    editTitle: "Редактировать группу RX",
    subtitleNew: "Добавьте группу для позиций на странице /pricelist-rx",
    subtitleEdit: "Измените название группы RX",
    get: (id) => api.ref.pricelistRxGroups.get(id),
    create: (d) => api.ref.pricelistRxGroups.create(d),
    update: (id, d) => api.ref.pricelistRxGroups.update(id, d),
  },
  mkl: {
    basePath: "/settings/references/pricelist-mkl-groups",
    listTitle: "Группы прайслиста МКЛ",
    newTitle: "Новая группа прайслиста МКЛ",
    editTitle: "Редактировать группу МКЛ",
    subtitleNew: "Добавьте группу для позиций на странице /pricelist-mkl",
    subtitleEdit: "Измените название группы прайслиста МКЛ",
    get: (id) => api.ref.pricelistMklGroups.get(id),
    create: (d) => api.ref.pricelistMklGroups.create(d),
    update: (id, d) => api.ref.pricelistMklGroups.update(id, d),
  },
};

export default function PricelistGroupForm() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const catalog: PricelistGroupsCatalog = useMemo(
    () =>
      location.pathname.includes("pricelist-rx-groups")
        ? "rx"
        : location.pathname.includes("pricelist-mkl-groups")
          ? "mkl"
          : "warehouse",
    [location.pathname]
  );
  const c = FORM_CATALOG[catalog];
  const [name, setName] = useState("");
  const [sortIndex, setSortIndex] = useState(500);
  const [displayPropertiesInList, setDisplayPropertiesInList] = useState(true);
  const [displayAsTiles, setDisplayAsTiles] = useState(false);
  const [tilesPerPage, setTilesPerPage] = useState(4);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState("");
  const isEdit = id && id !== "new";

  useEffect(() => {
    if (isEdit) {
      setInitialLoading(true);
      c
        .get(Number(id))
        .then((g) => {
          setName(g.name);
          setSortIndex(g.sort_index ?? 0);
          setDisplayPropertiesInList(g.display_properties_in_list ?? true);
          setDisplayAsTiles(g.display_as_tiles ?? false);
          setTilesPerPage(g.tiles_per_page != null && g.tiles_per_page > 0 ? g.tiles_per_page : 4);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"))
        .finally(() => setInitialLoading(false));
    }
  }, [id, isEdit, catalog]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Введите название группы");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const payload = {
        name: trimmed,
        sort_index: sortIndex,
        display_properties_in_list: displayPropertiesInList,
        display_as_tiles: displayAsTiles,
        tiles_per_page: tilesPerPage,
      };
      if (isEdit) {
        await c.update(Number(id), payload);
      } else {
        await c.create(payload);
      }
      navigate(c.basePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span style={{ color: "var(--text-secondary)" }}>Загрузка...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
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
        <Link to={c.basePath} className="transition-colors hover:underline" style={{ color: "var(--text-secondary)" }}>
          {c.listTitle}
        </Link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span style={{ color: "var(--text-primary)" }}>{isEdit ? "Редактирование" : "Новая группа"}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          {isEdit ? c.editTitle : c.newTitle}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {isEdit ? c.subtitleEdit : c.subtitleNew}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {error && (
          <div
            className="mb-4 p-4 rounded-xl text-sm"
            style={{ backgroundColor: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}
          >
            {error}
          </div>
        )}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Название группы
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Однофокальные"
            className="w-full px-4 py-3 rounded-xl border transition-colors"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
            autoFocus
          />
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Индекс сортировки
          </label>
          <input
            type="number"
            min={0}
            value={sortIndex}
            onChange={(e) => setSortIndex(parseInt(e.target.value, 10) || 0)}
            className="w-full max-w-[120px] px-4 py-3 rounded-xl border transition-colors"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>Чем меньше число, тем выше группа в списке на прайслисте и в сайдбаре.</p>
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Отображать свойства в списке
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDisplayPropertiesInList(true)}
              className="px-4 py-2 rounded-xl text-sm font-medium border transition-colors"
              style={{
                borderColor: displayPropertiesInList ? "var(--accent)" : "var(--border)",
                backgroundColor: displayPropertiesInList ? "var(--accent-light)" : "var(--bg-primary)",
                color: displayPropertiesInList ? "var(--accent)" : "var(--text-primary)",
              }}
            >
              Да
            </button>
            <button
              type="button"
              onClick={() => setDisplayPropertiesInList(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium border transition-colors"
              style={{
                borderColor: !displayPropertiesInList ? "var(--accent)" : "var(--border)",
                backgroundColor: !displayPropertiesInList ? "var(--accent-light)" : "var(--bg-primary)",
                color: !displayPropertiesInList ? "var(--accent)" : "var(--text-primary)",
              }}
            >
              Нет
            </button>
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Управляет блоком параметров (SPH/CYL/Шаг/Ø) в карточках списка прайслиста.
          </p>
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Отображать группу плиткой на прайслисте
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDisplayAsTiles(true)}
              className="px-4 py-2 rounded-xl text-sm font-medium border transition-colors"
              style={{
                borderColor: displayAsTiles ? "var(--accent)" : "var(--border)",
                backgroundColor: displayAsTiles ? "var(--accent-light)" : "var(--bg-primary)",
                color: displayAsTiles ? "var(--accent)" : "var(--text-primary)",
              }}
            >
              Да
            </button>
            <button
              type="button"
              onClick={() => setDisplayAsTiles(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium border transition-colors"
              style={{
                borderColor: !displayAsTiles ? "var(--accent)" : "var(--border)",
                backgroundColor: !displayAsTiles ? "var(--accent-light)" : "var(--bg-primary)",
                color: !displayAsTiles ? "var(--accent)" : "var(--text-primary)",
              }}
            >
              Нет
            </button>
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Компактные карточки в сетке и постраничная листалка внутри группы (удобно для длинных подборок).
          </p>
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Карточек плитки на одной «странице»
          </label>
          <input
            type="number"
            min={1}
            max={48}
            value={tilesPerPage}
            onChange={(e) => setTilesPerPage(Math.max(1, Math.min(48, parseInt(e.target.value, 10) || 4)))}
            disabled={!displayAsTiles}
            className="w-full max-w-[120px] px-4 py-3 rounded-xl border transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            По умолчанию 4: на экране показывается не больше этого числа позиций, далее — кнопки «Назад» / «Вперёд».
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)",
              color: "#ffffff",
            }}
          >
            {loading ? "Сохранение…" : isEdit ? "Сохранить" : "Добавить"}
          </button>
          <Link
            to={c.basePath}
            className="px-6 py-3 rounded-xl font-medium transition-all inline-flex items-center gap-2"
            style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            Отмена
          </Link>
        </div>
      </form>
    </div>
  );
}
