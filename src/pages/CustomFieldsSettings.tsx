import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CustomFieldItem } from "../api";

type FieldType = "string" | "string_multi" | "select" | "multi_select" | "checkbox" | "reference";

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "string", label: "Текст (несколько строк)" },
  { value: "string_multi", label: "Строка (множественные значения)" },
  { value: "select", label: "Список" },
  { value: "multi_select", label: "Многострочный текст (свободный ввод)" },
  { value: "checkbox", label: "Чекбокс" },
  { value: "reference", label: "Справочник" },
];

export default function CustomFieldsSettings() {
  const [fields, setFields] = useState<CustomFieldItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("string");
  const [isRequired, setIsRequired] = useState(false);
  const [showInWarehouse, setShowInWarehouse] = useState(true);
  const [showInRx, setShowInRx] = useState(true);
  const [showInMkl, setShowInMkl] = useState(true);
  const [newOptionByField, setNewOptionByField] = useState<Record<number, string>>({});
  const [reordering, setReordering] = useState(false);
  const [editingType, setEditingType] = useState<Record<number, FieldType>>({});
  const [savingType, setSavingType] = useState<Record<number, boolean>>({});

  const load = () => {
    setLoading(true);
    setError("");
    api.ref.customFields
      .listAll()
      .then(setFields)
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const fieldsSorted = useMemo(() => [...fields].sort((a, b) => a.sort_index - b.sort_index || a.id - b.id), [fields]);

  const createField = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.ref.customFields.create({
        label: label.trim(),
        field_type: fieldType,
        is_required: isRequired,
        show_in_warehouse: showInWarehouse,
        show_in_rx: showInRx,
        show_in_mkl: showInMkl,
      });
      setLabel("");
      setFieldType("string");
      setIsRequired(false);
      setShowInWarehouse(true);
      setShowInRx(true);
      setShowInMkl(true);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const addOption = async (fieldId: number) => {
    const raw = (newOptionByField[fieldId] || "");
    const field = fields.find((f) => f.id === fieldId);
    const values =
      field?.field_type === "string_multi"
        ? raw
            .split(/\r?\n/g)
            .map((x) => x.trim())
            .filter(Boolean)
        : [raw.trim()].filter(Boolean);
    if (values.length === 0) return;
    try {
      if (values.length === 1) {
        await api.ref.customFields.addOption(fieldId, { value: values[0]! });
      } else {
        for (const v of values) {
          // intentionally sequential to keep order predictable
          await api.ref.customFields.addOption(fieldId, { value: v });
        }
      }
      setNewOptionByField((prev) => ({ ...prev, [fieldId]: "" }));
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const saveFieldType = async (field: CustomFieldItem) => {
    const nextType = (editingType[field.id] || field.field_type) as FieldType;
    if (nextType === field.field_type) return;
    const ok = window.confirm(
      `Изменить тип поля «${field.label}» на «${FIELD_TYPES.find((t) => t.value === nextType)?.label ?? nextType}»?`
    );
    if (!ok) return;
    setSavingType((p) => ({ ...p, [field.id]: true }));
    try {
      await api.ref.customFields.update(field.id, { field_type: nextType as any });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
      load();
    } finally {
      setSavingType((p) => ({ ...p, [field.id]: false }));
    }
  };

  const updateVisibility = async (
    field: CustomFieldItem,
    patch: Partial<Pick<CustomFieldItem, "show_in_warehouse" | "show_in_rx" | "show_in_mkl">>
  ) => {
    try {
      await api.ref.customFields.update(field.id, patch);
      setFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, ...patch } : f)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка обновления видимости");
      load();
    }
  };

  const moveField = async (fieldId: number, direction: "up" | "down") => {
    if (reordering) return;
    const ordered = [...fieldsSorted];
    const currentIndex = ordered.findIndex((f) => f.id === fieldId);
    if (currentIndex < 0) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;

    const swapped = [...ordered];
    const tmp = swapped[currentIndex];
    swapped[currentIndex] = swapped[targetIndex];
    swapped[targetIndex] = tmp;

    const optimistic = swapped.map((f, i) => ({ ...f, sort_index: (i + 1) * 10 }));
    setFields(optimistic);
    setReordering(true);
    try {
      await Promise.all(
        optimistic.map((f, i) =>
          api.ref.customFields.update(f.id, { sort_index: (i + 1) * 10 })
        )
      );
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка сортировки");
      load();
    } finally {
      setReordering(false);
    }
  };

  return (
    <div className="max-w-5xl animate-slide-in space-y-6">
      <div>
        <Link to="/settings" className="inline-flex items-center gap-2 text-sm font-medium mb-3 hover:opacity-80" style={{ color: "var(--text-secondary)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Настройки
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Дополнительные поля товаров</h1>
      </div>

      <section
        className="rounded-xl p-4 sm:p-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_auto]"
        style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
      >
        <div className="sm:col-span-2 xl:col-span-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Добавить поле
          </h2>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Укажите название и тип. Для типа «Многострочный текст» можно (по желанию) задать список подпунктов — тогда в карточке прайса можно выбрать нужные подпункты и заполнить текст для каждого.
          </p>
        </div>
        <form onSubmit={createField} className="contents">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Название поля"
            className="min-w-0 px-3 py-2.5 rounded-lg text-sm w-full"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            required
          />
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as FieldType)}
            className="min-w-0 px-3 py-2.5 rounded-lg text-sm w-full"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <label
            className="inline-flex items-center gap-2 text-sm sm:justify-center px-1 py-2 xl:py-0 xl:items-center"
            style={{ color: "var(--text-primary)" }}
          >
            <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
            Обязательное
          </label>
          <div className="sm:col-span-2 xl:col-span-3 flex flex-wrap items-center gap-4 text-sm" style={{ color: "var(--text-primary)" }}>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={showInWarehouse} onChange={(e) => setShowInWarehouse(e.target.checked)} />Склад</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={showInRx} onChange={(e) => setShowInRx(e.target.checked)} />RX</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={showInMkl} onChange={(e) => setShowInMkl(e.target.checked)} />MKL</label>
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white w-full sm:w-auto xl:w-auto shrink-0"
            style={{ background: "var(--accent)" }}
          >
            Создать поле
          </button>
        </form>
      </section>

      {loading ? <div style={{ color: "var(--text-secondary)" }}>Загрузка...</div> : error ? <div style={{ color: "var(--error)" }}>{error}</div> : (
        <div className="space-y-3">
          {fieldsSorted.map((field) => (
            <div key={field.id} className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{field.label}</div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {field.code} · {FIELD_TYPES.find((t) => t.value === field.field_type)?.label} · Порядок: {field.sort_index}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    Видимость: {field.show_in_warehouse ? "Склад" : ""}{field.show_in_warehouse && (field.show_in_rx || field.show_in_mkl) ? ", " : ""}{field.show_in_rx ? "RX" : ""}{field.show_in_rx && field.show_in_mkl ? ", " : ""}{field.show_in_mkl ? "MKL" : ""}{!field.show_in_warehouse && !field.show_in_rx && !field.show_in_mkl ? "скрыто везде" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={reordering}
                    onClick={() => moveField(field.id, "up")}
                    className="px-2.5 py-1.5 rounded text-sm disabled:opacity-50"
                    style={{ color: "var(--text-primary)", background: "var(--bg-secondary)" }}
                    title="Выше"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={reordering}
                    onClick={() => moveField(field.id, "down")}
                    className="px-2.5 py-1.5 rounded text-sm disabled:opacity-50"
                    style={{ color: "var(--text-primary)", background: "var(--bg-secondary)" }}
                    title="Ниже"
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => { if (confirm("Удалить поле?")) api.ref.customFields.delete(field.id).then(load); }} className="px-3 py-1.5 rounded text-sm" style={{ color: "var(--error)" }}>
                    Удалить
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={field.show_in_warehouse !== false}
                    onChange={(e) => void updateVisibility(field, { show_in_warehouse: e.target.checked })}
                  />
                  Склад
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={field.show_in_rx !== false}
                    onChange={(e) => void updateVisibility(field, { show_in_rx: e.target.checked })}
                  />
                  RX
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={field.show_in_mkl !== false}
                    onChange={(e) => void updateVisibility(field, { show_in_mkl: e.target.checked })}
                  />
                  MKL
                </label>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    Тип поля
                  </label>
                  <select
                    value={(editingType[field.id] || (field.field_type as FieldType)) as any}
                    onChange={(e) => setEditingType((p) => ({ ...p, [field.id]: e.target.value as FieldType }))}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => void saveFieldType(field)}
                  disabled={Boolean(savingType[field.id])}
                  className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                >
                  {savingType[field.id] ? "Сохранение…" : "Сохранить тип"}
                </button>
                <div className="text-[11px] leading-snug max-w-prose" style={{ color: "var(--text-tertiary)" }}>
                  Если хотите задавать варианты здесь, выберите тип «Список».
                </div>
              </div>
              {field.field_type === "multi_select" && (
                <p className="text-xs leading-relaxed max-w-prose" style={{ color: "var(--text-tertiary)" }}>
                  Для этого поля можно задать подпункты (ниже) — тогда в карточке товара в прайсе появится выбор подпунктов и отдельное многострочное поле для текста по каждому выбранному подпункту.
                </p>
              )}
              {(field.field_type === "select" || field.field_type === "reference" || field.field_type === "multi_select" || field.field_type === "string_multi") && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {(field.options || []).map((opt) => (
                      <span key={opt.id} className="inline-flex items-center gap-2 px-2 py-1 rounded-lg text-xs" style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}>
                        <span className="whitespace-pre-wrap break-words">{opt.value}</span>
                        <button type="button" onClick={() => api.ref.customFields.deleteOption(field.id, opt.id).then(load)} style={{ color: "var(--error)" }}>×</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {(field.field_type === "multi_select" || field.field_type === "string_multi") ? (
                      <textarea
                        value={newOptionByField[field.id] || ""}
                        onChange={(e) => setNewOptionByField((prev) => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder={field.field_type === "string_multi" ? "Добавить вариант (можно много строк)" : "Добавить подпункт (можно многострочный текст)"}
                        className="px-3 py-2 rounded-lg text-sm flex-1 min-w-0"
                        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)", resize: "vertical" }}
                        rows={3}
                      />
                    ) : (
                      <input
                        value={newOptionByField[field.id] || ""}
                        onChange={(e) => setNewOptionByField((prev) => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder={field.field_type === "reference" ? "Добавить значение справочника" : "Добавить вариант списка"}
                        className="px-3 py-2 rounded-lg text-sm flex-1 min-w-0"
                        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                      />
                    )}
                    <button type="button" onClick={() => addOption(field.id)} className="px-3 py-2 rounded-lg text-sm text-white" style={{ background: "var(--accent)" }}>
                      Добавить
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
