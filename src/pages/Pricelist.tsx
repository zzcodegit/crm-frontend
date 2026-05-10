import { useState, useEffect, useLayoutEffect, useRef, useMemo, memo } from "react";
import { Link, useSearchParams, useLocation } from "react-router-dom";
import { api } from "../api";
import { parsePriceFromText, priceFromFromText, formatPricelistPriceRub } from "../utils/pricelistPrice";
import { useAuth } from "../contexts/AuthContext";
import type { ManufacturerItem, PricelistGroupItem } from "../api";
import LensTranspositionDrawer from "../components/LensTranspositionDrawer";
import { isNativeAppShell } from "../utils/nativeApp";

export interface PricelistRow {
  id: number;
  manufacturer: string;
  lensName: string;
  description: string;
  /** Все значения сферы для этой линзы */
  sph: string;
  /** Все значения цилиндра для этой линзы */
  cyl: string;
  /** Все значения шага для этой линзы */
  step: string;
  /** Все диаметры для этой линзы */
  diameters: string;
  /** Доп. параметр (для МКЛ: режим замены). */
  material?: string;
  price: number;
  sortIndex: number;
  priceFrom?: boolean;
  is_promo?: boolean;
  lensId: number;
  group: string;
  coefficient: string;
  featureIds: number[];
  hideDetailLink?: boolean;
  /** «Показывать только администратору» (в форме сейчас только RX; API может вернуть для любого каталога) — в APK скрываем */
  adminOnly?: boolean;
  barcodes: { code: string; price: number | null; description?: string | null }[];
}

type PricelistBulkRow = {
  key: string;
  manufacturer_id: number | "";
  lens_name: string;
  description: string;
  sph: string;
  cyl: string;
  step: string;
  diameters: string;
  material?: string;
  price: string;
  lens_id: string;
  group: string;
  coefficient: string;
};

const GROUP_ORDER_FALLBACK: string[] = ["Однофокальные", "Прогрессивные", "Торические"];
/** Если в каталоге ещё нет позиций — запасной вариант для массового создания */
const COEFFICIENT_BULK_FALLBACK = ["Все", "1.5", "1.6", "1.67", "1.74"];
const GROUP_VISIBLE_ROWS_STEP = 40;
const GROUP_VISIBLE_ROWS_INITIAL = 40;

function sortCoefficientStrings(values: string[]): string[] {
  return [...values].sort((a, b) => {
    const na = parseFloat(a.replace(",", "."));
    const nb = parseFloat(b.replace(",", "."));
    if (
      Number.isFinite(na) &&
      Number.isFinite(nb) &&
      /^[\d.,\s]+$/.test(a.trim()) &&
      /^[\d.,\s]+$/.test(b.trim())
    ) {
      return na - nb;
    }
    return a.localeCompare(b, "ru", { numeric: true });
  });
}

function uniqueCoefficientsFromRows(rows: { coefficient: string }[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const c = (r.coefficient ?? "").trim();
    if (c) set.add(c);
  }
  return sortCoefficientStrings([...set]);
}

/** Стабильный id секции группы в DOM и фрагмент URL (#…). */
function pricelistGroupSectionFragment(groupName: string): string {
  return encodeURIComponent(groupName.trim());
}

function pricelistSectionElementId(groupName: string): string {
  return `pl-sec-${pricelistGroupSectionFragment(groupName)}`;
}

