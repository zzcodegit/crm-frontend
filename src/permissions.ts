export type SectionKey =
  | "dashboard"
  | "orders"
  | "lensCatalog"
  | "drive"
  | "pricelist"
  | "pricelistRx"
  | "pricelistMkl"
  | "info"
  | "reports"
  | "training"
  | "normativeActs"
  | "chat"
  | "supplyTickets"
  | "tasks"
  | "scheduleManagement";

export interface SectionDefinition {
  key: SectionKey;
  label: string;
  basePath: string;
}

export const APP_SECTIONS: SectionDefinition[] = [
  { key: "dashboard", label: "Главная", basePath: "/" },
  { key: "orders", label: "Заказы", basePath: "/orders" },
  { key: "lensCatalog", label: "Поставщики", basePath: "/lens-catalog" },
  { key: "drive", label: "Общий диск", basePath: "/drive" },
  { key: "pricelist", label: "Прайс склад", basePath: "/pricelist" },
  { key: "pricelistRx", label: "RX", basePath: "/pricelist-rx" },
  { key: "pricelistMkl", label: "Прайс МКЛ", basePath: "/pricelist-mkl" },
  { key: "info", label: "Информация", basePath: "/info" },
  { key: "reports", label: "Отчеты", basePath: "/reports" },
  { key: "training", label: "Обучение", basePath: "/training" },
  { key: "normativeActs", label: "Нормативные акты", basePath: "/normative-acts" },
  { key: "chat", label: "Чат", basePath: "/chat" },
  { key: "supplyTickets", label: "Заявки на поставку", basePath: "/supply-tickets" },
  { key: "tasks", label: "Задачник", basePath: "/tasks" },
  { key: "scheduleManagement", label: "График работ", basePath: "/schedule-management" },
];

export const GROUP_PERMISSIONS_STORAGE_KEY = "group-page-permissions-v1";

export type GroupPermissionsMap = Record<string, SectionKey[]>;

function isSectionKey(value: string): value is SectionKey {
  return APP_SECTIONS.some((section) => section.key === value);
}

export function normalizePermissionsMap(input: unknown): GroupPermissionsMap {
  if (!input || typeof input !== "object") return {};
  const out: GroupPermissionsMap = {};
  for (const [groupId, denied] of Object.entries(input as Record<string, unknown>)) {
    if (!Array.isArray(denied)) continue;
    out[groupId] = denied.filter((v): v is SectionKey => typeof v === "string" && isSectionKey(v));
  }
  return out;
}

export function loadPermissionsMap(): GroupPermissionsMap {
  try {
    const raw = localStorage.getItem(GROUP_PERMISSIONS_STORAGE_KEY);
    if (!raw) return {};
    return normalizePermissionsMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function savePermissionsMap(value: GroupPermissionsMap) {
  localStorage.setItem(GROUP_PERMISSIONS_STORAGE_KEY, JSON.stringify(value));
}

export function clearPermissionsMap() {
  localStorage.removeItem(GROUP_PERMISSIONS_STORAGE_KEY);
}

export function isScheduleSectionEnabledForGroup(
  groupPermissions: GroupPermissionsMap,
  groupId: number
): boolean {
  const denied = groupPermissions[String(groupId)];
  if (denied === undefined) return false;
  return !denied.includes("scheduleManagement");
}

export function sectionKeyFromPath(pathname: string): SectionKey | null {
  if (pathname === "/" || pathname.startsWith("/?")) return "dashboard";
  if (
    pathname === "/schedule-management" ||
    pathname.startsWith("/schedule-management/") ||
    pathname === "/schedule-confirmations" ||
    pathname.startsWith("/schedule-confirmations/")
  ) {
    return "scheduleManagement";
  }
  if (pathname === "/info" || pathname.startsWith("/info/")) return "info";
  const match = APP_SECTIONS.find((section) =>
    section.basePath === "/" ? pathname === "/" : pathname === section.basePath || pathname.startsWith(`${section.basePath}/`)
  );
  return match?.key ?? null;
}
