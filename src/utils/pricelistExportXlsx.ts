import type { CustomFieldItem, FeatureItem, PricelistItemResponse } from "../api";

export type PricelistExportCatalog = "warehouse" | "rx" | "mkl";

function customFieldsForCatalog(fields: CustomFieldItem[], catalog: PricelistExportCatalog): CustomFieldItem[] {
  return fields
    .filter((f) => {
      if (!f.is_active) return false;
      if (catalog === "rx") return f.show_in_rx !== false;
      if (catalog === "mkl") return f.show_in_mkl !== false;
      return f.show_in_warehouse !== false;
    })
    .sort((a, b) => a.sort_index - b.sort_index || a.id - b.id);
}

function formatCustomFieldValue(field: CustomFieldItem, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (field.field_type === "checkbox") return Boolean(value) ? "Да" : "Нет";
  if (Array.isArray(value)) {
    if (field.field_type === "multi_select") {
      return value
        .map((v) => {
          const s = String(v).trim();
          if (!s.startsWith("{")) return s;
          try {
            const parsed = JSON.parse(s) as { id?: unknown; text?: unknown };
            const id = typeof parsed.id === "number" ? parsed.id : Number.NaN;
            const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
            const label = Number.isFinite(id)
              ? (field.options || []).find((o) => o.id === id)?.value
              : undefined;
            if (label && text) return `${label}: ${text}`;
            if (label) return label;
          } catch {
            /* ignore */
          }
          return s;
        })
        .filter(Boolean)
        .join("\n");
    }
    return value
      .map((v) => String(v).trim())
      .filter(Boolean)
      .join("\n");
  }
  return String(value).trim();
}

function formatBarcodes(item: PricelistItemResponse): string {
  const lines: string[] = [];
  const sections =
    item.barcode_sections && item.barcode_sections.length > 0
      ? item.barcode_sections
      : (item.barcodes ?? []).length > 0
        ? [{ name: null, items: item.barcodes ?? [] }]
        : item.barcode?.trim()
          ? [{ name: null, items: [{ code: item.barcode.trim(), price: null, description: null }] }]
          : [];

  for (const sec of sections) {
    const items = (sec.items ?? []).filter((b) => String(b.code ?? "").trim());
    if (items.length === 0) continue;
    const title = sec.name?.trim();
    if (title) lines.push(`[${title}]`);
    for (const b of items) {
      const parts = [b.code.trim()];
      if (b.price != null && Number.isFinite(Number(b.price))) parts.push(`${Number(b.price)} ₽`);
      if (b.description?.trim()) parts.push(b.description.trim());
      lines.push(parts.join(" | "));
    }
  }
  return lines.join("\n");
}

function formatFeatures(
  item: PricelistItemResponse,
  features: FeatureItem[],
  catalog: PricelistExportCatalog
): string {
  const parts: string[] = [];
  if (item.uv_protection) parts.push("UV-защита");
  const material = (item.material ?? "").trim();
  if (material && catalog !== "mkl") parts.push(`Материал: ${material}`);

  for (const fid of item.feature_ids ?? []) {
    const feat = features.find((f) => f.id === fid);
    if (!feat?.name) continue;
    const colors = item.feature_colors?.[String(fid)];
    const colorList = Array.isArray(colors) ? colors.filter(Boolean) : [];
    parts.push(colorList.length > 0 ? `${feat.name} (${colorList.join(", ")})` : feat.name);
  }
  return parts.join("; ");
}

function yesNo(v: boolean | undefined): string {
  return v ? "Да" : "Нет";
}

export async function exportPricelistToXlsx(opts: {
  items: PricelistItemResponse[];
  features: FeatureItem[];
  customFields: CustomFieldItem[];
  catalog: PricelistExportCatalog;
  fileNamePrefix: string;
}): Promise<void> {
  const { items, features, customFields, catalog, fileNamePrefix } = opts;
  const fields = customFieldsForCatalog(customFields, catalog);
  const XLSX = await import("xlsx");

  const fixedHeaders = [
    "ID",
    "Группа",
    "Производитель",
    "ID производителя",
    "Страна производителя",
    "Название линзы",
    "Краткое описание",
    "Полное описание",
    "Цена",
    "Цена «от»",
    "Акция",
    "UV-защита",
    "Материал",
    "Коэффициент",
    "Сортировка",
    "ID линзы (каталог)",
    "Sph",
    "Cyl",
    "Step",
    "Диаметры",
    "Особенности",
    "Штрихкоды",
    "Фото (URL)",
    "Скрыть ссылку на карточку",
    "Скрыть фото",
    "Калькулятор транспозиции",
    "Только администратору",
    "Изображение производителя (URL)",
  ];

  const customHeaders = fields.map((f) => f.label);
  const header = [...fixedHeaders, ...customHeaders];
  const data: (string | number)[][] = [header];

  const sorted = [...items].sort((a, b) => {
    const g = (a.group || "").localeCompare(b.group || "", "ru");
    if (g !== 0) return g;
    const si = (a.sort_index ?? 500) - (b.sort_index ?? 500);
    if (si !== 0) return si;
    return a.id - b.id;
  });

  for (const item of sorted) {
    const photos =
      item.photo_urls && item.photo_urls.length > 0
        ? item.photo_urls
        : item.photo_url
          ? [item.photo_url]
          : [];
    const row: (string | number)[] = [
      item.id,
      item.group ?? "",
      item.manufacturer_name ?? "",
      item.manufacturer_id ?? "",
      item.manufacturer_country_name ?? "",
      item.lens_name ?? "",
      item.description ?? "",
      item.full_description ?? "",
      Number(item.price),
      yesNo(item.price_from),
      yesNo(item.is_promo),
      yesNo(item.uv_protection),
      item.material ?? "",
      item.coefficient ?? "",
      item.sort_index ?? 500,
      item.lens_id ?? "",
      item.sph ?? "",
      item.cyl ?? "",
      item.step ?? "",
      item.diameters ?? "",
      formatFeatures(item, features, catalog),
      formatBarcodes(item),
      photos.join("\n"),
      yesNo(item.hide_detail_link),
      yesNo(item.hide_photo),
      yesNo(item.enable_transposition_calc),
      yesNo(item.admin_only),
      item.manufacturer_image_url ?? "",
    ];

    for (const field of fields) {
      row.push(formatCustomFieldValue(field, item.custom_values?.[field.code]));
    }
    data.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Прайслист");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${fileNamePrefix}_${stamp}.xlsx`);
}
