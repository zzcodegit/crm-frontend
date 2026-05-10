import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { api } from "../api";
import { pricelistBasePathFromPathname } from "../utils/pricelistRoutes";
import PricelistRxDescriptionEditor from "../components/PricelistRxDescriptionEditor";
import { parsePriceFromText, priceFromFromText, formatPriceInputValue } from "../utils/pricelistPrice";
import type { ManufacturerItem, FeatureItem, CustomFieldItem } from "../api";

function strToRows(s: string | null | undefined): string[] {
  if (!s || !s.trim()) return [""];
  const parts = s.split(/,\s*/).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : [""];
}

type LensParamRow = {
  sph: string;
  cyl: string;
  step: string;
  diameters: string;
  replacementMode: string;
  baseCurve: string;
};

/**
 * Вставка табличных данных из буфера:
 * SPH<TAB>CYL<TAB>Шаг<TAB>Диаметры/влагосодерж.<TAB>Режим замены<TAB>ВС
 */
function parseLensRowsFromClipboard(text: string): LensParamRow[] {
  if (!text.trim()) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cols = line.includes("\t")
        ? line.split("\t")
        : line.split(/\s{2,}|;|\|/);
      return {
        sph: (cols[0] ?? "").trim(),
        cyl: (cols[1] ?? "").trim(),
        step: (cols[2] ?? "").trim(),
        diameters: (cols[3] ?? "").trim(),
        replacementMode: (cols[4] ?? "").trim(),
        baseCurve: (cols[5] ?? "").trim(),
      };
    })
    .filter((r) => r.sph || r.cyl || r.step || r.diameters || r.replacementMode || r.baseCurve);
}

/** Собирает строки формы из четырёх полей API (списки через запятую), выравнивая по максимальной длине. */
function zipLensRowsFromApi(
  sph?: string | null,
  cyl?: string | null,
  step?: string | null,
  diameters?: string | null,
  material?: string | null,
  coefficient?: string | null
): LensParamRow[] {
  const A = strToRows(sph ?? "");
  const B = strToRows(cyl ?? "");
  const C = strToRows(step ?? "");
  const D = strToRows(diameters ?? "");
  const E = strToRows(material ?? "");
  const F = strToRows(coefficient ?? "");
  const n = Math.max(A.length, B.length, C.length, D.length, E.length, F.length, 1);
  return Array.from({ length: n }, (_, i) => ({
    sph: A[i] ?? "",
    cyl: B[i] ?? "",
    step: C[i] ?? "",
    diameters: D[i] ?? "",
    replacementMode: E[i] ?? "",
    baseCurve: F[i] ?? "",
  }));
}

