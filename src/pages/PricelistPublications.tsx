import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { PricelistItemResponse, PricelistPublicationJobItem } from "../api";

type Catalog = "warehouse" | "rx" | "mkl";
type Status = "pending" | "applied" | "failed" | "cancelled" | "all";

const catalogLabel: Record<Catalog, string> = {
  warehouse: "Склад",
  rx: "RX",
  mkl: "МКЛ",
};

const payloadFieldLabel: Record<string, string> = {
  manufacturer_id: "Производитель",
  lens_name: "Название линзы",
  description: "Краткое описание",
  full_description: "Полное описание",
  barcode: "Штрихкод",
  barcodes: "Штрихкоды",
  barcode_sections: "Группы штрихкодов",
  photo_url: "Фото",
  photo_urls: "Фото (список)",
  sph: "SPH",
  cyl: "CYL",
  step: "Шаг",
  diameters: "Диаметры",
  price: "Цена",
  sort_index: "Сортировка",
  price_from: "Цена от",
  is_promo: "Промо",
  uv_protection: "UV-защита",
  material: "Материал / влагосодержание",
  lens_id: "Линза",
  group: "Группа",
  coefficient: "Коэффициент / ВС",
  feature_ids: "Особенности",
  feature_colors: "Цвета особенностей",
  custom_values: "Пользовательские поля",
  hide_detail_link: "Скрыть ссылку на карточку",
  hide_photo: "Скрыть фото",
  enable_transposition_calc: "Транспозиция",
};

function formatPayloadValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value || "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every((v) => typeof v !== "object")) return value.map((v) => String(v)).join(", ");
    return `${value.length} элементов`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length === 0 ? "{}" : `${keys.length} полей`;
  }
  return String(value);
}

