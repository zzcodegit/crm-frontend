import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { ManufacturerItem, PricelistGroupItem } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { apiItemToRow, type PricelistRow } from "./Pricelist";
import {
  pricelistBasePathFromPathname,
  pricelistCatalogFromBasePath,
  type PricelistBasePath,
} from "../utils/pricelistRoutes";

const GROUP_ORDER_FALLBACK = ["Однофокальные", "Прогрессивные", "Торические"];

const PAGE_TITLES: Record<PricelistBasePath, string> = {
  "/pricelist": "Прайс склад",
  "/pricelist-rx": "RX",
  "/pricelist-mkl": "МКЛ",
};

type BarcodePriceDraftItem = { code: string; priceStr: string; description?: string | null };
type BarcodePriceDraftSection = { name: string | null; items: BarcodePriceDraftItem[] };
type RowPriceDraft = { priceStr: string; priceFrom: boolean; barcodeSections: BarcodePriceDraftSection[] };

function draftFromRow(row: PricelistRow): RowPriceDraft {
  return {
    priceStr: Number.isFinite(row.price) ? String(row.price) : "",
    priceFrom: !!row.priceFrom,
    barcodeSections: row.barcodeSections.map((sec) => ({
      name: sec.name,
      items: sec.items.map((b) => ({
        code: b.code,
        priceStr: b.price == null ? "" : String(b.price),
        description: b.description,
      })),
    })),
  };
}

function rowHasBarcodes(row: PricelistRow): boolean {
  return row.barcodeSections.some((sec) => sec.items.length > 0);
}

