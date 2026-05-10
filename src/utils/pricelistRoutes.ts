/** Каталоги прайса хранятся в отдельных таблицах на бэкенде. */
export type PricelistCatalog = "warehouse" | "rx" | "mkl";

export type PricelistBasePath = "/pricelist" | "/pricelist-rx" | "/pricelist-mkl";

/** Базовый путь раздела прайса. */
export function pricelistBasePathFromPathname(pathname: string): PricelistBasePath {
  if (pathname.startsWith("/pricelist-rx")) return "/pricelist-rx";
  if (pathname.startsWith("/pricelist-mkl")) return "/pricelist-mkl";
  return "/pricelist";
}

export function pricelistCatalogFromBasePath(basePath: PricelistBasePath): PricelistCatalog {
  if (basePath === "/pricelist-rx") return "rx";
  if (basePath === "/pricelist-mkl") return "mkl";
  return "warehouse";
}

/** Пользователь внутри любого раздела прайса (для редиректов и прав). */
export function isPricelistSectionPath(pathname: string): boolean {
  return (
    pathname === "/pricelist" ||
    pathname.startsWith("/pricelist/") ||
    pathname === "/pricelist-rx" ||
    pathname.startsWith("/pricelist-rx/") ||
    pathname === "/pricelist-mkl" ||
    pathname.startsWith("/pricelist-mkl/")
  );
}