export default function PricelistPublications() {
  const [items, setItems] = useState<PricelistPublicationJobItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | "all">("all");
  const [status, setStatus] = useState<Status>("pending");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchName, setBatchName] = useState("");
  const [detailsJob, setDetailsJob] = useState<PricelistPublicationJobItem | null>(null);
  const [currentItem, setCurrentItem] = useState<PricelistItemResponse | null>(null);
  const [currentLoading, setCurrentLoading] = useState(false);
  const [currentError, setCurrentError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await api.ref.pricelistPublications.list({
        catalog: catalog === "all" ? undefined : catalog,
        status,
      });
      setItems(rows);
      setSelectedIds((prev) => prev.filter((id) => rows.some((r) => r.id === id)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [catalog, status]);

  const pendingCount = useMemo(() => items.filter((x) => x.status === "pending").length, [items]);
  const availableForBatch = useMemo(
    () => items.filter((x) => x.status === "pending" || x.status === "failed"),
    [items]
  );
  const batchGroups = useMemo(() => {
    const m = new Map<string, { code: string; name: string; items: PricelistPublicationJobItem[] }>();
    for (const row of items) {
      if (!row.batch_code) continue;
      if (!m.has(row.batch_code)) m.set(row.batch_code, { code: row.batch_code, name: row.batch_name || row.batch_code, items: [] });
      m.get(row.batch_code)!.items.push(row);
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [items]);

  useEffect(() => {
    if (!detailsJob || !detailsJob.target_item_id) {
      setCurrentItem(null);
      setCurrentError(null);
      setCurrentLoading(false);
      return;
    }
    const targetId = detailsJob.target_item_id;
    const catalogKind = detailsJob.catalog;
    setCurrentLoading(true);
    setCurrentError(null);
    const loadCurrent =
      catalogKind === "rx"
        ? api.pricelistRx.get(targetId)
        : catalogKind === "mkl"
          ? api.pricelistMkl.get(targetId)
          : api.pricelist.get(targetId);
    loadCurrent
      .then((row) => setCurrentItem(row))
      .catch(() => {
        setCurrentItem(null);
        setCurrentError("Текущая версия не найдена (возможно, это новая позиция).");
      })
      .finally(() => setCurrentLoading(false));
  }, [detailsJob]);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Управление версиями прайслистов</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Очередь отложенных публикаций и быстрый выпуск изменений.</p>
        </div>
        <Link to="/settings" className="text-sm" style={{ color: "var(--accent)" }}>К настройкам</Link>
      </div>
      <div className="rounded-xl p-4 flex flex-wrap gap-3 items-end" style={{ border: "1px solid var(--border)", background: "var(--bg-primary)" }}>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Каталог</label>
          <select value={catalog} onChange={(e) => setCatalog(e.target.value as Catalog | "all")} className="px-3 py-2 rounded-lg" style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}>
            <option value="all">Все</option>
            <option value="warehouse">Склад</option>
            <option value="rx">RX</option>
            <option value="mkl">МКЛ</option>
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Статус</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="px-3 py-2 rounded-lg" style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}>
            <option value="pending">В очереди</option>
            <option value="all">Все</option>
            <option value="applied">Опубликовано</option>
            <option value="failed">Ошибка</option>
            <option value="cancelled">Отменено</option>
          </select>
        </div>
        <button className="px-3 py-2 rounded-lg text-white" style={{ background: "var(--accent)" }} onClick={() => void load()} disabled={loading}>Обновить</button>
        <button
          className="px-3 py-2 rounded-lg"
          style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
          disabled={loading || pendingCount === 0}
          onClick={async () => {
            await api.ref.pricelistPublications.publishAllNow(catalog === "all" ? undefined : catalog);
            await load();
          }}
        >
          Опубликовать все сейчас
        </button>
        <button
          className="px-3 py-2 rounded-lg"
          style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
          disabled={loading || selectedIds.length === 0}
          onClick={async () => {
            if (!window.confirm(`Отменить выбранные публикации (${selectedIds.length})?`)) return;
            await api.ref.pricelistPublications.cancelMany(selectedIds);
            setSelectedIds([]);
            await load();
          }}
        >
          Отменить выбранные ({selectedIds.length})
        </button>
      </div>
      <div className="rounded-xl p-4 flex flex-wrap gap-3 items-end" style={{ border: "1px solid var(--border)", background: "var(--bg-primary)" }}>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Название версии</label>
          <input
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder="Например: Обновление май 2026"
            className="px-3 py-2 rounded-lg min-w-[260px]"
            style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
          />
        </div>
        <button
          className="px-3 py-2 rounded-lg"
          style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
          disabled={loading || selectedIds.length === 0 || !batchName.trim()}
          onClick={async () => {
            await api.ref.pricelistPublications.assignBatch({ job_ids: selectedIds, batch_name: batchName.trim() });
            setBatchName("");
            await load();
          }}
        >
          Создать версионный набор ({selectedIds.length})
        </button>
      </div>
      {batchGroups.length > 0 ? (
        <div className="rounded-xl p-4 space-y-2" style={{ border: "1px solid var(--border)", background: "var(--bg-primary)" }}>
          <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Версионные наборы</div>
          {batchGroups.map((b) => (
            <div key={b.code} className="flex items-center justify-between py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <div className="text-sm" style={{ color: "var(--text-primary)" }}>
                {b.name} ({b.items.length})
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1.5 rounded"
                  style={{ border: "1px solid var(--border)" }}
                  onClick={() => {
                    setStatus("all");
                    setSelectedIds([]);
                    setBatchName(b.name);
                    const byBatch = items
                      .filter((row) => row.batch_code === b.code)
                      .map((row) => row.id);
                    setSelectedIds(byBatch);
                  }}
                >
                  Показать внутри версии
                </button>
                <button
                  className="px-3 py-1.5 rounded"
                  style={{ border: "1px solid var(--border)" }}
                  disabled={loading || !b.items.some((x) => x.status === "pending" || x.status === "failed")}
                  onClick={async () => {
                    await api.ref.pricelistPublications.publishBatchNow(b.code);
                    await load();
                  }}
                >
                  Опубликовать версию сейчас
                </button>
                <button
                  className="px-3 py-1.5 rounded"
                  style={{ border: "1px solid var(--border)" }}
                  disabled={loading || !b.items.some((x) => x.status !== "applied")}
                  onClick={async () => {
                    if (!window.confirm(`Отменить версию «${b.name}»?`)) return;
                    await api.ref.pricelistPublications.cancelBatch(b.code);
                    await load();
                  }}
                >
                  Отменить версию
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--bg-primary)" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "var(--bg-secondary)" }}>
            <tr>
              <th className="text-left p-3">Выбор</th>
              <th className="text-left p-3">ID</th>
              <th className="text-left p-3">Каталог</th>
              <th className="text-left p-3">Версия</th>
              <th className="text-left p-3">Дата публикации</th>
              <th className="text-left p-3">Статус</th>
              <th className="text-left p-3">Позиция</th>
              <th className="text-left p-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(row.id)}
                    disabled={!availableForBatch.some((x) => x.id === row.id)}
                    onChange={(e) => {
                      setSelectedIds((prev) =>
                        e.target.checked
                          ? (prev.includes(row.id) ? prev : [...prev, row.id])
                          : prev.filter((x) => x !== row.id)
                      );
                    }}
                  />
                </td>
                <td className="p-3">{row.id}</td>
                <td className="p-3">{catalogLabel[row.catalog]}</td>
                <td className="p-3">{row.batch_name || "-"}</td>
                <td className="p-3">{new Date(row.publish_at).toLocaleString("ru-RU")}</td>
                <td className="p-3">{row.status}</td>
                <td className="p-3">{row.target_item_id ?? "-"}</td>
                <td className="p-3 flex gap-2">
                  <button
                    className="px-2 py-1 rounded"
                    style={{ border: "1px solid var(--border)" }}
                    onClick={() => setDetailsJob(row)}
                  >
                    Внутри
                  </button>
                  <button
                    className="px-2 py-1 rounded"
                    style={{ border: "1px solid var(--border)" }}
                    disabled={loading || (row.status !== "pending" && row.status !== "failed")}
                    onClick={async () => {
                      await api.ref.pricelistPublications.publishNow(row.id);
                      await load();
                    }}
                  >
                    Сейчас
                  </button>
                  <button
                    className="px-2 py-1 rounded"
                    style={{ border: "1px solid var(--border)" }}
                    disabled={loading || row.status === "applied"}
                    onClick={async () => {
                      await api.ref.pricelistPublications.cancel(row.id);
                      await load();
                    }}
                  >
                    Отменить
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="p-6 text-center" colSpan={8} style={{ color: "var(--text-secondary)" }}>
                  {loading ? "Загрузка..." : "Записей пока нет"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {detailsJob ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.35)" }}
          onClick={() => setDetailsJob(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[85vh] overflow-auto rounded-xl p-4"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                  Версия #{detailsJob.id} — содержимое изменений
                </div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Каталог: {catalogLabel[detailsJob.catalog]} · Статус: {detailsJob.status} · Позиция: {detailsJob.target_item_id ?? "-"}
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded"
                style={{ border: "1px solid var(--border)" }}
                onClick={() => setDetailsJob(null)}
              >
                Закрыть
              </button>
            </div>
            <pre
              className="hidden"
            >
              {JSON.stringify(detailsJob.payload_json ?? {}, null, 2)}
            </pre>
            <div className="space-y-3">
              <div
                className="rounded-lg p-3"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              >
                <div className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                  Сейчас vs Новая версия
                </div>
                {currentLoading ? (
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Загрузка текущей версии…</div>
                ) : currentError ? (
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{currentError}</div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="text-left py-1 pr-2" style={{ color: "var(--text-secondary)" }}>Поле</th>
                          <th className="text-left py-1 px-2" style={{ color: "var(--text-secondary)" }}>Сейчас</th>
                          <th className="text-left py-1 pl-2" style={{ color: "var(--text-secondary)" }}>Будет</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(
                          new Set([
                            ...Object.keys((currentItem ?? {}) as Record<string, unknown>),
                            ...Object.keys(detailsJob.payload_json ?? {}),
                          ])
                        )
                          .filter((key) => key !== "id")
                          .sort((a, b) => (payloadFieldLabel[a] || a).localeCompare(payloadFieldLabel[b] || b, "ru"))
                          .map((key) => {
                            const currentValue = (currentItem as unknown as Record<string, unknown> | null)?.[key];
                            const hasNewValue = Object.prototype.hasOwnProperty.call(detailsJob.payload_json ?? {}, key);
                            const nextValue = hasNewValue
                              ? (detailsJob.payload_json as Record<string, unknown>)[key]
                              : currentValue;
                            const changed = formatPayloadValue(currentValue) !== formatPayloadValue(nextValue);
                            return (
                              <tr key={key} style={{ borderTop: "1px solid var(--border)" }}>
                                <td className="py-1 pr-2 align-top" style={{ color: "var(--text-secondary)" }}>
                                  {payloadFieldLabel[key] || key}
                                </td>
                                <td className="py-1 px-2 align-top" style={{ color: "var(--text-primary)" }}>
                                  {formatPayloadValue(currentValue)}
                                </td>
                                <td className="py-1 pl-2 align-top" style={{ color: changed ? "var(--accent)" : "var(--text-primary)" }}>
                                  {formatPayloadValue(nextValue)}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div
                className="rounded-lg p-3"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              >
                <div className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                  Действие: <span style={{ color: "var(--text-primary)" }}>{detailsJob.action}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(detailsJob.payload_json ?? {}).map(([key, value]) => (
                    <div
                      key={key}
                      className="rounded-md px-3 py-2"
                      style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
                    >
                      <div className="text-[11px] mb-1" style={{ color: "var(--text-secondary)" }}>
                        {payloadFieldLabel[key] || key}
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>
                        {formatPayloadValue(value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <details
                className="rounded-lg p-3"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              >
                <summary className="cursor-pointer text-sm" style={{ color: "var(--text-primary)" }}>
                  Показать JSON
                </summary>
                <pre
                  className="text-xs whitespace-pre-wrap break-words p-3 rounded-lg overflow-auto mt-2"
                  style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                >
                  {JSON.stringify(detailsJob.payload_json ?? {}, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
