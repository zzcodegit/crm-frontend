import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { api, type CustomFieldItem } from "../api";

const refs = [
  { 
    to: "/settings/references/order-statuses", 
    label: "Статусы заказов", 
    description: "Управление статусами заказов",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    color: "#0052cc"
  },
  { 
    to: "/settings/references/priorities", 
    label: "Приоритеты", 
    description: "Приоритеты выполнения заказов",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    color: "#ff991f"
  },
  { 
    to: "/settings/references/manufacturers", 
    label: "Производители", 
    description: "Производители линз и оптики",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 7h-9"/>
        <path d="M14 17H5"/>
        <circle cx="17" cy="17" r="3"/>
        <circle cx="7" cy="7" r="3"/>
      </svg>
    ),
    color: "#8b5cf6"
  },
  { 
    to: "/settings/references/organizations", 
    label: "Организации", 
    description: "Список организаций",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
    color: "#6554c0"
  },
  { 
    to: "/settings/references/departments", 
    label: "Подразделения", 
    description: "Подразделения организаций",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    color: "#00b8d9"
  },
  { 
    to: "/settings/references/warehouses", 
    label: "Склады", 
    description: "Управление складами",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
    color: "#36b37e"
  },
  { 
    to: "/settings/references/authors", 
    label: "Авторы", 
    description: "Авторы заказов",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
    color: "#0052cc"
  },
  { 
    to: "/settings/references/products", 
    label: "Товары", 
    description: "Каталог товаров",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 0 1-8 0"/>
      </svg>
    ),
    color: "#ff5630"
  },
  { 
    to: "/settings/references/product-characteristics", 
    label: "Характеристики товаров", 
    description: "Характеристики и свойства",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    color: "#6554c0"
  },
  { 
    to: "/settings/references/vat-rates", 
    label: "Ставки НДС", 
    description: "Налоговые ставки",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
    color: "#00875a"
  },
  { 
    to: "/settings/references/features", 
    label: "Особенности", 
    description: "Особенности и характеристики линз",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
    color: "#ffab00"
  },
  {
    to: "/settings/references/colors",
    label: "Цвета",
    description: "Справочник цветов для особенностей линз (хамелеоны, рефлекс)",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
    color: "#e91e63"
  },
  {
    to: "/settings/references/pricelist-groups",
    label: "Группы прайслиста",
    description: "Группы для позиций прайслиста (Однофокальные, Прогрессивные и т.д.)",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
    color: "#0066cc"
  },
  {
    to: "/settings/references/pricelist-rx-groups",
    label: "Группы RX",
    description: "Группы для страницы RX (/pricelist-rx)",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
    color: "#0d9488"
  },
  {
    to: "/settings/references/pricelist-mkl-groups",
    label: "Группы прайслиста МКЛ",
    description: "Группы для страницы прайслиста МКЛ (/pricelist-mkl)",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
    color: "#9333ea"
  },
  {
    to: "/settings/references/expense-articles",
    label: "Статьи расходов",
    description: "Для блока «Расходы» в отчёте консультанта",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
    color: "#bf2600"
  },
  {
    to: "/settings/references/taken-reasons",
    label: "Взято за что",
    description: "Справочник причин «взято за что»",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1v22" />
        <path d="M17 5H8.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    color: "#5243aa"
  },
  {
    to: "/settings/references/taken-sources",
    label: "Откуда взято",
    description: "Справочник источников для блока «Взято»",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="7.5 4.2 12 6.8 16.5 4.2"/>
      </svg>
    ),
    color: "#0ea5e9"
  },
  {
    to: "/settings/references/debt-reasons",
    label: "Долг за что",
    description: "Справочник причин «долг за что»",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1v22" />
        <path d="M17 5H8.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    color: "#ff5630"
  },
];

export default function References() {
  const [customRefs, setCustomRefs] = useState<CustomFieldItem[]>([]);
  useEffect(() => {
    api.ref.customFields.listAll().then((list) => setCustomRefs(list.filter((f) => f.field_type === "reference" && f.is_active))).catch(() => setCustomRefs([]));
  }, []);
  const allRefs = useMemo(
    () => [
      ...refs,
      ...customRefs.map((f) => ({
        to: `/settings/references/custom-field/${f.id}`,
        label: `Справочник: ${f.label}`,
        description: "Значения справочника для дополнительного поля",
        icon: (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        ),
        color: "#00a3bf",
      })),
    ],
    [customRefs]
  );
  return (
    <div className="max-w-6xl animate-slide-in space-y-6">
      {/* Header */}
      <div>
        <Link 
          to="/settings" 
          className="inline-flex items-center gap-2 text-sm font-medium mb-3 transition-colors hover:gap-3"
          style={{ color: 'var(--text-secondary)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Настройки
        </Link>
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Справочники
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Управление справочными данными системы
        </p>
      </div>

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {allRefs.map((r) => (
          <Link
            key={r.to}
            to={r.to}
            className="group rounded-xl p-5 transition-all duration-200 no-underline"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 16px var(--shadow)';
              e.currentTarget.style.borderColor = r.color;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <div className="flex items-start gap-4">
              <div 
                className="flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0 transition-transform group-hover:scale-110"
                style={{ backgroundColor: r.color + '20' }}
              >
                <div style={{ color: r.color }}>
                  {r.icon}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {r.label}
                </div>
                <div className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                  {r.description}
                </div>
              </div>
              <svg 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
