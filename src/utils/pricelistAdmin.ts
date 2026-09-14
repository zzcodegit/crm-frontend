/** Имя песочницы админа во всех трёх прайсах (склад / RX / МКЛ). */
export const ADMIN_PRICELIST_FOLDER = "Прайс для админа";

export function isAdminPricelistFolder(groupName: string | null | undefined): boolean {
  return (groupName || "").trim() === ADMIN_PRICELIST_FOLDER;
}

/** Ссылка на список карточек песочницы в конкретном каталоге. */
export function adminPricelistCatalogHref(basePath: "/pricelist" | "/pricelist-rx" | "/pricelist-mkl"): string {
  return `${basePath}?group=${encodeURIComponent(ADMIN_PRICELIST_FOLDER)}`;
}