/** Нормализация для поиска: регистр (ru), ё→е, слэши/лишние пробелы — чтобы «1.56/1.55» находилось и как «1.56 1.55». */
function normalizePricelistSearchText(s: string): string {
  return s
    .toLocaleLowerCase("ru-RU")
    .replace(/\u0451/g, "\u0435")
    .replace(/\u00a0/g, " ")
    .replace(/[\/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pricelistSearchTokens(query: string): string[] {
  const n = normalizePricelistSearchText(query);
  if (!n) return [];
  return n.split(/\s+/).filter(Boolean);
}

/** Все слова запроса должны встречаться в названии / производителе / описании (порядок не важен). */
function rowMatchesPricelistNameSearch(row: PricelistRow, query: string): boolean {
  const tokens = pricelistSearchTokens(query);
  if (tokens.length === 0) return true;
  const hay = normalizePricelistSearchText(
    [row.lensName, row.manufacturer, row.description].filter(Boolean).join(" ")
  );
  return tokens.every((t) => hay.includes(t));
}

/** Из строки диаметров "65, 70, 75 мм" или "65/70/75" извлекает список значений ["65", "70", "75"] */
function parseDiameters(diameters: string): string[] {
  if (!diameters || !diameters.trim()) return [];
  const normalized = diameters.replace(/\s*мм\s*/gi, "").trim();
  return normalized.split(/[\s,;\/]+/).map((s) => s.trim()).filter(Boolean);
}

// Значения столбиком: разбиваем по запятой, каждое с новой строки; диапазоны без переноса; без единиц D и мм
const ValuesColumn = memo(function ValuesColumn({ value, className = "text-xs" }: { value: string; className?: string }) {
  const displayValue = value.replace(/\s+D\b/g, "").replace(/\s*мм\s*/g, "").trim();
  const parts = displayValue.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return <div className={`${className} leading-snug whitespace-nowrap`} style={{ color: "var(--text-primary)" }}>{displayValue}</div>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {parts.map((part, i) => (
        <div key={i} className={`${className} leading-snug whitespace-nowrap`} style={{ color: "var(--text-primary)" }}>{part}</div>
      ))}
    </div>
  );
});

function apiItemToRow(item: import("../api").PricelistItemResponse): PricelistRow {
  return {
    id: item.id,
    manufacturer: item.manufacturer_name,
    lensName: item.lens_name,
    description: item.description ?? "",
    sph: item.sph ?? "",
    cyl: item.cyl ?? "",
    step: item.step ?? "",
    diameters: item.diameters ?? "",
    material: item.material ?? "",
    price: item.price,
    sortIndex: item.sort_index ?? 500,
    priceFrom: item.price_from ?? false,
    is_promo: item.is_promo ?? false,
    lensId: item.lens_id ?? 0,
    group: item.group,
    coefficient: item.coefficient ?? "",
    featureIds: item.feature_ids ?? [],
    hideDetailLink: item.hide_detail_link ?? false,
    adminOnly: item.admin_only === true,
    barcodes: (item.barcodes ?? []).map((b) => ({
      code: String(b.code ?? "").trim(),
      price: b.price == null ? null : Number(b.price),
      description: b.description ?? null,
    })),
  };
}

export type PricelistPageProps = {
  /** Базовый путь раздела (по умолчанию основной прайслист). */
  basePath?: string;
  title?: string;
  subtitle?: string;
};

export default function Pricelist({
  basePath = "/pricelist",
  title = "Прайс склад",
  subtitle = "Актуальные цены на линзы. Производители из справочника.",
}: PricelistPageProps = {}) {
  const catalog = basePath === "/pricelist-rx" ? "rx" : basePath === "/pricelist-mkl" ? "mkl" : "warehouse";
  const plApi = catalog === "rx" ? api.pricelistRx : catalog === "mkl" ? api.pricelistMkl : api.pricelist;
  const plRef = catalog === "rx" ? api.ref.pricelistRx : catalog === "mkl" ? api.ref.pricelistMkl : api.ref.pricelist;
  const plGroupsApi =
    catalog === "rx" ? api.ref.pricelistRxGroups : catalog === "mkl" ? api.ref.pricelistMklGroups : api.ref.pricelistGroups;
  const normalizeGroupName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const scrollSyncRef = useRef(false);
  const isAdmin = user?.is_admin === true;
  const [manufacturers, setManufacturers] = useState<ManufacturerItem[]>([]);
  const [pricelistFromApi, setPricelistFromApi] = useState<PricelistRow[]>([]);
  const [pricelistLoading, setPricelistLoading] = useState(true);
  const [pricelistLoadError, setPricelistLoadError] = useState(false);
  const [groupsList, setGroupsList] = useState<PricelistGroupItem[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [transposeOpen, setTransposeOpen] = useState(false);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [sortSavingId, setSortSavingId] = useState<number | null>(null);
  const [bulkRows, setBulkRows] = useState<PricelistBulkRow[]>([
    {
      key: Math.random().toString(36).slice(2),
      manufacturer_id: "",
      lens_name: "",
      description: "",
      sph: "",
      cyl: "",
      step: "",
      diameters: "",
      material: "",
      price: "",
      lens_id: "",
      group: GROUP_ORDER_FALLBACK[0],
      coefficient: "Все",
    },
  ]);

  const groupFilter = searchParams.get("group") || "Все группы";
  const coefFilter = searchParams.get("coef") || "Все";
  const diameterFilter = searchParams.get("diameter") || "Все";
  const manufacturerFilter = isAdmin ? (searchParams.get("manufacturer") || "Все поставщики") : "Все поставщики";
  const searchQuery = searchParams.get("q") ?? "";

  const groupMetaByName = useMemo(() => {
    const m = new Map<string, PricelistGroupItem>();
    for (const g of groupsList) m.set(g.name, g);
    return m;
  }, [groupsList]);

  const groupOrder = groupsList.length > 0 ? groupsList.map((g) => g.name) : GROUP_ORDER_FALLBACK;
  const groupDisplayMap = new Map(
    groupsList.map((g) => [normalizeGroupName(g.name), g.display_properties_in_list ?? true])
  );
  const groupsForFilter = ["Все группы", ...groupOrder];

  const applyFilters = (updates: {
    group?: string;
    coef?: string;
    diameter?: string;
    manufacturer?: string;
    q?: string;
  }) => {
    const p = new URLSearchParams(searchParams);
    if (updates.group !== undefined) {
      if (updates.group === "Все группы") p.delete("group");
      else p.set("group", updates.group);
    }
    if (updates.coef !== undefined) {
      if (updates.coef === "Все") p.delete("coef");
      else p.set("coef", updates.coef);
    }
    if (updates.diameter !== undefined) {
      if (updates.diameter === "Все") p.delete("diameter");
      else p.set("diameter", updates.diameter);
    }
    if (updates.manufacturer !== undefined) {
      if (updates.manufacturer === "Все поставщики") p.delete("manufacturer");
      else p.set("manufacturer", updates.manufacturer);
    }
    if (updates.q !== undefined) {
      if (updates.q.trim() === "") p.delete("q");
      else p.set("q", updates.q);
    }
    setSearchParams(p);
  };

  useEffect(() => {
    api.ref.manufacturers.list().then(setManufacturers).catch(() => setManufacturers([]));
    plGroupsApi.list().then(setGroupsList).catch(() => setGroupsList([]));
  }, [catalog]);

  const loadPricelist = () => {
    plApi
      .list()
      .then((items) => {
        setPricelistLoadError(false);
        setPricelistFromApi(items.map(apiItemToRow));
      })
      .catch(() => {
        setPricelistLoadError(true);
        setPricelistFromApi([]);
      })
      .finally(() => setPricelistLoading(false));
  };
  useEffect(() => {
    loadPricelist();
  }, [catalog]);

  const nativeShell = isNativeAppShell();
  const sourceList = useMemo(() => {
    if (!nativeShell) return pricelistFromApi;
    return pricelistFromApi.filter((row) => !row.adminOnly);
  }, [nativeShell, pricelistFromApi]);
  const manufacturerNames = useMemo(() => manufacturers.map((m) => m.name), [manufacturers]);
  const manufacturerSet = useMemo(() => new Set(manufacturerNames), [manufacturerNames]);
  const filteredByRefs = useMemo(
    () =>
      sourceList.filter((row) => {
        if (groupFilter !== "Все группы" && row.group !== groupFilter) return false;
        if (coefFilter !== "Все" && row.coefficient !== coefFilter) return false;
        if (diameterFilter !== "Все") {
          const rowDiameters = parseDiameters(row.diameters);
          if (!rowDiameters.includes(diameterFilter)) return false;
        }
        if (isAdmin && manufacturerFilter !== "Все поставщики" && row.manufacturer !== manufacturerFilter) return false;
        return true;
      }),
    [sourceList, groupFilter, coefFilter, diameterFilter, isAdmin, manufacturerFilter]
  );
  const filtered = useMemo(
    () => filteredByRefs.filter((row) => rowMatchesPricelistNameSearch(row, searchQuery)),
    [filteredByRefs, searchQuery]
  );
  const filteredWithManufacturer = useMemo(
    () => filtered.filter((row) => manufacturerSet.has(row.manufacturer)),
    [filtered, manufacturerSet]
  );
  const orderByManufacturer = (rows: PricelistRow[]) => {
    const order = new Map(manufacturers.map((m, i) => [m.name, i]));
    return [...rows].sort((a, b) => {
      if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
      const ma = order.get(a.manufacturer) ?? 999;
      const mb = order.get(b.manufacturer) ?? 999;
      if (ma !== mb) return ma - mb;
      return a.id - b.id;
    });
  };
  const listToShow = useMemo(
    () => (manufacturers.length > 0 ? orderByManufacturer(filteredWithManufacturer) : filtered),
    [manufacturers.length, filteredWithManufacturer, filtered]
  );
  const sectionOrder = useMemo(() => {
    const inData = new Set(listToShow.map((row) => row.group));
    const out = [...groupOrder];
    for (const g of inData) {
      if (!out.includes(g)) out.push(g);
    }
    return out;
  }, [listToShow, groupOrder]);
  const groupedRows = useMemo(() => {
    const m = new Map<string, PricelistRow[]>();
    for (const row of listToShow) {
      if (!m.has(row.group)) m.set(row.group, []);
      m.get(row.group)!.push(row);
    }
    return m;
  }, [listToShow]);
  const byGroup = sectionOrder.map((groupName) => ({
    name: groupName,
    rows: groupedRows.get(groupName) ?? [],
  }));
  const visibleGroupsSignature = useMemo(
    () =>
      byGroup
        .filter(({ rows }) => rows.length > 0)
        .map(({ name }) => name)
        .join("\u0001"),
    [byGroup]
  );
  const listToShowLengthForScroll = pricelistLoading ? 0 : listToShow.length;
  const [visibleRowsByGroup, setVisibleRowsByGroup] = useState<Record<string, number>>({});

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const { name, rows } of byGroup) {
      if (rows.length > 0) next[name] = Math.min(rows.length, GROUP_VISIBLE_ROWS_INITIAL);
    }
    setVisibleRowsByGroup(next);
  }, [groupFilter, coefFilter, diameterFilter, manufacturerFilter, searchQuery, listToShowLengthForScroll]);

  const [priceManageGroup, setPriceManageGroup] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<
    Record<number, { priceStr: string; priceFrom: boolean; barcodePriceStrs: string[] }>
  >({});
  const [priceBulkSaving, setPriceBulkSaving] = useState(false);

  const priceManageRowsAll = useMemo(() => {
    if (!priceManageGroup) return [];
    const raw = pricelistFromApi.filter((r) => r.group === priceManageGroup);
    const filteredWithManufacturer = raw.filter((row) => manufacturerNames.includes(row.manufacturer));
    const order = new Map(manufacturers.map((m, i) => [m.name, i]));
    return [...filteredWithManufacturer].sort((a, b) => {
      if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
      const ma = order.get(a.manufacturer) ?? 999;
      const mb = order.get(b.manufacturer) ?? 999;
      if (ma !== mb) return ma - mb;
      return a.id - b.id;
    });
  }, [priceManageGroup, pricelistFromApi, manufacturers, manufacturerNames]);

  useEffect(() => {
    if (!priceManageGroup) {
      setPriceDraft({});
      return;
    }
    const next: Record<number, { priceStr: string; priceFrom: boolean; barcodePriceStrs: string[] }> = {};
    for (const r of priceManageRowsAll) {
      next[r.id] = {
        priceStr: Number.isFinite(r.price) ? String(r.price) : "",
        priceFrom: !!r.priceFrom,
        barcodePriceStrs: (r.barcodes ?? []).map((b) => (b.price == null ? "" : String(b.price))),
      };
    }
    setPriceDraft(next);
  }, [priceManageGroup, priceManageRowsAll]);

  const savePriceManage = async () => {
    if (!priceManageGroup || !isAdmin) return;
    const updates: {
      id: number;
      price: number;
      price_from: boolean;
      barcodes?: { code: string; price?: number; description?: string }[];
    }[] = [];
    for (const r of priceManageRowsAll) {
      const d = priceDraft[r.id];
      if (!d) continue;
      const parsed = Number.parseFloat(String(d.priceStr ?? "").trim().replace(",", "."));
      if (!Number.isFinite(parsed)) {
        alert(`Укажите корректную цену для «${r.lensName}»`);
        return;
      }
      const pf = d.priceFrom;
      let barcodeChanged = false;
      const nextBarcodes: { code: string; price?: number; description?: string }[] = [];
      let barcodeInvalid = false;
      for (let i = 0; i < (r.barcodes ?? []).length; i += 1) {
        const b = r.barcodes[i]!;
        const raw = (d.barcodePriceStrs?.[i] ?? "").trim();
        if (raw === "") {
          if (b.price != null) barcodeChanged = true;
          nextBarcodes.push({ code: b.code, description: b.description ?? undefined });
          continue;
        }
        const parsedBarcodePrice = Number.parseFloat(raw.replace(",", "."));
        if (!Number.isFinite(parsedBarcodePrice)) {
          alert(`Укажите корректную цену штрихкода «${b.code}» для «${r.lensName}»`);
          barcodeInvalid = true;
          break;
        }
        if (b.price == null || parsedBarcodePrice !== b.price) barcodeChanged = true;
        nextBarcodes.push({ code: b.code, price: parsedBarcodePrice, description: b.description ?? undefined });
      }
      if (barcodeInvalid) return;
      if (parsed !== r.price || pf !== !!r.priceFrom || barcodeChanged) {
        updates.push({
          id: r.id,
          price: parsed,
          price_from: pf,
          ...(barcodeChanged ? { barcodes: nextBarcodes } : {}),
        });
      }
    }
    if (updates.length === 0) {
      setPriceManageGroup(null);
      return;
    }
    setPriceBulkSaving(true);
    try {
      for (const u of updates) {
        await plRef.update(u.id, {
          price: u.price,
          price_from: u.price_from,
          ...(u.barcodes ? { barcodes: u.barcodes } : {}),
        });
      }
      setPricelistFromApi((prev) =>
        prev.map((row) => {
          const u = updates.find((x) => x.id === row.id);
          return u
            ? {
                ...row,
                price: u.price,
                priceFrom: u.price_from,
                ...(u.barcodes
                  ? {
                      barcodes: u.barcodes.map((b) => ({
                        code: b.code,
                        price: b.price ?? null,
                        description: b.description ?? null,
                      })),
                    }
                  : {}),
              }
            : row;
        })
      );
      setPriceManageGroup(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка сохранения цен");
    } finally {
      setPriceBulkSaving(false);
    }
  };

  useEffect(() => {
    if (!priceManageGroup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !priceBulkSaving) setPriceManageGroup(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [priceManageGroup, priceBulkSaving]);

  // Прокрутка к секции из hash (в т.ч. после «Назад» с карточки)
  useLayoutEffect(() => {
    if (pricelistLoading || listToShowLengthForScroll === 0) return;
    const h = window.location.hash;
    if (!h || h.length <= 1) return;
    let groupName: string;
    try {
      groupName = decodeURIComponent(h.slice(1));
    } catch {
      return;
    }
    const el = document.getElementById(pricelistSectionElementId(groupName));
    if (!el) return;
    scrollSyncRef.current = true;
    el.scrollIntoView({ block: "start", behavior: "auto" });
    const t = window.setTimeout(() => {
      scrollSyncRef.current = false;
    }, 200);
    return () => window.clearTimeout(t);
  }, [location.key, pricelistLoading, listToShowLengthForScroll]);

  // Подсветка активной группы в сайдбаре по скроллу (без обновления URL — без лагов).
  useEffect(() => {
    if (pricelistLoading || listToShowLengthForScroll === 0) return;
    const root = document.getElementById("app-main-scroll");
    if (!root) return;

    let lastKey = "";
    const emit = (groupName: string | null) => {
      const key = `${basePath}|${groupName ?? ""}`;
      if (key === lastKey) return;
      lastKey = key;
      window.dispatchEvent(new CustomEvent("crm-pricelist-scroll-group", { detail: { basePath, groupName } }));
    };

    const pickActive = () => {
      const list = Array.from(root.querySelectorAll<HTMLElement>("[data-pricelist-section]"));
      if (list.length === 0) {
        emit(null);
        return;
      }
      const rr = root.getBoundingClientRect();
      const anchorY = rr.top + Math.min(160, rr.height * 0.18);
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      for (const el of list) {
        const r = el.getBoundingClientRect();
        if (r.bottom < rr.top + 4) continue;
        if (r.top > rr.bottom - 4) continue;
        const topClamped = Math.max(r.top, rr.top);
        const dist = Math.abs(topClamped - anchorY);
        if (dist < bestScore) {
          bestScore = dist;
          best = el;
        }
      }
      const name = (best ?? list[0])?.dataset?.groupName ?? null;
      emit(name && name.trim() ? name : null);
    };

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(pickActive);
    };

    const list = Array.from(root.querySelectorAll<HTMLElement>("[data-pricelist-section]"));
    const io = new IntersectionObserver(schedule, {
      root,
      rootMargin: "0px",
      threshold: [0, 0.02, 0.06, 0.12, 0.2, 0.33, 0.5, 0.75, 1],
    });
    list.forEach((el) => io.observe(el));
    root.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      root.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [basePath, pricelistLoading, listToShowLengthForScroll, visibleGroupsSignature]);

  // NOTE: Синхронизацию hash при каждом скролле отключили:
  // на длинном прайсе это давало forced reflow и лаги.

  const groupOptionsForBulk = groupsList.length > 0 ? groupsList.map((g) => g.name) : GROUP_ORDER_FALLBACK;

  const parsePrice = (s: string) => parsePriceFromText(s);

  const addBulkRow = () => {
    setBulkRows((prev) => [
      ...prev,
      {
        key: Math.random().toString(36).slice(2),
        manufacturer_id: "",
        lens_name: "",
        description: "",
        sph: "",
        cyl: "",
        step: "",
        diameters: "",
        material: "",
        price: "",
        lens_id: "",
        group: groupOptionsForBulk[0] ?? "",
        coefficient: "Все",
      },
    ]);
  };

  const removeBulkRow = (key: string) => {
    setBulkRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  const updateBulkRow = (key: string, patch: Partial<PricelistBulkRow>) => {
    setBulkRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const handleBulkCreate = async () => {
    if (!isAdmin) return;
    const rowsToCreate = bulkRows.filter((r) => r.lens_name.trim() || r.price.trim() || r.manufacturer_id !== "");
    if (rowsToCreate.length === 0) {
      alert("Нет данных для создания");
      return;
    }

    // Собираем payload и валидируем минимальные обязательные поля.
    const payloadItems = rowsToCreate.map((r, idx) => {
      const manufacturer_id = r.manufacturer_id === "" ? NaN : Number(r.manufacturer_id);
      if (!Number.isFinite(manufacturer_id)) throw new Error(`Строка ${idx + 1}: выберите производителя`);
      if (!r.lens_name.trim()) throw new Error(`Строка ${idx + 1}: укажите название линзы`);
      if (!r.group.trim()) throw new Error(`Строка ${idx + 1}: укажите группу`);

      const price = parsePrice(r.price);
      if (!Number.isFinite(price) || price < 0) throw new Error(`Строка ${idx + 1}: укажите корректную цену`);

      const lens_id = r.lens_id.trim() ? parseInt(r.lens_id.trim(), 10) : undefined;
      const lensId = lens_id != null && Number.isFinite(lens_id) ? lens_id : undefined;

      const coefficient = r.coefficient && r.coefficient !== "Все" ? r.coefficient : undefined;

      return {
        manufacturer_id,
        lens_name: r.lens_name.trim(),
        description: r.description.trim() || undefined,
        sph: r.sph.trim() || undefined,
        cyl: r.cyl.trim() || undefined,
        step: r.step.trim() || undefined,
        diameters: r.diameters.trim() || undefined,
        material: r.material?.trim() || undefined,
        price,
        price_from: priceFromFromText(r.price),
        lens_id: lensId,
        group: r.group.trim(),
        coefficient,
      };
    });

    setBulkCreating(true);
    try {
      await plRef.bulkCreate(payloadItems);
      setBulkOpen(false);
      setBulkRows([
        {
          key: Math.random().toString(36).slice(2),
          manufacturer_id: "",
          lens_name: "",
          description: "",
          sph: "",
          cyl: "",
          step: "",
          diameters: "",
          material: "",
          price: "",
          lens_id: "",
          group: groupOptionsForBulk[0] ?? "",
          coefficient: "Все",
        },
      ]);
      loadPricelist();
    } catch (e: any) {
      alert(e instanceof Error ? e.message : "Ошибка массового создания");
    } finally {
      setBulkCreating(false);
    }
  };

  const handleDelete = async (id: number, lensName: string) => {
    if (!isAdmin) return;
    if (!window.confirm(`Удалить позицию «${lensName}» из прайслиста?`)) return;
    try {
      await plRef.delete(id);
      setPricelistFromApi((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка удаления");
    }
  };

  const handleSortIndexUpdate = async (rowId: number, nextRaw: string, currentSort: number) => {
    if (!isAdmin) return;
    const parsed = Number.parseInt((nextRaw || "").trim(), 10);
    if (!Number.isFinite(parsed)) return;
    if (parsed === currentSort) return;
    try {
      setSortSavingId(rowId);
      await plRef.update(rowId, { sort_index: parsed });
      setPricelistFromApi((prev) => prev.map((r) => (r.id === rowId ? { ...r, sortIndex: parsed } : r)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось сохранить индекс сортировки");
    } finally {
      setSortSavingId(null);
    }
  };

  const manufacturerOptions = [
    "Все поставщики",
    ...new Set(
      (manufacturers.length > 0 ? manufacturers.map((m) => m.name) : sourceList.map((row) => row.manufacturer))
        .filter(Boolean)
    ),
  ];
  const uniqueDiameters = [...new Set(sourceList.flatMap((row) => parseDiameters(row.diameters)).filter((s) => /^\d+$/.test(s)))].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const diameterOptions = ["Все", ...uniqueDiameters];

  const coefficientsFromCatalog = uniqueCoefficientsFromRows(sourceList);
  const coefFilterSet = new Set(coefficientsFromCatalog);
  if (coefFilter !== "Все" && !coefFilterSet.has(coefFilter)) coefFilterSet.add(coefFilter);
  const coefFilterOptions = ["Все", ...sortCoefficientStrings([...coefFilterSet])];
  const coefficientOptionsForBulk =
    coefficientsFromCatalog.length > 0 ? ["Все", ...coefficientsFromCatalog] : COEFFICIENT_BULK_FALLBACK;

  const manufacturersByName = useMemo(() => {
    const m = new Map<string, ManufacturerItem>();
    for (const it of manufacturers) m.set(it.name, it);
    return m;
  }, [manufacturers]);
  const getManufacturer = (manufacturerName: string) => manufacturersByName.get(manufacturerName);
  const getCountry = (manufacturerName: string) =>
    getManufacturer(manufacturerName)?.country?.name ?? "—";
  const getManufacturerImageUrl = (manufacturerName: string) =>
    getManufacturer(manufacturerName)?.image_url ?? null;

  return (
    <div className="max-w-7xl animate-slide-in space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {title}
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {subtitle}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={() => setTransposeOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
            }}
          >
            <span aria-hidden>⇄</span>
            <span>Калькулятор транспозиции</span>
          </button>
          {user?.is_admin && (
            <>
              <Link
                to={`${basePath}/new`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: "var(--accent)" }}
              >
                <span>+ Добавить элемент прайслиста</span>
              </Link>
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: "var(--purple)" }}
              >
                <span>+ Массовое создание</span>
              </button>
            </>
          )}
        </div>
      </div>

      {bulkOpen && isAdmin && (
        <div
          className="rounded-2xl p-5"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
          }}
        >
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Массовое создание карточек прайслиста
              </span>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Заполните таблицу и нажмите «Создать карточки»
              </span>
            </div>
            <button
              type="button"
              onClick={() => setBulkOpen(false)}
              className="text-sm font-medium px-3 py-2 rounded-xl transition-colors"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}
            >
              Закрыть
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-xs">
              <thead>
                <tr style={{ background: "rgba(0,0,0,0.03)" }}>
                  <th className="py-2 px-2 text-left" style={{ color: "var(--text-secondary)" }}>Производитель</th>
                  <th className="py-2 px-2 text-left" style={{ color: "var(--text-secondary)" }}>Название линзы</th>
                  <th className="py-2 px-2 text-left" style={{ color: "var(--text-secondary)" }}>Группа</th>
                  <th className="py-2 px-2 text-left" style={{ color: "var(--text-secondary)" }}>Коэф.</th>
                  <th className="py-2 px-2 text-left" style={{ color: "var(--text-secondary)" }}>Цена</th>
                  <th className="py-2 px-2 text-left" style={{ color: "var(--text-secondary)" }}>SPH</th>
                  <th className="py-2 px-2 text-left" style={{ color: "var(--text-secondary)" }}>CYL</th>
                  <th className="py-2 px-2 text-left" style={{ color: "var(--text-secondary)" }}>Шаг</th>
                  <th className="py-2 px-2 text-left" style={{ color: "var(--text-secondary)" }}>Ø (мм)</th>
                  <th className="py-2 px-2 text-left" style={{ color: "var(--text-secondary)" }}>Удалить</th>
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((r) => (
                  <tr key={r.key}>
                    <td className="py-2 px-2">
                      <select
                        value={r.manufacturer_id === "" ? "" : String(r.manufacturer_id)}
                        onChange={(e) => updateBulkRow(r.key, { manufacturer_id: e.target.value === "" ? "" : Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                      >
                        <option value="">—</option>
                        {manufacturers.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        value={r.lens_name}
                        onChange={(e) => updateBulkRow(r.key, { lens_name: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                        placeholder="Напр. Air Wear 1.5"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <select
                        value={r.group}
                        onChange={(e) => updateBulkRow(r.key, { group: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                      >
                        {groupOptionsForBulk.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <select
                        value={r.coefficient}
                        onChange={(e) => updateBulkRow(r.key, { coefficient: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                      >
                        {coefficientOptionsForBulk.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        value={r.price}
                        onChange={(e) => updateBulkRow(r.key, { price: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                        placeholder="3200"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        value={r.sph}
                        onChange={(e) => updateBulkRow(r.key, { sph: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                        placeholder="−6 … −2, 0 … +2"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        value={r.cyl}
                        onChange={(e) => updateBulkRow(r.key, { cyl: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                        placeholder="−0.25, −0.5"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        value={r.step}
                        onChange={(e) => updateBulkRow(r.key, { step: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                        placeholder="0.25"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        value={r.diameters}
                        onChange={(e) => updateBulkRow(r.key, { diameters: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                        placeholder="65, 70, 75 мм"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <button
                        type="button"
                        onClick={() => removeBulkRow(r.key)}
                        disabled={bulkRows.length <= 1}
                        className="px-2 py-2 rounded-xl text-xs font-medium transition-opacity"
                        style={{
                          background: "var(--error-light)",
                          color: "var(--error)",
                          border: "1px solid var(--error)",
                          opacity: bulkRows.length <= 1 ? 0.6 : 1,
                          cursor: bulkRows.length <= 1 ? "not-allowed" : "pointer",
                        }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-4 mt-4">
            <button
              type="button"
              onClick={addBulkRow}
              className="text-sm font-medium px-4 py-2 rounded-xl transition-colors"
              style={{ color: "var(--accent)", border: "1px solid var(--border-color)" }}
            >
              + Добавить строку
            </button>
            <button
              type="button"
              onClick={handleBulkCreate}
              disabled={bulkCreating}
              className="text-sm font-semibold px-5 py-2.5 rounded-xl transition-opacity disabled:opacity-60"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {bulkCreating ? "Создаем..." : "Создать карточки"}
            </button>
          </div>
        </div>
      )}

      {/* Фильтры */}
      <div
        className="rounded-2xl p-5"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
        }}
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Фильтры</span>
          {(groupFilter !== "Все группы" || coefFilter !== "Все" || diameterFilter !== "Все" || (isAdmin && manufacturerFilter !== "Все поставщики") || searchQuery.trim() !== "") && (
            <button
              type="button"
              onClick={() => {
                setSearchParams({});
              }}
              className="text-sm font-medium px-3 py-2 rounded-xl transition-colors"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.borderColor = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-secondary)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              Сбросить фильтры
            </button>
          )}
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
            Поиск по названию и описанию
          </label>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => applyFilters({ q: e.target.value })}
            placeholder="Например: 1.56 мультипокрытие, Essilor, торик…"
            autoComplete="off"
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
            }}
            aria-label="Поиск по прайслисту"
          />
          <p className="text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>
            Учитываются русские буквы (ё и е), можно несколько слов — найдутся позиции, где есть все слова. Работает и с цифрами вроде 1.56/1.55.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 flex-wrap">
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Группа
            </label>
            <select
              value={groupFilter}
              onChange={(e) => applyFilters({ group: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              {groupsForFilter.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[120px]">
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Индекс
            </label>
            <select
              value={coefFilter}
              onChange={(e) => applyFilters({ coef: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              {coefFilterOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[120px]">
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Диаметр
            </label>
            <select
              value={diameterFilter}
              onChange={(e) => applyFilters({ diameter: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              {diameterOptions.map((d) => (
                <option key={d} value={d}>{d === "Все" ? "Все" : `${d} мм`}</option>
              ))}
            </select>
          </div>
          {isAdmin && (
            <div className="min-w-[220px]">
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Поставщик
              </label>
              <select
                value={manufacturerFilter}
                onChange={(e) => applyFilters({ manufacturer: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                {manufacturerOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-8">
        {pricelistLoading ? (
          <div className="rounded-2xl py-16 text-center text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>
            Загрузка прайслиста…
          </div>
        ) : listToShow.length === 0 ? (
          <div className="rounded-2xl py-16 text-center text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>
            {pricelistLoadError
              ? "Не удалось загрузить прайслист. Обновите страницу или попробуйте позже."
              : pricelistFromApi.length === 0
                ? "В прайслисте пока нет позиций."
                : searchQuery.trim() !== "" && filteredByRefs.length > 0
                  ? "По этому запросу ничего не найдено. Попробуйте другие слова или сбросьте поиск и фильтры."
                  : "По выбранным фильтрам позиций не найдено."}
          </div>
        ) : (
          byGroup.filter(({ rows }) => rows.length > 0).map(({ name: groupName, rows }) => (
            <div
              key={groupName}
              id={pricelistSectionElementId(groupName)}
              className="space-y-4 scroll-mt-24"
              data-pricelist-section
              data-group-name={groupName}
            >
              {(() => {
                const totalRows = rows.length;
                const visibleRows = rows.slice(0, visibleRowsByGroup[groupName] ?? GROUP_VISIBLE_ROWS_INITIAL);
                const hasMoreRows = visibleRows.length < totalRows;
                return (
                  <>
              <div
                className="flex flex-wrap items-end justify-between gap-3 pb-2 border-b-2 w-full"
                style={{ borderColor: "var(--accent)" }}
              >
                <h2 className="text-xl font-semibold m-0" style={{ color: "var(--text-primary)" }}>
                  {groupName}
                </h2>
                {isAdmin && rows.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setPriceManageGroup(groupName)}
                    className="text-sm font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-opacity hover:opacity-90"
                    style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent)" }}
                  >
                    Управление ценами
                  </button>
                ) : null}
              </div>
              {(() => {
                const gMeta = groupMetaByName.get(groupName);
                const useTiles = gMeta?.display_as_tiles === true;
                const tileCols = Math.max(1, Math.min(48, gMeta?.tiles_per_page ?? 4));
                const showProperties = groupDisplayMap.get(normalizeGroupName(groupName)) ?? true;

                if (useTiles) {
                  return (
                    <>
                      <div
                        className="pricelist-tiles-grid"
                        style={{ ["--pricelist-tile-cols" as string]: String(tileCols) }}
                      >
                        {visibleRows.map((row) => (
                          <div
                            key={row.id}
                            className="rounded-xl p-4 flex flex-col h-full min-h-[200px] border transition-shadow hover:shadow-md"
                            style={{
                              background: "var(--bg-primary)",
                              borderColor: "var(--border)",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                            }}
                          >
                            <div className="font-bold text-lg leading-snug line-clamp-2 break-words" style={{ color: "var(--text-primary)" }}>
                              {row.lensName}
                            </div>
                            <div className="flex gap-2 mt-3 min-w-0">
                              {getManufacturerImageUrl(row.manufacturer) ? (
                                <img
                                  src={getManufacturerImageUrl(row.manufacturer)!}
                                  alt=""
                                  className="w-10 h-10 rounded-lg object-contain shrink-0"
                                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                                />
                              ) : null}
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{row.manufacturer}</div>
                                <div className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{getCountry(row.manufacturer)}</div>
                              </div>
                            </div>
                            {row.description ? (
                              <p className="text-sm mt-2 line-clamp-4 whitespace-pre-wrap flex-1 min-h-0" style={{ color: "var(--text-secondary)" }}>{row.description}</p>
                            ) : (
                              <div className="flex-1 min-h-[8px]" />
                            )}
                            {showProperties && (row.sph || row.cyl || row.step || row.diameters || (catalog === "mkl" && (row.material || row.coefficient))) ? (
                              <div className="text-[11px] mt-2 space-y-0.5 max-h-16 overflow-hidden" style={{ color: "var(--text-tertiary)" }}>
                                {row.sph ? <div className="truncate"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>SPH</span> {row.sph.replace(/\s+D\b/g, "")}</div> : null}
                                {row.cyl ? <div className="truncate"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>CYL</span> {row.cyl.replace(/\s+D\b/g, "")}</div> : null}
                                {row.step ? <div className="truncate"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Шаг</span> {row.step}</div> : null}
                                {row.diameters ? (
                                  <div className="truncate">
                                    <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>{catalog === "mkl" ? "Матриал/Влаг" : "Ø"}</span>{" "}
                                    {catalog === "mkl" ? row.diameters : row.diameters.replace(/\s*мм\s*/gi, "").trim()}
                                  </div>
                                ) : null}
                                {catalog === "mkl" && row.material ? <div className="truncate"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Режим замены</span> {row.material}</div> : null}
                                {catalog === "mkl" && row.coefficient ? <div className="truncate"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>ВС</span> {row.coefficient}</div> : null}
                              </div>
                            ) : null}
                            <div className="mt-auto pt-3 flex flex-wrap items-center justify-between gap-2 border-t" style={{ borderColor: "var(--border)" }}>
                              <div className="font-bold tabular-nums text-lg" style={{ color: row.is_promo ? "var(--error)" : "var(--text-primary)" }}>{formatPricelistPriceRub(row.price, row.priceFrom)}</div>
                              <div className="flex items-center gap-1.5">
                                {row.hideDetailLink ? (
                                  <button
                                    type="button"
                                    disabled
                                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 cursor-not-allowed"
                                    style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)", border: "1px solid var(--border)", opacity: 0.75 }}
                                    title="Переход в карточку отключен"
                                    aria-label="Переход в карточку отключен"
                                  >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                  </button>
                                ) : (
                                  <Link
                                    to={`${basePath}/${row.id}`}
                                    state={{
                                      fromPricelist: {
                                        pathname: location.pathname,
                                        search: location.search,
                                        hash: `#${encodeURIComponent(row.group.trim())}`,
                                      },
                                    }}
                                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg transition-all hover:opacity-90 shrink-0"
                                    style={{ background: "var(--accent)", color: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
                                    title="Подробнее"
                                    aria-label="Подробнее"
                                  >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                  </Link>
                                )}
                                {isAdmin && (
                                  <>
                                    <input
                                      type="number"
                                      defaultValue={row.sortIndex}
                                      onClick={(e) => e.stopPropagation()}
                                      onBlur={(e) => {
                                        void handleSortIndexUpdate(row.id, e.currentTarget.value, row.sortIndex);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          (e.currentTarget as HTMLInputElement).blur();
                                        }
                                      }}
                                      className="w-20 h-9 px-2 rounded-lg text-xs text-center"
                                      style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                                      title="Индекс сортировки"
                                      aria-label="Индекс сортировки"
                                      disabled={sortSavingId === row.id}
                                    />
                                    <Link
                                      to={`${basePath}/${row.id}/edit`}
                                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg transition-all hover:opacity-90 shrink-0"
                                      style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                                      title="Изменить"
                                      aria-label="Изменить"
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(row.id, row.lensName)}
                                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg transition-all hover:opacity-90 shrink-0"
                                      style={{ background: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}
                                      title="Удалить"
                                      aria-label="Удалить"
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                }

                return (
              <div className="space-y-0">
                {visibleRows.map((row) => (
            <div
              key={row.id}
              className="rounded-2xl p-5 sm:p-6 mb-4 last:mb-0 w-full transition-shadow hover:shadow-md"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              <div className="w-full min-w-0 mb-3 md:mb-4">
                <div
                  className="font-bold leading-snug w-full break-words"
                  style={{ color: "var(--text-primary)", fontSize: "25px" }}
                >
                  {row.lensName}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[280px_1fr_120px] lg:grid-cols-[320px_1fr_120px] w-full gap-x-4 lg:gap-x-6 gap-y-4 items-start text-xs">
                {/* Бренд + описание */}
                <div className="min-w-0 flex items-start gap-1.5 lg:gap-2 max-w-full">
                  <div className="flex flex-col items-start gap-2 shrink-0 max-w-[130px]">
                    {getManufacturerImageUrl(row.manufacturer) ? (
                      <img
                        src={getManufacturerImageUrl(row.manufacturer)!}
                        alt={row.manufacturer}
                        className="w-12 h-12 rounded-xl object-contain shrink-0"
                        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                      />
                    ) : null}
                    <div className="min-w-0 w-full">
                      <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{row.manufacturer}</div>
                      <div className="text-xs truncate mt-1" style={{ color: "var(--text-secondary)" }}>{getCountry(row.manufacturer)}</div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5 pl-4 lg:pl-5">
                    <p className="leading-relaxed whitespace-pre-wrap" style={{ fontSize: "15px", color: "var(--text-secondary)" }}>{row.description}</p>
                  </div>
                </div>
                {/* Параметры: подписи ровно над значениями, разделители между колонками */}
                {showProperties && (
                  <div className="min-w-0 py-2 px-4 rounded-xl">
                    <div className={`grid ${catalog === "mkl" ? "grid-cols-6 gap-x-3 lg:gap-x-4" : "grid-cols-4 gap-x-6 lg:gap-x-10"}`}>
                      <div className="min-w-0 flex flex-col items-center gap-1 w-full text-center">
                        <span className="text-sm font-semibold uppercase tracking-wider shrink-0 px-2 py-0.5 rounded border border-b-2 inline-block" style={{ color: "var(--text-primary)", borderColor: "var(--accent)" }}>SPH</span>
                        <div className="w-full flex justify-center"><ValuesColumn value={row.sph} className="text-base" /></div>
                      </div>
                      <div className="min-w-0 flex flex-col items-center gap-1 w-full text-center">
                        <span className="text-sm font-semibold uppercase tracking-wider shrink-0 px-2 py-0.5 rounded border border-b-2 inline-block" style={{ color: "var(--text-primary)", borderColor: "var(--accent)" }}>CYL</span>
                        <div className="w-full flex justify-center"><ValuesColumn value={row.cyl} className="text-base" /></div>
                      </div>
                      <div className="min-w-0 flex flex-col items-center gap-1 w-full text-center">
                        <span className="text-sm font-semibold uppercase tracking-wider shrink-0 px-2 py-0.5 rounded border border-b-2 inline-block" style={{ color: "var(--text-primary)", borderColor: "var(--accent)" }}>Шаг</span>
                        <div className="w-full flex justify-center"><ValuesColumn value={row.step} className="text-base" /></div>
                      </div>
                      <div className="min-w-0 flex flex-col items-center gap-1 w-full text-center">
                        <span className="text-sm font-semibold uppercase tracking-wider shrink-0 px-2 py-0.5 rounded border border-b-2 inline-block" style={{ color: "var(--text-primary)", borderColor: "var(--accent)" }}>{catalog === "mkl" ? "Матриал/Влаг" : "Ø"}</span>
                        <div className="w-full flex justify-center"><ValuesColumn value={row.diameters} className="text-base" /></div>
                      </div>
                      {catalog === "mkl" ? (
                        <>
                          <div className="min-w-0 flex flex-col items-center gap-1 w-full text-center">
                            <span className="text-sm font-semibold uppercase tracking-wider shrink-0 px-2 py-0.5 rounded border border-b-2 inline-block" style={{ color: "var(--text-primary)", borderColor: "var(--accent)" }}>Режим замены</span>
                            <div className="w-full flex justify-center"><ValuesColumn value={row.material ?? ""} className="text-base" /></div>
                          </div>
                          <div className="min-w-0 flex flex-col items-center gap-1 w-full text-center">
                            <span className="text-sm font-semibold uppercase tracking-wider shrink-0 px-2 py-0.5 rounded border border-b-2 inline-block" style={{ color: "var(--text-primary)", borderColor: "var(--accent)" }}>ВС</span>
                            <div className="w-full flex justify-center"><ValuesColumn value={row.coefficient} className="text-base" /></div>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                )}
                {/* Цена и кнопки */}
                <div className="min-w-0 flex flex-col gap-1 items-start md:items-end shrink-0 self-start w-[120px]">
                  <div className="font-bold tabular-nums leading-tight whitespace-nowrap h-7 flex items-center justify-end" style={{ color: row.is_promo ? "var(--error)" : "var(--text-primary)", fontSize: "22px" }}>{formatPricelistPriceRub(row.price, row.priceFrom)}</div>
                  <div className="flex items-center gap-1.5">
                    {row.hideDetailLink ? (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center justify-center w-10 h-10 rounded-xl shrink-0 flex-shrink-0 cursor-not-allowed"
                        style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)", border: "1px solid var(--border)", opacity: 0.75 }}
                        title="Переход в карточку отключен"
                        aria-label="Переход в карточку отключен"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                      </button>
                    ) : (
                      <Link
                        to={`${basePath}/${row.id}`}
                        state={{
                          fromPricelist: {
                            pathname: location.pathname,
                            search: location.search,
                            hash: `#${encodeURIComponent(row.group.trim())}`,
                          },
                        }}
                        className="inline-flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:opacity-90 shrink-0 flex-shrink-0"
                        style={{ background: "var(--accent)", color: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
                        title="Подробнее"
                        aria-label="Подробнее"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                      </Link>
                    )}
                    {isAdmin && (
                      <>
                        <input
                          type="number"
                          defaultValue={row.sortIndex}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => {
                            void handleSortIndexUpdate(row.id, e.currentTarget.value, row.sortIndex);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.currentTarget as HTMLInputElement).blur();
                            }
                          }}
                          className="w-20 h-10 px-2 rounded-xl text-sm text-center"
                          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                          title="Индекс сортировки"
                          aria-label="Индекс сортировки"
                          disabled={sortSavingId === row.id}
                        />
                        <Link
                          to={`${basePath}/${row.id}/edit`}
                          className="inline-flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:opacity-90 shrink-0 flex-shrink-0"
                          style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                          title="Изменить"
                          aria-label="Изменить"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(row.id, row.lensName)}
                          className="inline-flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:opacity-90 shrink-0 flex-shrink-0"
                          style={{ background: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}
                          title="Удалить"
                          aria-label="Удалить"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
                ))}
              </div>
                );
              })()}
              {hasMoreRows ? (
                <div className="pt-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                    onClick={() =>
                      setVisibleRowsByGroup((prev) => ({
                        ...prev,
                        [groupName]: Math.min(totalRows, (prev[groupName] ?? GROUP_VISIBLE_ROWS_INITIAL) + GROUP_VISIBLE_ROWS_STEP),
                      }))
                    }
                  >
                    Показать еще ({totalRows - visibleRows.length})
                  </button>
                </div>
              ) : null}
                  </>
                );
              })()}
            </div>
          ))
        )}
      </div>

      {priceManageGroup ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => {
            if (!priceBulkSaving) setPriceManageGroup(null);
          }}
          role="presentation"
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-xl"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pricelist-price-manage-title"
          >
            <div className="px-4 py-3 sm:px-5 sm:py-4 flex flex-wrap items-start justify-between gap-2 border-b" style={{ borderColor: "var(--border)" }}>
              <div>
                <h2 id="pricelist-price-manage-title" className="text-lg font-bold m-0" style={{ color: "var(--text-primary)" }}>
                  Управление ценами
                </h2>
                <p className="text-sm m-0 mt-1" style={{ color: "var(--text-secondary)" }}>
                  Группа «{priceManageGroup}» — {priceManageRowsAll.length}{" "}
                  {priceManageRowsAll.length === 1 ? "позиция" : priceManageRowsAll.length < 5 ? "позиции" : "позиций"}
                </p>
              </div>
              <button
                type="button"
                disabled={priceBulkSaving}
                className="text-sm px-2 py-1 rounded-lg"
                style={{ color: "var(--text-secondary)" }}
                onClick={() => setPriceManageGroup(null)}
              >
                Закрыть
              </button>
            </div>
            <div className="overflow-auto flex-1 min-h-0 px-2 sm:px-4 py-3">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                    <th className="text-left p-2 font-medium">Наименование</th>
                    <th className="text-left p-2 font-medium hidden sm:table-cell">Поставщик</th>
                    <th className="text-left p-2 font-medium w-24">Коэф.</th>
                    <th className="text-right p-2 font-medium w-32">Цена, ₽</th>
                    <th className="text-center p-2 font-medium w-20">«От»</th>
                    <th className="text-left p-2 font-medium">Цены штрихкодов</th>
                  </tr>
                </thead>
                <tbody>
                  {priceManageRowsAll.map((row) => {
                    const d = priceDraft[row.id];
                    return (
                      <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="p-2 align-middle" style={{ color: "var(--text-primary)" }}>
                          <div className="font-medium">{row.lensName}</div>
                          <div className="text-xs sm:hidden mt-0.5" style={{ color: "var(--text-secondary)" }}>
                            {row.manufacturer}
                          </div>
                        </td>
                        <td className="p-2 align-middle hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>
                          {row.manufacturer}
                        </td>
                        <td className="p-2 align-middle" style={{ color: "var(--text-secondary)" }}>
                          {row.coefficient || "—"}
                        </td>
                        <td className="p-2 align-middle text-right">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={d?.priceStr ?? ""}
                            onChange={(e) =>
                              setPriceDraft((prev) => ({
                                ...prev,
                                [row.id]: {
                                  priceStr: e.target.value,
                                  priceFrom: prev[row.id]?.priceFrom ?? !!row.priceFrom,
                                  barcodePriceStrs: prev[row.id]?.barcodePriceStrs ?? [],
                                },
                              }))
                            }
                            className="w-full max-w-[9rem] ml-auto block px-2 py-1.5 rounded-lg text-right tabular-nums"
                            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                            disabled={priceBulkSaving}
                          />
                        </td>
                        <td className="p-2 align-middle text-center">
                          <input
                            type="checkbox"
                            checked={d?.priceFrom ?? false}
                            onChange={(e) =>
                              setPriceDraft((prev) => ({
                                ...prev,
                                [row.id]: {
                                  priceStr: prev[row.id]?.priceStr ?? (Number.isFinite(row.price) ? String(row.price) : ""),
                                  priceFrom: e.target.checked,
                                  barcodePriceStrs: prev[row.id]?.barcodePriceStrs ?? [],
                                },
                              }))
                            }
                            disabled={priceBulkSaving}
                            title="Цена «от»"
                            aria-label="Цена от"
                          />
                        </td>
                        <td className="p-2 align-middle">
                          {row.barcodes.length === 0 ? (
                            <span style={{ color: "var(--text-tertiary)" }}>—</span>
                          ) : (
                            <div className="space-y-1">
                              {row.barcodes.map((bc, idx) => (
                                <div key={`${row.id}-${bc.code}-${idx}`} className="flex items-center gap-2">
                                  <span className="text-xs min-w-[10rem] truncate" style={{ color: "var(--text-secondary)" }} title={bc.code}>
                                    {bc.code}
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={d?.barcodePriceStrs?.[idx] ?? ""}
                                    onChange={(e) =>
                                      setPriceDraft((prev) => {
                                        const cur = prev[row.id] ?? {
                                          priceStr: Number.isFinite(row.price) ? String(row.price) : "",
                                          priceFrom: !!row.priceFrom,
                                          barcodePriceStrs: (row.barcodes ?? []).map((b) => (b.price == null ? "" : String(b.price))),
                                        };
                                        const nextBarcodePriceStrs = [...(cur.barcodePriceStrs ?? [])];
                                        nextBarcodePriceStrs[idx] = e.target.value;
                                        return {
                                          ...prev,
                                          [row.id]: { ...cur, barcodePriceStrs: nextBarcodePriceStrs },
                                        };
                                      })
                                    }
                                    className="w-full max-w-[7rem] px-2 py-1 rounded-lg text-right tabular-nums"
                                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                                    disabled={priceBulkSaving}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div
              className="px-4 py-3 sm:px-5 flex flex-wrap justify-end gap-2 border-t"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                type="button"
                disabled={priceBulkSaving}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
                onClick={() => setPriceManageGroup(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={priceBulkSaving}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: "var(--accent)", opacity: priceBulkSaving ? 0.7 : 1 }}
                onClick={() => void savePriceManage()}
              >
                {priceBulkSaving ? "Сохранение…" : "Сохранить изменения"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <LensTranspositionDrawer open={transposeOpen} onClose={() => setTransposeOpen(false)} />
    </div>
  );
}