export default function PricelistPriceManage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.is_admin === true;

  const basePath = pricelistBasePathFromPathname(location.pathname);
  const catalog = pricelistCatalogFromBasePath(basePath);
  const plApi = catalog === "rx" ? api.pricelistRx : catalog === "mkl" ? api.pricelistMkl : api.pricelist;
  const plRef = catalog === "rx" ? api.ref.pricelistRx : catalog === "mkl" ? api.ref.pricelistMkl : api.ref.pricelist;
  const plGroupsApi =
    catalog === "rx" ? api.ref.pricelistRxGroups : catalog === "mkl" ? api.ref.pricelistMklGroups : api.ref.pricelistGroups;
  const pageTitle = PAGE_TITLES[basePath];

  const selectedGroup = searchParams.get("group") ?? "";

  const [manufacturers, setManufacturers] = useState<ManufacturerItem[]>([]);
  const [groupsList, setGroupsList] = useState<PricelistGroupItem[]>([]);
  const [rows, setRows] = useState<PricelistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [priceDraft, setPriceDraft] = useState<Record<number, RowPriceDraft>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    Promise.all([
      plApi.list(),
      api.ref.manufacturers.list().catch(() => [] as ManufacturerItem[]),
      plGroupsApi.list().catch(() => [] as PricelistGroupItem[]),
    ])
      .then(([items, mfrs, groups]) => {
        if (cancelled) return;
        setManufacturers(mfrs);
        setGroupsList(groups);
        setRows(items.map((item) => apiItemToRow(item)));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, plApi, plGroupsApi, catalog]);

  const groupOptions = useMemo(() => {
    const order = groupsList.length > 0 ? groupsList.map((g) => g.name) : GROUP_ORDER_FALLBACK;
    const inData = new Set(rows.map((r) => r.group));
    const out = [...order];
    for (const g of inData) {
      if (!out.includes(g)) out.push(g);
    }
    return out.filter((g) => inData.has(g));
  }, [groupsList, rows]);

  const groupRows = useMemo(() => {
    if (!selectedGroup) return [];
    const raw = rows.filter((r) => r.group === selectedGroup);
    const mfrNames = new Set(manufacturers.map((m) => m.name));
    const filtered = raw.filter((r) => mfrNames.has(r.manufacturer));
    const order = new Map(manufacturers.map((m, i) => [m.name, i]));
    return [...filtered].sort((a, b) => {
      if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
      const ma = order.get(a.manufacturer) ?? 999;
      const mb = order.get(b.manufacturer) ?? 999;
      if (ma !== mb) return ma - mb;
      return a.id - b.id;
    });
  }, [selectedGroup, rows, manufacturers]);

  useEffect(() => {
    const next: Record<number, RowPriceDraft> = {};
    for (const r of groupRows) {
      next[r.id] = draftFromRow(r);
    }
    setPriceDraft(next);
  }, [groupRows]);

  const setGroup = (group: string) => {
    if (!group) setSearchParams({});
    else setSearchParams({ group });
  };

  const savePrices = async () => {
    if (!selectedGroup) return;
    const updates: {
      id: number;
      price: number;
      price_from: boolean;
      barcode_sections?: { name?: string | null; items: { code: string; price?: number; description?: string }[] }[];
    }[] = [];
    for (const r of groupRows) {
      const d = priceDraft[r.id];
      if (!d) continue;
      const parsed = Number.parseFloat(String(d.priceStr ?? "").trim().replace(",", "."));
      if (!Number.isFinite(parsed)) {
        alert(`Укажите корректную цену для «${r.lensName}»`);
        return;
      }
      const pf = d.priceFrom;
      let barcodeChanged = false;
      const nextSections: { name?: string | null; items: { code: string; price?: number; description?: string }[] }[] =
        [];
      let barcodeInvalid = false;
      for (let si = 0; si < d.barcodeSections.length; si += 1) {
        const draftSec = d.barcodeSections[si]!;
        const origSec = r.barcodeSections[si];
        const sectionItems: { code: string; price?: number; description?: string }[] = [];
        for (let i = 0; i < draftSec.items.length; i += 1) {
          const draftItem = draftSec.items[i]!;
          const origItem = origSec?.items[i];
          const raw = (draftItem.priceStr ?? "").trim();
          if (raw === "") {
            if (origItem?.price != null) barcodeChanged = true;
            sectionItems.push({ code: draftItem.code, description: draftItem.description ?? undefined });
            continue;
          }
          const parsedBarcodePrice = Number.parseFloat(raw.replace(",", "."));
          if (!Number.isFinite(parsedBarcodePrice)) {
            const label = draftSec.name ? `«${draftSec.name}» / ${draftItem.code}` : draftItem.code;
            alert(`Укажите корректную цену штрихкода ${label} для «${r.lensName}»`);
            barcodeInvalid = true;
            break;
          }
          if (origItem?.price == null || Math.abs(parsedBarcodePrice - origItem.price) > 1e-6) {
            barcodeChanged = true;
          }
          sectionItems.push({
            code: draftItem.code,
            price: parsedBarcodePrice,
            description: draftItem.description ?? undefined,
          });
        }
        if (barcodeInvalid) break;
        if ((origSec?.name ?? null) !== (draftSec.name ?? null)) barcodeChanged = true;
        nextSections.push({ name: draftSec.name, items: sectionItems });
      }
      if (barcodeInvalid) return;
      if (parsed !== r.price || pf !== !!r.priceFrom || barcodeChanged) {
        updates.push({
          id: r.id,
          price: parsed,
          price_from: pf,
          ...(barcodeChanged ? { barcode_sections: nextSections } : {}),
        });
      }
    }
    if (updates.length === 0) {
      navigateBack();
      return;
    }
    setSaving(true);
    try {
      for (const u of updates) {
        await plRef.update(u.id, {
          price: u.price,
          price_from: u.price_from,
          ...(u.barcode_sections ? { barcode_sections: u.barcode_sections } : {}),
        });
      }
      navigateBack();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка сохранения цен");
    } finally {
      setSaving(false);
    }
  };

  const navigateBack = () => {
    const hash = selectedGroup ? `#${encodeURIComponent(selectedGroup)}` : "";
    navigate({ pathname: basePath, hash });
  };

  if (!isAdmin) {
    return <Navigate to={basePath} replace />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-8 animate-slide-in">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link to={basePath} className="hover:underline" style={{ color: "var(--text-secondary)" }}>
          {pageTitle}
        </Link>
        <span style={{ color: "var(--text-tertiary)" }}>/</span>
        <span style={{ color: "var(--text-primary)" }}>Управление ценами</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold m-0" style={{ color: "var(--text-primary)" }}>
            Управление ценами
          </h1>
          <p className="text-sm m-0 mt-1" style={{ color: "var(--text-secondary)" }}>
            Выберите группу и отредактируйте цены позиций прайса.
          </p>
        </div>
        <Link
          to={basePath}
          className="text-sm font-medium px-3 py-2 rounded-lg shrink-0"
          style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
        >
          ← К прайсу
        </Link>
      </div>

      <div
        className="rounded-2xl border p-4 sm:p-5 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
      >
        <label className="block text-sm max-w-md">
          <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
            Группа прайса
          </span>
          <select
            value={selectedGroup}
            onChange={(e) => setGroup(e.target.value)}
            disabled={loading || saving}
            className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              appearance: "auto",
            }}
          >
            <option value="">— Выберите группу —</option>
            {groupOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        {loadError ? (
          <div
            className="p-4 rounded-xl text-sm"
            style={{ background: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}
          >
            {loadError}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Загрузка…
          </p>
        ) : !selectedGroup ? (
          <p className="text-sm py-6 text-center rounded-xl border border-dashed" style={{ color: "var(--text-tertiary)", borderColor: "var(--border)" }}>
            Выберите группу, чтобы увидеть и изменить цены.
          </p>
        ) : groupRows.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: "var(--text-secondary)" }}>
            В группе «{selectedGroup}» нет позиций для редактирования.
          </p>
        ) : (
          <>
            <p className="text-sm m-0" style={{ color: "var(--text-secondary)" }}>
              Группа «{selectedGroup}» — {groupRows.length}{" "}
              {groupRows.length === 1 ? "позиция" : groupRows.length < 5 ? "позиции" : "позиций"}
            </p>
            <div
              className="rounded-xl border overflow-hidden flex flex-col"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="overflow-auto max-h-[calc(100vh-20rem)]">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 z-10" style={{ background: "var(--bg-secondary)" }}>
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
                    {groupRows.map((row) => {
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
                                    ...(prev[row.id] ?? draftFromRow(row)),
                                    priceStr: e.target.value,
                                  },
                                }))
                              }
                              className="w-full max-w-[9rem] ml-auto block px-2 py-1.5 rounded-lg text-right tabular-nums"
                              style={{
                                background: "var(--bg-secondary)",
                                border: "1px solid var(--border)",
                                color: "var(--text-primary)",
                              }}
                              disabled={saving}
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
                                    ...(prev[row.id] ?? draftFromRow(row)),
                                    priceFrom: e.target.checked,
                                  },
                                }))
                              }
                              disabled={saving}
                              title="Цена «от»"
                              aria-label="Цена от"
                            />
                          </td>
                          <td className="p-2 align-middle">
                            {!rowHasBarcodes(row) ? (
                              <span style={{ color: "var(--text-tertiary)" }}>—</span>
                            ) : (
                              <div className="space-y-2 min-w-[14rem]">
                                {(d?.barcodeSections ?? []).map((sec, si) => (
                                  <div key={`${row.id}-sec-${si}`} className="space-y-1">
                                    {sec.name ? (
                                      <div
                                        className="text-xs font-semibold px-2 py-0.5 rounded-md w-fit"
                                        style={{
                                          background: "var(--accent-light)",
                                          color: "var(--accent)",
                                          border: "1px solid var(--accent)",
                                        }}
                                      >
                                        {sec.name}
                                      </div>
                                    ) : null}
                                    {sec.items.map((bc, idx) => (
                                      <div
                                        key={`${row.id}-${si}-${bc.code}-${idx}`}
                                        className="flex items-center gap-2"
                                      >
                                        <span
                                          className="text-xs min-w-[8rem] truncate"
                                          style={{ color: "var(--text-secondary)" }}
                                          title={bc.code}
                                        >
                                          {bc.code}
                                        </span>
                                        <input
                                          type="number"
                                          min={0}
                                          step={0.01}
                                          value={bc.priceStr}
                                          onChange={(e) =>
                                            setPriceDraft((prev) => {
                                              const cur = prev[row.id] ?? draftFromRow(row);
                                              const nextSections = cur.barcodeSections.map((s, sIdx) =>
                                                sIdx !== si
                                                  ? s
                                                  : {
                                                      ...s,
                                                      items: s.items.map((item, iIdx) =>
                                                        iIdx !== idx ? item : { ...item, priceStr: e.target.value }
                                                      ),
                                                    }
                                              );
                                              return { ...prev, [row.id]: { ...cur, barcodeSections: nextSections } };
                                            })
                                          }
                                          className="w-full max-w-[7rem] px-2 py-1 rounded-lg text-right tabular-nums"
                                          style={{
                                            background: "var(--bg-secondary)",
                                            border: "1px solid var(--border)",
                                            color: "var(--text-primary)",
                                          }}
                                          disabled={saving}
                                        />
                                      </div>
                                    ))}
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
                className="px-4 py-3 flex flex-wrap justify-end gap-2 border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <button
                  type="button"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  onClick={navigateBack}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: "var(--accent)", opacity: saving ? 0.7 : 1 }}
                  onClick={() => void savePrices()}
                >
                  {saving ? "Сохранение…" : "Сохранить изменения"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