function LensParamsEditor({
  rows,
  onChange,
  inputStyle,
  isMkl = false,
}: {
  rows: LensParamRow[];
  onChange: (rows: LensParamRow[]) => void;
  inputStyle: React.CSSProperties;
  isMkl?: boolean;
}) {
  const [pasteStatus, setPasteStatus] = useState<string>("");
  const setField = (index: number, field: keyof LensParamRow, value: string) => {
    const next = rows.map((r, i) => (i === index ? { ...r, [field]: value } : r));
    onChange(next);
  };
  const addRow = () =>
    onChange([...rows, { sph: "", cyl: "", step: "", diameters: "", replacementMode: "", baseCurve: "" }]);
  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    if (next.length === 0) {
      onChange([{ sph: "", cyl: "", step: "", diameters: "", replacementMode: "", baseCurve: "" }]);
      return;
    }
    onChange(next);
  };
  const list =
    rows.length === 0 ? [{ sph: "", cyl: "", step: "", diameters: "", replacementMode: "", baseCurve: "" }] : rows;
  const canRemove = true;

  const fieldClass = "flex-1 min-w-[7rem] px-3 py-2 rounded-xl text-sm outline-none";

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parseLensRowsFromClipboard(text);
      if (parsed.length === 0) {
        setPasteStatus("В буфере нет строк с параметрами.");
        return;
      }
      const hasOnlyOneEmptyRow =
        list.length === 1 &&
        !list[0]?.sph.trim() &&
        !list[0]?.cyl.trim() &&
        !list[0]?.step.trim() &&
        !list[0]?.diameters.trim() &&
        !list[0]?.replacementMode.trim() &&
        !list[0]?.baseCurve.trim();
      const next = hasOnlyOneEmptyRow ? parsed : [...list, ...parsed];
      onChange(next);
      setPasteStatus(`Добавлено строк: ${parsed.length}.`);
    } catch {
      setPasteStatus("Не удалось прочитать буфер. Разрешите доступ к буферу обмена и попробуйте снова.");
    }
  };

  return (
    <div
      className="w-full rounded-2xl p-4"
      style={{
        background: "var(--bg-primary)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-elevated)",
      }}
    >
      <div className="overflow-x-auto w-full">
        <div className="w-full space-y-2">
          <div
            className="grid gap-2 items-center text-xs font-medium"
            style={{
              color: "var(--text-secondary)",
              gridTemplateColumns: isMkl
                ? "minmax(5rem,1fr) minmax(5rem,1fr) minmax(4.5rem,0.75fr) minmax(5rem,1fr) minmax(7rem,1fr) minmax(5rem,0.8fr) auto"
                : "minmax(5rem,1fr) minmax(5rem,1fr) minmax(4.5rem,0.75fr) minmax(5rem,1fr) auto",
            }}
          >
            <span>SPH</span>
            <span>CYL</span>
            <span>Шаг</span>
            <span>{isMkl ? "Матриал/Влаг" : "Диаметры, мм"}</span>
            {isMkl ? <span>Режим замены</span> : null}
            {isMkl ? <span>ВС</span> : null}
            <span className="w-8 shrink-0" aria-hidden />
          </div>
          {list.map((row, i) => (
            <div
              key={i}
              className="grid gap-2 items-center"
              style={{
                gridTemplateColumns: isMkl
                  ? "minmax(5rem,1fr) minmax(5rem,1fr) minmax(4.5rem,0.75fr) minmax(5rem,1fr) minmax(7rem,1fr) minmax(5rem,0.8fr) auto"
                  : "minmax(5rem,1fr) minmax(5rem,1fr) minmax(4.5rem,0.75fr) minmax(5rem,1fr) auto",
              }}
            >
              <input
                type="text"
                value={row.sph}
                onChange={(e) => setField(i, "sph", e.target.value)}
                className={fieldClass}
                style={inputStyle}
                placeholder="−6.00 … +4.00 D"
                aria-label={`SPH, строка ${i + 1}`}
              />
              <input
                type="text"
                value={row.cyl}
                onChange={(e) => setField(i, "cyl", e.target.value)}
                className={fieldClass}
                style={inputStyle}
                placeholder="−0.25 … −4.00 D"
                aria-label={`CYL, строка ${i + 1}`}
              />
              <input
                type="text"
                value={row.step}
                onChange={(e) => setField(i, "step", e.target.value)}
                className={fieldClass}
                style={inputStyle}
                placeholder="0.25"
                aria-label={`Шаг, строка ${i + 1}`}
              />
              <input
                type="text"
                value={row.diameters}
                onChange={(e) => setField(i, "diameters", e.target.value)}
                className={fieldClass}
                style={inputStyle}
                placeholder={isMkl ? "Например: 38%" : "65 или 65 мм"}
                aria-label={`${isMkl ? "Матриал/Влаг" : "Диаметры"}, строка ${i + 1}`}
              />
              {isMkl ? (
                <input
                  type="text"
                  value={row.replacementMode}
                  onChange={(e) => setField(i, "replacementMode", e.target.value)}
                  className={fieldClass}
                  style={inputStyle}
                  placeholder="1 день / 2 недели / 1 месяц"
                  aria-label={`Режим замены, строка ${i + 1}`}
                />
              ) : null}
              {isMkl ? (
                <input
                  type="text"
                  value={row.baseCurve}
                  onChange={(e) => setField(i, "baseCurve", e.target.value)}
                  className={fieldClass}
                  style={inputStyle}
                  placeholder="8.6"
                  aria-label={`ВС, строка ${i + 1}`}
                />
              ) : null}
              {canRemove ? (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="w-8 h-10 shrink-0 rounded-xl text-sm flex items-center justify-center self-center"
                  style={{ color: "var(--text-secondary)" }}
                  title="Удалить строку"
                  aria-label={`Удалить строку ${i + 1}`}
                >
                  −
                </button>
              ) : (
                <span className="w-8 shrink-0" aria-hidden />
              )}
            </div>
          ))}
          <button type="button" onClick={addRow} className="text-sm pt-1" style={{ color: "var(--accent)" }}>
            + Добавить строку
          </button>
          <button type="button" onClick={() => void handlePasteFromClipboard()} className="text-sm pt-1 ml-4" style={{ color: "var(--accent)" }}>
            Вставить из буфера
          </button>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Формат строки: SPH, CYL, Шаг, {isMkl ? "Матриал/Влаг, Режим замены, ВС" : "Диаметры"} (через TAB). Пример: -6.00 до +2.00[TAB]-[TAB]0.25[TAB]{isMkl ? "38%[TAB]1 месяц[TAB]8.6" : "70"}
          </p>
          {pasteStatus ? (
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {pasteStatus}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Поле «Многострочный текст (свободный ввод)»: в БД — массив блоков; раньше могла быть одна строка. */
function normalizeMultiSelectBlocks(v: unknown): string[] {
  if (v == null) return [""];
  if (Array.isArray(v)) {
    const a = v.map((x) => String(x));
    return a.length > 0 ? a : [""];
  }
  return [String(v)];
}


type BarcodeRow = { code: string; price: string; description: string };

type BarcodeGroupState = { id: string; name: string; rows: BarcodeRow[] };

const newBarcodeGroupId = () => `bg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

type MultiSelectTemplateEntry = { id: number; text: string };

function tryParseMultiSelectTemplateEntry(s: string): MultiSelectTemplateEntry | null {
  const v = (s || "").trim();
  if (!v.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(v) as { id?: unknown; text?: unknown };
    const id = typeof parsed.id === "number" ? parsed.id : Number.NaN;
    const text = typeof parsed.text === "string" ? parsed.text : "";
    if (!Number.isFinite(id) || id <= 0) return null;
    return { id, text };
  } catch {
    return null;
  }
}

function encodeMultiSelectTemplateEntry(id: number, text: string): string {
  return JSON.stringify({ id, text });
}

function splitMultiSelectValue(raw: unknown): {
  templates: Record<number, string>;
  freeBlocks: string[];
  rawBlocks: string[];
} {
  const rawBlocks = normalizeMultiSelectBlocks(raw);
  const templates: Record<number, string> = {};
  const freeBlocks: string[] = [];
  rawBlocks.forEach((b) => {
    const parsed = tryParseMultiSelectTemplateEntry(String(b));
    if (parsed) templates[parsed.id] = parsed.text ?? "";
    else freeBlocks.push(String(b));
  });
  return { templates, freeBlocks, rawBlocks };
}

function extractRequestErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = String(err.message || "").trim();
    if (msg) return msg;
  }
  if (err && typeof err === "object") {
    const withDetail = err as { detail?: unknown; message?: unknown };
    if (typeof withDetail.detail === "string" && withDetail.detail.trim()) {
      return withDetail.detail.trim();
    }
    if (Array.isArray(withDetail.detail) && withDetail.detail.length > 0) {
      return withDetail.detail
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) {
            const msg = (item as { msg?: unknown }).msg;
            if (typeof msg === "string" && msg.trim()) return msg.trim();
          }
          return String(item);
        })
        .filter(Boolean)
        .join("; ");
    }
    if (typeof withDetail.message === "string" && withDetail.message.trim()) {
      return withDetail.message.trim();
    }
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") return json;
    } catch {
      // ignore JSON stringify failure
    }
  }
  return "Неизвестная ошибка запроса";
}

function BarcodeRows({
  rows,
  onChange,
  inputStyle,
  showLabel = true,
}: {
  rows: BarcodeRow[];
  onChange: (rows: BarcodeRow[]) => void;
  inputStyle: React.CSSProperties;
  showLabel?: boolean;
}) {
  const setRow = (index: number, field: keyof BarcodeRow, value: string) => {
    const next = rows.map((r, i) => (i === index ? { ...r, [field]: value } : r));
    onChange(next);
  };
  const addRow = () => onChange([...rows, { code: "", price: "", description: "" }]);
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));
  const list = rows.length === 0 ? [{ code: "", price: "", description: "" }] : rows;
  return (
    <div>
      {showLabel ? (
        <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
          Штрихкоды
        </label>
      ) : null}
      <div className="space-y-3">
        {list.map((row, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[140px]">
              <span className="block text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>Штрихкод</span>
              <input
                type="text"
                value={row.code}
                onChange={(e) => setRow(i, "code", e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none min-w-0"
                style={inputStyle}
                placeholder="Код штрихкода"
              />
            </div>
            <div className="w-28">
              <span className="block text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>Цена (₽)</span>
              <input
                type="text"
                inputMode="decimal"
                value={row.price}
                onChange={(e) => setRow(i, "price", e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none min-w-0"
                style={inputStyle}
                placeholder="—"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <span className="block text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>Описание</span>
              <input
                type="text"
                value={row.description}
                onChange={(e) => setRow(i, "description", e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none min-w-0"
                style={inputStyle}
                placeholder="Описание"
              />
            </div>
            {(list.length > 1 || (list[0]?.code || list[0]?.price || list[0]?.description)) && (
              <button type="button" onClick={() => removeRow(i)} className="px-2 py-2 rounded-xl text-sm shrink-0" style={{ color: "var(--text-secondary)" }} title="Удалить">−</button>
            )}
          </div>
        ))}
        <button type="button" onClick={addRow} className="text-sm" style={{ color: "var(--accent)" }}>+ Добавить штрихкод</button>
      </div>
    </div>
  );
}

function BarcodeGroupsEditor({
  groups,
  onChange,
  inputStyle,
}: {
  groups: BarcodeGroupState[];
  onChange: (groups: BarcodeGroupState[]) => void;
  inputStyle: React.CSSProperties;
}) {
  const updateGroupName = (gid: string, name: string) => {
    onChange(groups.map((g) => (g.id === gid ? { ...g, name } : g)));
  };
  const setRows = (gid: string, rows: BarcodeRow[]) => {
    onChange(groups.map((g) => (g.id === gid ? { ...g, rows } : g)));
  };
  const addGroup = () => {
    onChange([...groups, { id: newBarcodeGroupId(), name: "", rows: [{ code: "", price: "", description: "" }] }]);
  };
  const removeGroup = (gid: string) => {
    if (groups.length <= 1) return;
    onChange(groups.filter((g) => g.id !== gid));
  };
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
          Штрихкоды
        </label>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
          Один общий список или несколько групп с названиями. Пустое название — без заголовка на карточке.
        </p>
      </div>
      {groups.map((g, idx) => (
        <div
          key={g.id}
          className="rounded-xl p-4 space-y-3"
          style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)" }}
        >
          <div className="flex flex-wrap items-end gap-2 justify-between">
            <div className="flex-1 min-w-[200px]">
              <span className="block text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>
                Название группы
              </span>
              <input
                type="text"
                value={g.name}
                onChange={(e) => updateGroupName(g.id, e.target.value)}
                placeholder={groups.length > 1 ? `Например: группа ${idx + 1}` : "Необязательно"}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none min-w-0"
                style={inputStyle}
              />
            </div>
            {groups.length > 1 && (
              <button
                type="button"
                onClick={() => removeGroup(g.id)}
                className="text-sm px-3 py-2 rounded-xl shrink-0"
                style={{ color: "var(--error)" }}
              >
                Удалить группу
              </button>
            )}
          </div>
          <BarcodeRows rows={g.rows} onChange={(rows) => setRows(g.id, rows)} inputStyle={inputStyle} showLabel={false} />
        </div>
      ))}
      <button type="button" onClick={addGroup} className="text-sm font-medium" style={{ color: "var(--accent)" }}>
        + Добавить группу
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider pb-2" style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>{title}</h2>
      {children}
    </section>
  );
}

export default function PricelistCreate({ editId }: { editId?: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = pricelistBasePathFromPathname(location.pathname);
  const catalog = basePath === "/pricelist-rx" ? "rx" : basePath === "/pricelist-mkl" ? "mkl" : "warehouse";
  const plApi = catalog === "rx" ? api.pricelistRx : catalog === "mkl" ? api.pricelistMkl : api.pricelist;
  const plRef = catalog === "rx" ? api.ref.pricelistRx : catalog === "mkl" ? api.ref.pricelistMkl : api.ref.pricelist;
  const plGroups =
    catalog === "rx" ? api.ref.pricelistRxGroups : catalog === "mkl" ? api.ref.pricelistMklGroups : api.ref.pricelistGroups;
  const isEdit = editId != null && Number.isInteger(editId);
  const [manufacturers, setManufacturers] = useState<ManufacturerItem[]>([]);
  const [features, setFeatures] = useState<FeatureItem[]>([]);
  const [manufacturerId, setManufacturerId] = useState<number | "">("");
  const [lensName, setLensName] = useState("");
  const [description, setDescription] = useState("");
  const [fullDescription, setFullDescription] = useState("");
  const [barcodeGroups, setBarcodeGroups] = useState<BarcodeGroupState[]>([
    { id: newBarcodeGroupId(), name: "", rows: [{ code: "", price: "", description: "" }] },
  ]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lensParamRows, setLensParamRows] = useState<LensParamRow[]>([
    { sph: "", cyl: "", step: "", diameters: "", replacementMode: "", baseCurve: "" },
  ]);
  const [price, setPrice] = useState<string>("");
  const [priceFromChecked, setPriceFromChecked] = useState(false);
  const [priceToChecked, setPriceToChecked] = useState(false);
  const [sortIndex, setSortIndex] = useState<number>(500);
  const [isPromo, setIsPromo] = useState(false);
  const [uvProtection, setUvProtection] = useState(false);
  const [hideDetailLink, setHideDetailLink] = useState(false);
  const [hidePhoto, setHidePhoto] = useState(false);
  const [enableTranspositionCalc, setEnableTranspositionCalc] = useState(false);
  const [adminOnly, setAdminOnly] = useState(false);
  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const [publishAt, setPublishAt] = useState("");
  const [material, setMaterial] = useState("");
  const [lensId, setLensId] = useState<string>("");
  const [groupsList, setGroupsList] = useState<{ id: number; name: string }[]>([]);
  const [group, setGroup] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [coefficientsList, setCoefficientsList] = useState<{ id: number; name: string }[]>([]);
  const [coefficient, setCoefficient] = useState("");
  const [newCoefficientName, setNewCoefficientName] = useState("");
  const [addingCoefficient, setAddingCoefficient] = useState(false);
  const [featureIds, setFeatureIds] = useState<number[]>([]);
  const [featureColors, setFeatureColors] = useState<Record<number, string[]>>({});
  const [featureSearch, setFeatureSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [customFields, setCustomFields] = useState<CustomFieldItem[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string | string[] | boolean | null>>({});
  const customFieldsSorted = useMemo(
    () => [...customFields].sort((a, b) => a.sort_index - b.sort_index || a.id - b.id),
    [customFields]
  );

  /** Особенности, для которых после выбора нужно выбрать цвет */
  const FEATURES_REQUIRING_COLOR = ["Фотохромные линзы (хамелеоны)", "Цвет остаточного рефлекса линзы"];
  const featureRequiresColor = (name: string) => FEATURES_REQUIRING_COLOR.some((n) => name.includes(n) || n.includes(name));
  const [colorsRef, setColorsRef] = useState<{ id: number; name: string }[]>([]);
  const colorOptions = colorsRef.length > 0 ? colorsRef.map((c) => c.name) : ["Серый", "Коричневый", "Зелёный", "Синий", "Розовый", "Жёлтый", "Оранжевый", "Фиолетовый", "Чёрный", "Другой"];
  const [loadingRefs, setLoadingRefs] = useState(true);

  const filteredFeatures = features.filter((f) =>
    f.name.toLowerCase().includes(featureSearch.toLowerCase().trim())
  );

  useEffect(() => {
    const loadRefs = () =>
      Promise.all([
        api.ref.manufacturers.list(),
        api.ref.features.list(),
        api.ref.coefficients.list(),
        plGroups.list(),
        api.ref.colors.list(),
        api.ref.customFields.list(),
      ]).then(([m, f, c, g, colors, cFields]) => {
        setManufacturers(m);
        setFeatures(f);
        setCoefficientsList(c);
        setGroupsList(g);
        setColorsRef(colors);
        const cFieldsActive = cFields.filter((x) => {
          if (!x.is_active) return false;
          if (catalog === "rx") return x.show_in_rx !== false;
          if (catalog === "mkl") return x.show_in_mkl !== false;
          return x.show_in_warehouse !== false;
        });
        setCustomFields(cFieldsActive);
        if (!isEdit) {
          if (m.length > 0 && manufacturerId === "") setManufacturerId(m[0].id);
          if (c.length > 0) setCoefficient((prev) => prev || c[0].name);
          if (g.length > 0) setGroup((prev) => prev || g[0].name);
        }
        return { cFieldsActive };
      });

    if (isEdit && editId) {
      Promise.all([loadRefs(), plApi.get(editId)])
        .then(([refs, item]) => {
          setManufacturerId(item.manufacturer_id ?? "");
          setLensName(item.lens_name);
          setDescription(item.description ?? "");
          setFullDescription(item.full_description ?? "");
          if (item.barcode_sections && item.barcode_sections.length > 0) {
            setBarcodeGroups(
              item.barcode_sections.map((sec) => ({
                id: newBarcodeGroupId(),
                name: sec.name ?? "",
                rows:
                  sec.items && sec.items.length > 0
                    ? sec.items.map((b) => ({
                        code: typeof b === "string" ? b : b.code,
                        price: typeof b === "object" && b != null && "price" in b && b.price != null ? String(b.price) : "",
                        description: typeof b === "object" && b != null && b.description ? String(b.description) : "",
                      }))
                    : [{ code: "", price: "", description: "" }],
              }))
            );
          } else {
            setBarcodeGroups([
              {
                id: newBarcodeGroupId(),
                name: "",
                rows:
                  item.barcodes && item.barcodes.length
                    ? item.barcodes.map((b) => ({
                        code: typeof b === "string" ? b : b.code,
                        price: typeof b === "object" && b != null && "price" in b && b.price != null ? String(b.price) : "",
                        description: typeof b === "object" && b != null && b.description ? String(b.description) : "",
                      }))
                    : item.barcode
                      ? [{ code: item.barcode, price: "", description: "" }]
                      : [{ code: "", price: "", description: "" }],
              },
            ]);
          }
          setPhotoUrls((item.photo_urls && item.photo_urls.length) ? item.photo_urls : (item.photo_url ? [item.photo_url] : []));
          setLensParamRows(
            zipLensRowsFromApi(
              item.sph,
              item.cyl,
              item.step,
              item.diameters,
              catalog === "mkl" ? item.material : undefined,
              catalog === "mkl" ? item.coefficient : undefined
            )
          );
          setPrice(formatPriceInputValue(Number(item.price), item.price_from ?? false));
          setPriceFromChecked(Boolean(item.price_from));
          setPriceToChecked(false);
          setSortIndex(item.sort_index ?? 500);
          setIsPromo(item.is_promo ?? false);
          setUvProtection(item.uv_protection ?? false);
          setHideDetailLink(item.hide_detail_link ?? false);
          setHidePhoto(item.hide_photo ?? false);
          setEnableTranspositionCalc(item.enable_transposition_calc ?? false);
          setAdminOnly(item.admin_only ?? false);
          setMaterial(item.material ?? "");
          setLensId(item.lens_id != null ? String(item.lens_id) : "");
          setGroup(item.group);
          setCoefficient(item.coefficient ?? "");
          setFeatureIds(item.feature_ids ?? []);
          {
            const cv: Record<string, string | string[] | boolean | null> = { ...(item.custom_values ?? {}) };
            for (const field of refs.cFieldsActive) {
              if (field.field_type === "multi_select") {
                cv[field.code] = normalizeMultiSelectBlocks(cv[field.code]);
              }
            }
            setCustomValues(cv);
          }
          const fc: Record<number, string[]> = {};
          if (item.feature_colors && typeof item.feature_colors === "object") {
            for (const [k, v] of Object.entries(item.feature_colors)) {
              const id = parseInt(k, 10);
              if (Number.isNaN(id)) continue;
              const arr = Array.isArray(v) ? v : (v ? [String(v)] : []);
              const colors = arr.filter((c) => c && String(c).trim()).map((c) => String(c).trim());
              if (colors.length) fc[id] = colors;
            }
          }
          setFeatureColors(fc);
        })
        .catch(() => {})
        .finally(() => setLoadingRefs(false));
    } else {
      loadRefs().catch(() => {}).finally(() => setLoadingRefs(false));
    }
  }, [isEdit, editId, catalog]);

  const handleAddGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setAddingGroup(true);
    try {
      const created = await plGroups.create({ name });
      setGroupsList((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setGroup(created.name);
      setNewGroupName("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка добавления");
    } finally {
      setAddingGroup(false);
    }
  };

  const handleAddCoefficient = async () => {
    const name = newCoefficientName.trim();
    if (!name) return;
    setAddingCoefficient(true);
    try {
      const created = await api.ref.coefficients.create({ name });
      setCoefficientsList((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCoefficient(created.name);
      setNewCoefficientName("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка добавления");
    } finally {
      setAddingCoefficient(false);
    }
  };

  const toggleFeature = (id: number) => {
    const feature = features.find((x) => x.id === id);
    const requiresColor = feature && featureRequiresColor(feature.name);
    setFeatureIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (!next.includes(id)) {
        setFeatureColors((fc) => {
          const nextFc = { ...fc };
          delete nextFc[id];
          return nextFc;
        });
      } else if (requiresColor && feature) {
        const opts = (feature.colors && feature.colors.length > 0 ? feature.colors : colorOptions).filter(Boolean);
        if (opts[0] && !(featureColors[id]?.length)) setFeatureColors((fc) => ({ ...fc, [id]: [opts[0]!] }));
      }
      return next;
    });
  };

  const addFeatureColor = (featureId: number, color: string) => {
    if (!color.trim()) return;
    setFeatureColors((prev) => ({ ...prev, [featureId]: [...(prev[featureId] ?? []), color.trim()] }));
  };
  const removeFeatureColor = (featureId: number, index: number) => {
    setFeatureColors((prev) => {
      const list = prev[featureId] ?? [];
      const next = list.filter((_, i) => i !== index);
      if (next.length === 0) {
        const { [featureId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [featureId]: next };
    });
  };
  const setFeatureColorAt = (featureId: number, index: number, color: string) => {
    setFeatureColors((prev) => {
      const list = [...(prev[featureId] ?? [])];
      if (index >= 0 && index < list.length) list[index] = color;
      return { ...prev, [featureId]: list };
    });
  };

  const uploadPhoto = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload/image", {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Ошибка загрузки");
    }
    const data = await res.json();
    return data.url;
  };

  const handlePhotosAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/svg+xml"];
    const toUpload: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!validTypes.includes(file.type)) {
        alert("Разрешены форматы: JPG, PNG, GIF, WebP, SVG");
        e.target.value = "";
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert("Размер каждого файла не более 5 МБ");
        e.target.value = "";
        return;
      }
      toUpload.push(file);
    }
    e.target.value = "";
    setUploadingPhoto(true);
    try {
      const newUrls: string[] = [];
      for (const file of toUpload) {
        const url = await uploadPhoto(file);
        newUrls.push(url);
      }
      setPhotoUrls((prev) => [...prev, ...newUrls]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка загрузки фото");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = (index: number) => {
    setPhotoUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const updateMultiSelectBlock = (code: string, index: number, value: string) => {
    setCustomValues((prev) => {
      const cur = normalizeMultiSelectBlocks(prev[code]);
      const next = [...cur];
      next[index] = value;
      return { ...prev, [code]: next };
    });
  };

  const addMultiSelectBlock = (code: string) => {
    setCustomValues((prev) => {
      const cur = normalizeMultiSelectBlocks(prev[code]);
      return { ...prev, [code]: [...cur, ""] };
    });
  };

  const removeMultiSelectBlock = (code: string, index: number) => {
    setCustomValues((prev) => {
      const cur = normalizeMultiSelectBlocks(prev[code]);
      if (cur.length <= 1) return { ...prev, [code]: [""] };
      return { ...prev, [code]: cur.filter((_, i) => i !== index) };
    });
  };

  const updateStringMultiRow = (code: string, index: number, value: string) => {
    setCustomValues((prev) => {
      const cur = Array.isArray(prev[code]) ? (prev[code] as unknown[]).map((x) => String(x)) : [];
      const base = cur.length > 0 ? cur : [""];
      const next = [...base];
      next[index] = value;
      return { ...prev, [code]: next };
    });
  };

  const addStringMultiRow = (code: string) => {
    setCustomValues((prev) => {
      const cur = Array.isArray(prev[code]) ? (prev[code] as unknown[]).map((x) => String(x)) : [];
      const base = cur.length > 0 ? cur : [""];
      return { ...prev, [code]: [...base, ""] };
    });
  };

  const removeStringMultiRow = (code: string, index: number) => {
    setCustomValues((prev) => {
      const cur = Array.isArray(prev[code]) ? (prev[code] as unknown[]).map((x) => String(x)) : [];
      const base = cur.length > 0 ? cur : [""];
      if (base.length <= 1) return { ...prev, [code]: [""] };
      return { ...prev, [code]: base.filter((_, i) => i !== index) };
    });
  };

  const toggleMultiSelectTemplate = (code: string, optionId: number) => {
    setCustomValues((prev) => {
      const { templates, freeBlocks } = splitMultiSelectValue(prev[code]);
      const nextTemplates = { ...templates };
      if (nextTemplates[optionId] != null) delete nextTemplates[optionId];
      else nextTemplates[optionId] = "";
      const out = [
        ...Object.entries(nextTemplates).map(([id, text]) => encodeMultiSelectTemplateEntry(Number(id), String(text ?? ""))),
        ...freeBlocks,
      ];
      return { ...prev, [code]: out.length ? out : [""] };
    });
  };

  const updateMultiSelectTemplateText = (code: string, optionId: number, text: string) => {
    setCustomValues((prev) => {
      const { templates, freeBlocks } = splitMultiSelectValue(prev[code]);
      const nextTemplates = { ...templates, [optionId]: text };
      const out = [
        ...Object.entries(nextTemplates).map(([id, t]) => encodeMultiSelectTemplateEntry(Number(id), String(t ?? ""))),
        ...freeBlocks,
      ];
      return { ...prev, [code]: out.length ? out : [""] };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (manufacturerId === "" || !lensName.trim()) {
      alert("Заполните производителя и название линзы");
      return;
    }
    if (!group.trim()) {
      alert("Выберите или добавьте группу");
      return;
    }
    const priceNum = parsePriceFromText(price);
    if (isNaN(priceNum) || priceNum < 0) {
      alert('Введите корректную цену (можно "от 3200")');
      return;
    }
    for (const field of customFieldsSorted) {
      if (!field.is_required) continue;
      if (field.field_type === "multi_select") {
        const { templates, freeBlocks } = splitMultiSelectValue(customValues[field.code]);
        const hasTemplateText = Object.values(templates).some((t) => String(t).trim().length > 0);
        const hasFreeText = freeBlocks.some((b) => b.trim().length > 0);
        if (!hasTemplateText && !hasFreeText) {
          alert(`Заполните поле «${field.label}» (хотя бы один текстовый блок)`);
          return;
        }
      }
      if (field.field_type === "string_multi") {
        const cur = Array.isArray(customValues[field.code]) ? (customValues[field.code] as unknown[]).map((x) => String(x)) : [];
        if (!cur.some((x) => x.trim().length > 0)) {
          alert(`Заполните поле «${field.label}» (хотя бы одно значение)`);
          return;
        }
      }
    }
    const joinRows = (rows: string[]) => rows.map((r) => r.trim()).filter(Boolean).join(", ");
    const mklReplacementModes = joinRows(lensParamRows.map((r) => r.replacementMode));
    const mklBaseCurves = joinRows(lensParamRows.map((r) => r.baseCurve));
    const hasPriceFrom = priceFromChecked || priceToChecked || priceFromFromText(price);
    /** При PATCH пустые значения должны уходить в JSON явно ([],"",null), иначе ключ не в теле запроса и сервер не очищает поле. */
    const payload = {
      manufacturer_id: Number(manufacturerId),
      lens_name: lensName.trim(),
      description: isEdit ? (description.trim() || null) : description.trim() || undefined,
      full_description: isEdit ? (fullDescription.trim() || null) : fullDescription.trim() || undefined,
      barcode_sections: (() => {
        const sections = barcodeGroups
          .map((g) => {
            const items = g.rows
              .filter((r) => r.code.trim())
              .map((r) => {
                const priceNum = r.price.trim() ? parsePriceFromText(r.price) : undefined;
                return {
                  code: r.code.trim(),
                  price: !Number.isNaN(priceNum) ? priceNum : undefined,
                  description: r.description.trim() || undefined,
                };
              });
            return { name: g.name.trim() || null, items };
          })
          .filter((sec) => sec.items.length > 0);
        if (isEdit) return sections;
        return sections.length > 0 ? sections : undefined;
      })(),
      // Важно: при удалении всех фото отправляем пустой список,
      // чтобы backend реально очистил photo_urls/photo_url.
      photo_urls: photoUrls.length ? photoUrls : [],
      sph: isEdit ? joinRows(lensParamRows.map((r) => r.sph)) || "" : joinRows(lensParamRows.map((r) => r.sph)) || undefined,
      cyl: isEdit ? joinRows(lensParamRows.map((r) => r.cyl)) || "" : joinRows(lensParamRows.map((r) => r.cyl)) || undefined,
      step: isEdit ? joinRows(lensParamRows.map((r) => r.step)) || "" : joinRows(lensParamRows.map((r) => r.step)) || undefined,
      diameters: isEdit
        ? joinRows(lensParamRows.map((r) => r.diameters)) || ""
        : joinRows(lensParamRows.map((r) => r.diameters)) || undefined,
      price: priceNum,
      sort_index: Number.isFinite(sortIndex) ? sortIndex : 500,
      price_from: hasPriceFrom,
      is_promo: isPromo,
      uv_protection: uvProtection,
      hide_detail_link: hideDetailLink,
      hide_photo: hidePhoto,
      enable_transposition_calc: enableTranspositionCalc,
      admin_only: adminOnly,
      material: catalog === "mkl" ? (mklReplacementModes || null) : material.trim() ? material.trim() : null,
      lens_id: isEdit ? (lensId.trim() ? parseInt(lensId, 10) : null) : lensId.trim() ? parseInt(lensId, 10) : undefined,
      group,
      coefficient:
        catalog === "mkl"
          ? isEdit
            ? mklBaseCurves || null
            : mklBaseCurves || undefined
          : isEdit
            ? coefficient?.trim()
              ? coefficient.trim()
              : null
            : coefficient || undefined,
      feature_ids: isEdit ? featureIds : featureIds.length ? featureIds : undefined,
      feature_colors: (() => {
        const entries: [string, string[]][] = [];
        for (const id of featureIds) {
          const f = features.find((x) => x.id === id);
          if (f && featureRequiresColor(f.name)) {
            const list = featureColors[id]?.length ? featureColors[id]! : (f.colors?.length ? [f.colors[0]!] : [colorOptions[0]!]).filter(Boolean);
            if (list.length) entries.push([String(id), list]);
          }
        }
        const obj = Object.fromEntries(entries);
        if (isEdit) return obj;
        return entries.length > 0 ? obj : undefined;
      })(),
      custom_values: (() => {
        const out: Record<string, string | string[] | boolean | null> = {};
        customFieldsSorted.forEach((field) => {
          const raw = customValues[field.code];
          if (field.field_type === "checkbox") {
            out[field.code] = Boolean(raw);
            return;
          }
          if (field.field_type === "multi_select") {
            const { templates, freeBlocks, rawBlocks } = splitMultiSelectValue(raw);
            const hasTemplatesConfigured = (field.options || []).length > 0;

            if (hasTemplatesConfigured) {
              const allowed = new Set((field.options || []).map((o) => o.id));
              const templateEntries = Object.entries(templates)
                .map(([id, text]) => ({ id: Number(id), text: String(text ?? "") }))
                .filter((x) => allowed.has(x.id) && x.text.trim() !== "")
                .map((x) => encodeMultiSelectTemplateEntry(x.id, x.text));
              const legacyFree = freeBlocks.map((x) => String(x)).map((x) => x.trimEnd()).filter((x) => x.trim() !== "");
              const combined = [...templateEntries, ...legacyFree];
              if (isEdit || combined.length > 0) out[field.code] = combined;
              return;
            }

            // Без шаблонов: сохраняем как набор свободных блоков (старый режим)
            const arr = Array.isArray(raw) ? rawBlocks.map((x) => String(x)) : rawBlocks;
            let blocks = [...arr];
            while (blocks.length > 0 && blocks[blocks.length - 1]!.trim() === "") blocks.pop();
            if (isEdit) {
              out[field.code] = blocks.some((b) => b.trim().length > 0) ? blocks : [];
            } else if (blocks.some((b) => b.trim().length > 0)) {
              out[field.code] = blocks;
            }
            return;
          }
          if (field.field_type === "string_multi") {
            const arr = Array.isArray(raw) ? raw.map((x) => String(x)) : [];
            const cleaned = arr.map((x) => x.trim()).filter(Boolean);
            if (isEdit) {
              out[field.code] = cleaned;
            } else if (cleaned.length > 0) {
              out[field.code] = cleaned;
            }
            return;
          }
          if (isEdit) {
            if (raw == null) {
              out[field.code] = null;
            } else {
              const value = String(raw).trim();
              out[field.code] = value === "" ? null : value;
            }
            return;
          }
          if (raw == null) return;
          const value = String(raw).trim();
          if (!value) return;
          out[field.code] = value;
        });
        if (!isEdit && Object.keys(out).length === 0) return undefined;
        return out;
      })(),
    };
    setLoading(true);
    try {
      if (isEdit && editId) {
        await plRef.update(editId, {
          ...payload,
          publish_mode: publishMode,
          publish_at: publishMode === "schedule" ? (publishAt ? new Date(publishAt).toISOString() : null) : null,
        });
        if (publishMode === "schedule") {
          alert("Изменения добавлены в очередь публикации");
          navigate("/settings/pricelist-publications");
        } else {
          navigate(`${basePath}/${editId}`);
        }
      } else {
        const createPayload = {
          ...payload,
          description: payload.description === null ? undefined : payload.description,
          full_description: payload.full_description === null ? undefined : payload.full_description,
          lens_id: payload.lens_id === null ? undefined : payload.lens_id,
          coefficient: payload.coefficient === null ? undefined : payload.coefficient,
        };
        if (publishMode === "schedule") {
          if (!publishAt) {
            alert("Укажите дату и время публикации");
            return;
          }
          await api.ref.pricelistPublications.create({
            catalog,
            action: "create",
            payload_json: createPayload,
            publish_at: new Date(publishAt).toISOString(),
          });
          alert("Новая позиция добавлена в очередь публикации");
          navigate("/settings/pricelist-publications");
        } else {
          await plRef.create(createPayload);
          navigate(basePath);
        }
      }
    } catch (err) {
      const details = extractRequestErrorMessage(err);
      alert(`Ошибка сохранения: ${details}`);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  };

  const inputClassName = "w-full px-3 py-2.5 rounded-xl text-sm outline-none min-w-0 transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)]";
  /** Несколько строк на экране; длинный текст — прокрутка внутри поля (без «простыни»). */
  const textareaFieldClass = `${inputClassName} resize-y min-h-[3.75rem] max-h-32 overflow-y-auto leading-relaxed`;
  const textareaFieldClassLg = `${inputClassName} resize-y min-h-[4.25rem] max-h-40 overflow-y-auto leading-relaxed`;
  const pageContainerClass = catalog === "mkl" ? "w-full max-w-none mx-0" : "max-w-3xl mx-auto";

  if (loadingRefs) {
    return (
      <div className={`${pageContainerClass} animate-slide-in pb-12`}>
        <div className="rounded-2xl p-8 flex items-center justify-center gap-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", boxShadow: "var(--shadow-elevated)", color: "var(--text-secondary)" }}>
          <svg className="animate-spin shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--accent)" }}><circle cx="12" cy="12" r="10" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" /></svg>
          Загрузка справочников…
        </div>
      </div>
    );
  }

  return (
    <div className={`${pageContainerClass} pb-12`}>
      <div
        className="rounded-2xl"
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-elevated)",
        }}
      >
        <div className="p-6 sm:p-8 space-y-8">
          <div>
            <Link
              to={basePath}
              className="inline-flex items-center gap-2 text-sm font-medium rounded-lg py-1.5 pr-2 -ml-1 transition-colors hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              К Прайс склад
            </Link>
            <h1 className="text-2xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
              {isEdit ? "Редактирование позиции прайслиста" : "Новый элемент прайслиста"}
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              {isEdit ? "Измените данные и сохраните." : "Заполните данные линзы. Интерфейс поддерживает светлую и тёмную тему."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="rounded-xl p-4 grid gap-3 sm:grid-cols-2" style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  {isEdit ? "Публикация изменений" : "Публикация новой позиции"}
                </label>
                <select
                  className={inputClassName}
                  style={inputStyle}
                  value={publishMode}
                  onChange={(e) => setPublishMode(e.target.value as "now" | "schedule")}
                >
                  <option value="now">Опубликовать сейчас</option>
                  <option value="schedule">Запланировать по дате</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Дата и время публикации</label>
                <input
                  type="datetime-local"
                  className={inputClassName}
                  style={inputStyle}
                  value={publishAt}
                  onChange={(e) => setPublishAt(e.target.value)}
                  disabled={publishMode !== "schedule"}
                  required={publishMode === "schedule"}
                />
              </div>
            </div>
            {isEdit ? (
              <div
                className="sticky top-0 z-30 -mx-6 sm:-mx-8 px-6 sm:px-8 py-3.5 -mt-2 mb-2 border-b"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border)",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.06)",
                }}
              >
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Название линзы *
                </label>
                <input
                  type="text"
                  value={lensName}
                  onChange={(e) => setLensName(e.target.value)}
                  className={inputClassName}
                  style={inputStyle}
                  placeholder="Например: Air Wear 1.5"
                  required
                  autoComplete="off"
                />
              </div>
            ) : null}

            <Section title="Основные данные">
              <div className={`grid grid-cols-1 gap-4 ${isEdit ? "" : "sm:grid-cols-2"}`}>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Производитель *</label>
                  <select
                    value={manufacturerId}
                    onChange={(e) => setManufacturerId(e.target.value ? Number(e.target.value) : "")}
                    className={inputClassName}
                    style={inputStyle}
                    required
                  >
                    <option value="">— Выберите —</option>
                    {manufacturers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                {!isEdit ? (
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Название линзы *</label>
                    <input
                      type="text"
                      value={lensName}
                      onChange={(e) => setLensName(e.target.value)}
                      className={inputClassName}
                      style={inputStyle}
                      placeholder="Например: Air Wear 1.5"
                      required
                    />
                  </div>
                ) : null}
              </div>
            </Section>

            <Section title="Описание и медиа">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Краткое описание</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={textareaFieldClass}
                    style={{ ...inputStyle, fieldSizing: "fixed" } as React.CSSProperties}
                    rows={3}
                    placeholder="Краткое описание линзы"
                  />
                </div>
                <div>
                  {catalog === "rx" || catalog === "mkl" ? (
                    <PricelistRxDescriptionEditor
                      value={fullDescription}
                      onChange={setFullDescription}
                      textareaClassName={textareaFieldClassLg}
                      inputStyle={inputStyle}
                      uploadImage={uploadPhoto}
                    />
                  ) : (
                    <>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Полное описание</label>
                      <textarea
                        value={fullDescription}
                        onChange={(e) => setFullDescription(e.target.value)}
                        className={textareaFieldClassLg}
                        style={{ ...inputStyle, fieldSizing: "fixed" } as React.CSSProperties}
                        rows={4}
                        placeholder="Подробное описание линзы"
                      />
                    </>
                  )}
                </div>
                <div>
                  <BarcodeGroupsEditor groups={barcodeGroups} onChange={setBarcodeGroups} inputStyle={inputStyle} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Фотографии</label>
                  <div className="flex flex-wrap items-start gap-4">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.gif,.webp,.svg,image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                        multiple
                        onChange={handlePhotosAdd}
                        disabled={uploadingPhoto}
                        className="hidden"
                      />
                      <span
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                        style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                      >
                        {uploadingPhoto ? "Загрузка…" : "+ Добавить фото"}
                      </span>
                    </label>
                    {photoUrls.length > 0 && (
                      <div className="flex flex-wrap gap-3 mt-2">
                        {photoUrls.map((url, i) => (
                          <div key={i} className="relative group">
                            <img
                              src={url}
                              alt={`Фото ${i + 1}`}
                              className="w-24 h-24 rounded-xl border object-cover"
                              style={{ borderColor: "var(--border)" }}
                            />
                            <button
                              type="button"
                              onClick={() => removePhoto(i)}
                              className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ backgroundColor: "var(--error)" }}
                              aria-label="Удалить фото"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer mt-3 max-w-xl">
                    <input
                      type="checkbox"
                      checked={hidePhoto}
                      onChange={(e) => setHidePhoto(e.target.checked)}
                      className="rounded border-gray-300 mt-0.5 shrink-0"
                    />
                    <span>
                      <span className="text-sm font-medium block" style={{ color: "var(--text-primary)" }}>
                        Скрыть фото в карточке товара
                      </span>
                      <span className="text-xs leading-snug block mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                        Файлы остаются в позиции; на странице товара ({basePath}/…) блок с фото не показывается.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </Section>

            <Section title="Параметры линзы">
              <LensParamsEditor rows={lensParamRows} onChange={setLensParamRows} inputStyle={inputStyle} isMkl={catalog === "mkl"} />
            </Section>

            <Section title="Цена и классификация">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Цена (₽) *</label>
            <input
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={inputClassName}
              style={inputStyle}
              placeholder="от 3200"
              required
            />
            <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              Сумма в рублях; можно «от 3550», «3 550» или «3550». Если включена галочка «Цена от/до» (или введено «от»), в списке и карточке показывается «от».
            </p>
          </div>
          <div className="flex items-center gap-4 sm:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={priceFromChecked}
                onChange={(e) => setPriceFromChecked(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Цена от</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={priceToChecked}
                onChange={(e) => setPriceToChecked(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Цена до</span>
            </label>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Если включена любая из галочек, цена отображается как «от».
            </span>
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPromo}
                onChange={(e) => setIsPromo(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Акция</span>
            </label>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>На списке прайслиста цена будет красной</span>
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hideDetailLink}
                onChange={(e) => setHideDetailLink(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Скрыть переход в карточку товара</span>
            </label>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Если включено, кнопка перехода на странице прайслиста будет неактивна</span>
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enableTranspositionCalc}
                onChange={(e) => setEnableTranspositionCalc(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Включить калькулятор транспозиции в карточке</span>
            </label>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Показывает кнопку калькулятора на странице карточки товара</span>
          </div>
          {catalog === "rx" ? (
            <div className="flex items-center gap-3 sm:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adminOnly}
                  onChange={(e) => setAdminOnly(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Показывать только администратору</span>
              </label>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Позиция будет скрыта в RX-прайсе и карточке для обычных пользователей</span>
            </div>
          ) : null}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>ID линзы (каталог)</label>
            <input
              type="text"
              value={lensId}
              onChange={(e) => setLensId(e.target.value)}
              className={inputClassName}
              style={inputStyle}
              placeholder="1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Индекс сортировки (внутри группы)
            </label>
            <input
              type="number"
              value={sortIndex}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSortIndex(Number.isFinite(v) ? Math.max(-100000, Math.min(100000, Math.round(v))) : 500);
              }}
              className={inputClassName}
              style={inputStyle}
              placeholder="500"
            />
          </div>
        </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Группа</label>
            <div className="flex flex-wrap gap-2 items-end">
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="flex-1 min-w-[100px] px-3 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}
              >
                <option value="">— Выберите —</option>
                {groupsList.map((g) => (
                  <option key={g.id} value={g.name}>{g.name}</option>
                ))}
              </select>
              <div className="flex gap-2 flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Новая группа"
                  className="flex-1 px-3 py-2 rounded-xl text-sm outline-none min-w-0"
                  style={inputStyle}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddGroup())}
                />
                <button
                  type="button"
                  onClick={handleAddGroup}
                  disabled={addingGroup || !newGroupName.trim()}
                  className="px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {addingGroup ? "…" : "+ Добавить"}
                </button>
              </div>
            </div>
          </div>
          {catalog !== "mkl" ? (
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Индекс</label>
            <div className="flex flex-wrap gap-2 items-end">
              <select
                value={coefficient}
                onChange={(e) => setCoefficient(e.target.value)}
                className="flex-1 min-w-[100px] px-3 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}
              >
                <option value="">— Выберите —</option>
                {coefficientsList.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <div className="flex gap-2 flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={newCoefficientName}
                  onChange={(e) => setNewCoefficientName(e.target.value)}
                  placeholder="Новый индекс"
                  className="flex-1 px-3 py-2 rounded-xl text-sm outline-none min-w-0"
                  style={inputStyle}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCoefficient())}
                />
                <button
                  type="button"
                  onClick={handleAddCoefficient}
                  disabled={addingCoefficient || !newCoefficientName.trim()}
                  className="px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {addingCoefficient ? "…" : "+ Добавить"}
                </button>
              </div>
            </div>
          </div>
          ) : null}
        </div>
            </Section>

            <Section title="Особенности (можно выбрать несколько)">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={uvProtection}
                    onChange={(e) => setUvProtection(e.target.checked)}
                    className="rounded border-gray-300"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>UV-защита</span>
                </label>
                {catalog !== "mkl" ? (
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Материал</label>
                  <input
                    type="text"
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    className={inputClassName}
                    style={inputStyle}
                    placeholder="Например: полимер / стекло"
                  />
                </div>
                ) : null}
              </div>
          <input
            type="text"
            value={featureSearch}
            onChange={(e) => setFeatureSearch(e.target.value)}
            placeholder="Поиск по названию…"
            className={`${inputClassName} mb-3`}
            style={inputStyle}
          />
          <div className="flex flex-wrap gap-2">
            {filteredFeatures.length === 0 ? (
              <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                {featureSearch.trim() ? "Ничего не найдено" : "Нет особенностей в справочнике"}
              </span>
            ) : (
              filteredFeatures.map((f) => (
                <label
                  key={f.id}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors"
                  style={{ ...inputStyle, borderColor: featureIds.includes(f.id) ? "var(--accent)" : "var(--border)", background: featureIds.includes(f.id) ? "var(--accent-light)" : "var(--bg-primary)" }}
                >
                  <input type="checkbox" checked={featureIds.includes(f.id)} onChange={() => toggleFeature(f.id)} className="rounded" style={{ accentColor: "var(--accent)" }} />
                  {f.icon_url ? (
                    <img
                      src={f.icon_url}
                      alt={f.name}
                      className="w-5 h-5 rounded object-contain shrink-0"
                    />
                  ) : null}
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>{f.name}</span>
                </label>
              ))
            )}
          </div>
          {features.filter((f) => featureIds.includes(f.id) && featureRequiresColor(f.name)).length > 0 && (
            <div className="mt-4 space-y-4" style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
              <div className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Цвета для выбранных особенностей (можно несколько)</div>
              {features
                .filter((f) => featureIds.includes(f.id) && featureRequiresColor(f.name))
                .map((f) => {
                  const options = (f.colors && f.colors.length > 0 ? f.colors : colorOptions).filter(Boolean);
                  const colors = featureColors[f.id]?.length ? featureColors[f.id]! : [options[0] ?? ""].filter(Boolean);
                  return (
                    <div key={f.id} className="space-y-2">
                      <span className="text-sm font-medium flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                        {f.icon_url ? (
                          <img
                            src={f.icon_url}
                            alt={f.name}
                            className="w-5 h-5 rounded object-contain shrink-0"
                          />
                        ) : null}
                        {f.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {colors.map((color, idx) => (
                          <div key={idx} className="flex items-center gap-1 rounded-xl border px-2 py-1.5" style={{ ...inputStyle, borderColor: "var(--border)" }}>
                            <select
                              value={color}
                              onChange={(e) => setFeatureColorAt(f.id, idx, e.target.value)}
                              className="rounded-lg text-sm outline-none min-w-[120px] border-0 bg-transparent py-0"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {options.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => removeFeatureColor(f.id, idx)}
                              className="p-1 rounded hover:opacity-80"
                              style={{ color: "var(--text-secondary)" }}
                              aria-label="Удалить цвет"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const nextColor = options.find((o) => !colors.includes(o)) ?? options[0];
                            if (nextColor) addFeatureColor(f.id, nextColor);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm border border-dashed"
                          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                        >
                          + Добавить цвет
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
            </Section>

            {customFieldsSorted.length > 0 && (
              <Section title="Дополнительные поля">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {customFieldsSorted.map((field) => (
                    <div key={field.id} className={field.field_type === "multi_select" ? "sm:col-span-2" : undefined}>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                        {field.label}{field.is_required ? " *" : ""}
                      </label>
                      {field.field_type === "checkbox" ? (
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(customValues[field.code])}
                            onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.code]: e.target.checked }))}
                          />
                          <span style={{ color: "var(--text-primary)" }}>Да</span>
                        </label>
                      ) : field.field_type === "select" || field.field_type === "reference" ? (
                        <select
                          value={String(customValues[field.code] ?? "")}
                          onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.code]: e.target.value || null }))}
                          className={inputClassName}
                          style={inputStyle}
                          required={field.is_required}
                        >
                          <option value="">— Выберите —</option>
                          {(field.options || []).map((opt) => (
                            <option key={opt.id} value={opt.value}>{opt.value}</option>
                          ))}
                        </select>
                      ) : field.field_type === "multi_select" ? (
                        <div className="space-y-3">
                          {(field.options || []).length > 0 ? (
                            (() => {
                              const { templates, freeBlocks } = splitMultiSelectValue(customValues[field.code]);
                              const selected = new Set(Object.keys(templates).map((x) => Number(x)));
                              const selectedSorted = (field.options || []).filter((o) => selected.has(o.id));
                              return (
                                <>
                                  <p className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>
                                    Выберите нужные подпункты и заполните текст для каждого.
                                  </p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {(field.options || []).map((opt) => (
                                      <label
                                        key={opt.id}
                                        className="flex items-start gap-2 rounded-xl border p-3 cursor-pointer"
                                        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={selected.has(opt.id)}
                                          onChange={() => toggleMultiSelectTemplate(field.code, opt.id)}
                                          className="mt-1"
                                        />
                                        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                                          {opt.value}
                                        </span>
                                      </label>
                                    ))}
                                  </div>

                                  {selectedSorted.length > 0 && (
                                    <div className="space-y-3 pt-2">
                                      {selectedSorted.map((opt) => (
                                        <div key={opt.id} className="space-y-1">
                                          <div className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                                            {opt.value}
                                          </div>
                                          <textarea
                                            value={templates[opt.id] ?? ""}
                                            onChange={(e) => updateMultiSelectTemplateText(field.code, opt.id, e.target.value)}
                                            className={textareaFieldClass + " w-full"}
                                            style={{ ...inputStyle, fieldSizing: "fixed" } as React.CSSProperties}
                                            rows={3}
                                            placeholder="Текст…"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {freeBlocks.some((b) => b.trim() !== "") && (
                                    <div className="pt-2">
                                      <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-tertiary)" }}>
                                        Старые свободные блоки (из прошлых сохранений)
                                      </div>
                                      <ul className="list-disc pl-5 space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                                        {freeBlocks.map((b, idx) => (
                                          <li key={idx} className="whitespace-pre-wrap break-words">
                                            {b}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </>
                              );
                            })()
                          ) : (
                            <>
                              <p className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>
                                Несколько блоков текста — как отдельные абзацы. В каждом блоке можно переносить строки. Добавьте ещё блок кнопкой ниже.
                              </p>
                              {normalizeMultiSelectBlocks(customValues[field.code]).map((block, idx) => (
                                <div key={idx} className="flex gap-2 items-start">
                                  <textarea
                                    value={block}
                                    onChange={(e) => updateMultiSelectBlock(field.code, idx, e.target.value)}
                                    className={textareaFieldClass + " flex-1 min-w-0"}
                                    style={{ ...inputStyle, fieldSizing: "fixed" } as React.CSSProperties}
                                    rows={3}
                                    placeholder={`Текст блока ${idx + 1}…`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeMultiSelectBlock(field.code, idx)}
                                    className="shrink-0 px-3 py-2 rounded-xl text-sm font-medium border transition-opacity"
                                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                                    title="Удалить блок"
                                    aria-label="Удалить блок"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => addMultiSelectBlock(field.code)}
                                className="text-sm font-medium px-3 py-2 rounded-xl border transition-colors"
                                style={{ color: "var(--accent)", borderColor: "var(--border)" }}
                              >
                                + Добавить текстовый блок
                              </button>
                            </>
                          )}
                        </div>
                      ) : field.field_type === "string_multi" ? (
                        <div className="space-y-3">
                          {(field.options || []).length > 0 ? (
                            (() => {
                              const selectedValues = new Set(
                                Array.isArray(customValues[field.code])
                                  ? (customValues[field.code] as unknown[]).map((x) => String(x)).filter((x) => x.trim() !== "")
                                  : []
                              );
                              return (
                                <>
                                  <p className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>
                                    Выберите несколько значений из справочника.
                                  </p>
                                  <div className="grid gap-2 sm:grid-cols-2 max-h-80 overflow-auto pr-1">
                                    {(field.options || []).map((opt) => (
                                      <label
                                        key={opt.id}
                                        className="flex items-start gap-2 rounded-xl border p-3 cursor-pointer transition-colors"
                                        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={selectedValues.has(opt.value)}
                                          onChange={() => {
                                            setCustomValues((prev) => {
                                              const cur = Array.isArray(prev[field.code]) ? (prev[field.code] as unknown[]).map((x) => String(x)) : [];
                                              const set = new Set(cur.map((x) => x.trim()).filter(Boolean));
                                              if (set.has(opt.value)) set.delete(opt.value);
                                              else set.add(opt.value);
                                              return { ...prev, [field.code]: [...set] };
                                            });
                                          }}
                                          className="mt-1"
                                        />
                                        <span
                                          className="text-sm whitespace-pre-wrap leading-snug line-clamp-4"
                                          style={{ color: "var(--text-primary)" }}
                                        >
                                          {opt.value}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </>
                              );
                            })()
                          ) : (
                            <>
                              <p className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>
                                Несколько строк. Добавляйте значения кнопкой ниже.
                              </p>
                              {(() => {
                                const arr = Array.isArray(customValues[field.code]) ? (customValues[field.code] as unknown[]).map((x) => String(x)) : [""];
                                const rows = arr.length > 0 ? arr : [""];
                                return rows.map((row, idx) => (
                                  <div key={idx} className="flex gap-2 items-start">
                                    <input
                                      type="text"
                                      value={row}
                                      onChange={(e) => updateStringMultiRow(field.code, idx, e.target.value)}
                                      className={inputClassName + " flex-1 min-w-0"}
                                      style={inputStyle}
                                      placeholder={`Значение ${idx + 1}…`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeStringMultiRow(field.code, idx)}
                                      className="shrink-0 px-3 py-2 rounded-xl text-sm font-medium border transition-opacity"
                                      style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                                      title="Удалить строку"
                                      aria-label="Удалить строку"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ));
                              })()}
                              <button
                                type="button"
                                onClick={() => addStringMultiRow(field.code)}
                                className="text-sm font-medium px-3 py-2 rounded-xl border transition-colors"
                                style={{ color: "var(--accent)", borderColor: "var(--border)" }}
                              >
                                + Добавить строку
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <textarea
                          value={String(customValues[field.code] ?? "")}
                          onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.code]: e.target.value }))}
                          className={textareaFieldClassLg}
                          style={{ ...inputStyle, fieldSizing: "fixed" } as React.CSSProperties}
                          rows={4}
                          required={field.is_required}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <div className="flex flex-wrap gap-3 pt-6" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                {loading ? "Сохранение…" : isEdit ? "Сохранить изменения" : "Сохранить"}
              </button>
              <Link
                to={basePath}
                className="px-5 py-2.5 rounded-xl text-sm font-medium border transition-opacity hover:opacity-80"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                Отмена
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
