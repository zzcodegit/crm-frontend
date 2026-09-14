import { Link } from "react-router-dom";
import { ADMIN_PRICELIST_FOLDER, adminPricelistCatalogHref } from "../utils/pricelistAdmin";

const CATALOGS = [
  {
    title: "Прайс склад",
    desc: "Тестовые карточки склада. После проверки — «Показывать в рабочих папках» на карточке.",
    href: adminPricelistCatalogHref("/pricelist"),
    newHref: `/pricelist/new?group=${encodeURIComponent(ADMIN_PRICELIST_FOLDER)}`,
  },
  {
    title: "RX",
    desc: "Тестовые карточки RX — те же поля и фильтры, что в боевом разделе.",
    href: adminPricelistCatalogHref("/pricelist-rx"),
    newHref: `/pricelist-rx/new?group=${encodeURIComponent(ADMIN_PRICELIST_FOLDER)}`,
  },
  {
    title: "Прайс МКЛ",
    desc: "Тестовые карточки МКЛ — обкатка до публикации в рабочие папки.",
    href: adminPricelistCatalogHref("/pricelist-mkl"),
    newHref: `/pricelist-mkl/new?group=${encodeURIComponent(ADMIN_PRICELIST_FOLDER)}`,
  },
] as const;

export default function PricelistAdminHub() {
  return (
    <div className="max-w-3xl mx-auto w-full animate-slide-in px-1">
      <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
        {ADMIN_PRICELIST_FOLDER}
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Песочница только для администраторов. Здесь три прайса как на боевых разделах: создавайте и правьте
        карточки, меняйте фильтры. Когда готово — на карточке нажмите «Показывать в рабочих папках» и выберите
        обычную папку.
      </p>
      <div className="grid gap-4">
        {CATALOGS.map((c) => (
          <div
            key={c.href}
            className="rounded-2xl border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
          >
            <div>
              <div className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                {c.title}
              </div>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                {c.desc}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Link
                to={c.href}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white"
                style={{ background: "var(--accent)" }}
              >
                Открыть
              </Link>
              <Link
                to={c.newHref}
                className="px-4 py-2 rounded-xl text-sm font-medium border"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--bg-secondary)" }}
              >
                + Карточка
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
