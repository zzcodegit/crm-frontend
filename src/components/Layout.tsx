import { useState, useRef, useEffect, useMemo } from "react";
import { Outlet, useLocation, Navigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { isPricelistSectionPath } from "../utils/pricelistRoutes";
import { usePermissions } from "../contexts/PermissionsContext";
import { useTheme } from "../contexts/ThemeContext";
import { usePageTitle } from "../contexts/PageTitleContext";
import Sidebar from "./Sidebar";
import ChatWidget from "./ChatWidget";
import { isNativeAppShell } from "../utils/nativeApp";

const PRICELIST_SCROLL_KEYS: Record<string, string> = {
  "/pricelist": "pricelist-scroll",
  "/pricelist-rx": "pricelist-rx-scroll",
  "/pricelist-mkl": "pricelist-mkl-scroll",
};

function isPricelistListPath(pathname: string): boolean {
  return pathname === "/pricelist" || pathname === "/pricelist-rx" || pathname === "/pricelist-mkl";
}

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export default function Layout() {
  const { user, logout, stopImpersonation } = useAuth();
  const [stopImpBusy, setStopImpBusy] = useState(false);
  const { isPathAllowed, firstAllowedPath } = usePermissions();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  };
  const mainRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { pageTitle } = usePageTitle();
  
  // На странице карточки прайслиста хедер не фиксируем
  const isPricelistDetail =
    (/^\/pricelist\/[^/]+$/.test(location.pathname) &&
      location.pathname !== "/pricelist/new" &&
      !location.pathname.endsWith("/edit")) ||
    (/^\/pricelist-rx\/[^/]+$/.test(location.pathname) &&
      location.pathname !== "/pricelist-rx/new" &&
      !location.pathname.endsWith("/edit")) ||
    (/^\/pricelist-mkl\/[^/]+$/.test(location.pathname) &&
      location.pathname !== "/pricelist-mkl/new" &&
      !location.pathname.endsWith("/edit"));

  /** Заголовок в шапке (в т.ч. мобильный): контекст или маршрут */
  const headerTitle = useMemo(() => {
    if (pageTitle) return pageTitle;
    const p = location.pathname;

    if (p === "/") return "Главная";
    if (p === "/orders") return "Заказы";
    if (p.startsWith("/orders/")) return "";
    if (p === "/lens-catalog" || p.startsWith("/lens-catalog/")) return "Поставщики";
    if (p === "/pricelist-rx" || p === "/pricelist-rx/new" || (p.startsWith("/pricelist-rx/") && p.endsWith("/edit"))) return "RX";
    if (p.startsWith("/pricelist-rx")) return "";
    if (p === "/pricelist-mkl" || p === "/pricelist-mkl/new" || (p.startsWith("/pricelist-mkl/") && p.endsWith("/edit"))) return "Прайс МКЛ";
    if (p.startsWith("/pricelist-mkl")) return "";
    if (p === "/pricelist" || p === "/pricelist/new" || (p.startsWith("/pricelist/") && p.endsWith("/edit"))) return "Прайс склад";
    if (p.startsWith("/pricelist")) return "";
    if (p === "/reports/expenses") return "Расходы";
    if (p === "/reports/encashment") return "Инкассация";
    if (p === "/reports/central-cash") return "Центральная касса";
    if (p === "/reports/analytics/point") return "Аналитика по точке";
    if (p === "/reports/analytics/consultant") return "Аналитика по продавцу";
    if (p === "/reports" || p.startsWith("/reports/")) return "Отчеты";
    if (p === "/schedule-management") return "График работ";
    if (p === "/schedule-confirmations") return "Подтверждения графика";
    if (p === "/supply-tickets") return "Заявки на поставку";
    if (p === "/tasks") return "Задачник";
    if (p.startsWith("/training")) return "Обучение";
    if (p.startsWith("/normative-acts")) return "Нормативные акты";
    if (p.startsWith("/chat")) return "Чат";

    if (p.startsWith("/settings")) {
      if (p.startsWith("/settings/custom-fields")) return "Дополнительные поля";
      if (p.startsWith("/settings/permissions")) return "Права доступа";
      if (p.startsWith("/settings/groups/")) return "Группа";
      if (p.startsWith("/settings/users/")) return "Пользователь";
      if (p === "/settings/users") return "Пользователи";
      if (p.startsWith("/settings/references/manufacturers/")) return "Производитель";
      if (p.startsWith("/settings/references/manufacturers")) return "Производители";
      if (p.startsWith("/settings/references/features/")) return "Особенность";
      if (p.startsWith("/settings/references/features")) return "Особенности";
      if (p.startsWith("/settings/references/products")) return "Товары";
      if (p.startsWith("/settings/references/product-characteristics")) return "Характеристики";
      if (p.startsWith("/settings/references/colors/")) return "Цвет";
      if (p.startsWith("/settings/references/colors")) return "Цвета";
      if (p.startsWith("/settings/references/pricelist-rx-groups/")) return "Группа RX";
      if (p.startsWith("/settings/references/pricelist-rx-groups")) return "Группы RX";
      if (p.startsWith("/settings/references/pricelist-mkl-groups/")) return "Группа прайса МКЛ";
      if (p.startsWith("/settings/references/pricelist-mkl-groups")) return "Группы прайса МКЛ";
      if (p.startsWith("/settings/references/pricelist-groups/")) return "Группа прайса";
      if (p.startsWith("/settings/references/pricelist-groups")) return "Группы прайса";
      if (p.startsWith("/settings/references/warehouses/")) return "Склад";
      if (p.startsWith("/settings/references/warehouses")) return "Склады";
      if (p.startsWith("/settings/references/custom-field/")) return "Справочник поля";
      if (p.startsWith("/settings/references/") && p !== "/settings/references") return "Справочник";
      if (p === "/settings/references") return "Справочники";
      return "Настройки";
    }

    return "";
  }, [pageTitle, location.pathname]);


  // Сохранение скролла при прокрутке на странице списка прайса
  useEffect(() => {
    const scrollKey = PRICELIST_SCROLL_KEYS[location.pathname];
    if (!scrollKey) return;
    const el = mainRef.current;
    if (!el) return;
    let raf: number;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          sessionStorage.setItem(scrollKey, String(el.scrollTop));
        } catch {}
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [location.pathname]);

  // Восстановление скролла при возврате на список прайса
  useEffect(() => {
    const scrollKey = PRICELIST_SCROLL_KEYS[location.pathname];
    if (!scrollKey) return;
    // Если в URL есть якорь группы — прокрутку к секции делает `Pricelist.tsx` (useLayoutEffect).
    // Иначе пиксельный restore перебивает возврат «в ту же группу».
    if (isPricelistListPath(location.pathname) && location.hash && location.hash.length > 1) return;
    const saved = sessionStorage.getItem(scrollKey);
    if (saved == null) return;
    try {
      sessionStorage.removeItem(scrollKey);
    } catch {}
    const pos = parseInt(saved, 10);
    if (Number.isNaN(pos) || pos <= 0) return;
    const el = mainRef.current;
    if (!el) return;
    const tryRestore = () => {
      if (!el) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll >= pos) {
        el.scrollTop = pos;
        return true;
      }
      return false;
    };
    const attempts = [0, 100, 300, 600, 1000];
    attempts.forEach((delay) => {
      setTimeout(() => {
        if (tryRestore()) return;
        requestAnimationFrame(() => tryRestore());
      }, delay);
    });
  }, [location.pathname, location.hash]);


  if (
    user?.role === "manager" &&
    location.pathname !== "/orders" &&
    !location.pathname.startsWith("/orders/") &&
    !isPricelistSectionPath(location.pathname) &&
    !location.pathname.startsWith("/lens-catalog") &&
    !location.pathname.startsWith("/supply-tickets") &&
    !location.pathname.startsWith("/reports") &&
    !location.pathname.startsWith("/chat")
  ) {
    return <Navigate to="/orders" replace />;
  }
  if (!isPathAllowed(location.pathname)) {
    return <Navigate to={firstAllowedPath} replace />;
  }

  return (
    <div className="flex h-screen min-h-0" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
      />
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden transition-[margin] duration-300 ${sidebarCollapsed ? "md:ml-20" : "md:ml-60"}`}
      >
        <header 
          className={`app-main-header z-30 flex h-16 items-center gap-2 sm:gap-3 px-3 sm:px-4 lg:px-6 ${isPricelistDetail ? "" : "sticky top-0"}`}
          style={{ 
            backgroundColor: 'var(--bg-primary)',
            borderBottom: '1px solid var(--border)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          {/* Mobile Menu Button */}
          <button
            type="button"
            className="md:hidden p-2 rounded-lg transition-all hover:scale-105"
            style={{ 
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-secondary)',
            }}
            onClick={() => setSidebarOpen(true)}
            aria-label="Меню"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          
          {/* Название раздела: на мобильном и десктопе; truncate при длинном тексте */}
          {headerTitle && (
            <h1
              className="flex-1 min-w-0 text-base sm:text-lg font-bold truncate text-left leading-tight"
              style={{ color: "var(--text-primary)" }}
              title={headerTitle}
            >
              {headerTitle}
            </h1>
          )}
          
          {/* Right Side Actions */}
          <div className="ml-auto flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              type="button"
              className="p-2.5 rounded-lg transition-all hover:scale-105"
              style={{ 
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-secondary)',
              }}
              onClick={toggleTheme}
              aria-label="Тема"
              title={theme === "dark" ? "Переключить на светлую тему" : "Переключить на темную тему"}
            >
              {theme === "dark" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>

            {!isNativeAppShell() ? (
              <>
                <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs"
                    style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)' }}
                  >
                    {user?.username?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{user?.username}</span>
                </div>

                <button
                  type="button"
                  className="text-sm font-medium px-4 py-2.5 rounded-lg transition-all hover:scale-105"
                  style={{
                    color: '#ffffff',
                    background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                    boxShadow: '0 2px 8px rgba(0, 82, 204, 0.25)',
                  }}
                  onClick={logout}
                >
                  <span className="hidden sm:inline">Выйти</span>
                  <svg className="sm:hidden" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                </button>
              </>
            ) : null}
          </div>
        </header>
        {user?.impersonator_username ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-6 py-2.5 text-sm border-b z-20"
            style={{
              background: "rgba(234, 179, 8, 0.22)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          >
            <span>
              Режим просмотра: вы вошли как <strong>{user.username}</strong>. Администратор:{" "}
              <strong>{user.impersonator_username}</strong>
            </span>
            <button
              type="button"
              disabled={stopImpBusy}
              onClick={() => {
                setStopImpBusy(true);
                void stopImpersonation()
                  .catch(() => {})
                  .finally(() => setStopImpBusy(false));
              }}
              className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold border disabled:opacity-60 transition-opacity"
              style={{
                background: "var(--bg-primary)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            >
              {stopImpBusy ? "…" : "Вернуться в аккаунт администратора"}
            </button>
          </div>
        ) : null}
        <main id="app-main-scroll" ref={mainRef} className="flex-1 min-h-0 overflow-auto overflow-x-hidden relative">
          {/* Декоративная подложка */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Градиентные круги с анимацией */}
            <div 
              className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow"
              style={{ 
                background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
                opacity: 0.3,
              }}
            />
            <div 
              className="absolute top-1/3 -left-20 w-80 h-80 rounded-full blur-3xl animate-float-medium"
              style={{ 
                background: 'radial-gradient(circle, var(--purple) 0%, transparent 70%)',
                opacity: 0.25,
              }}
            />
            <div 
              className="absolute bottom-20 right-1/4 w-96 h-96 rounded-full blur-3xl animate-float-fast"
              style={{ 
                background: 'radial-gradient(circle, var(--teal) 0%, transparent 70%)',
                opacity: 0.2,
              }}
            />
            
            {/* Сетка */}
            <div 
              className="absolute inset-0"
              style={{
                backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
                backgroundSize: '50px 50px',
                opacity: 0.05,
              }}
            />
          </div>
          
          {/* Контент: отчёты, сводки по долгам, карточка прайса — на всю ширину рабочей области */}
          <div
            className={`relative z-10 mx-auto w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 ${
              location.pathname === "/reports" ||
              location.pathname === "/reports/debts-summary" ||
              location.pathname === "/reports/my-debts-stats" ||
              isPricelistDetail
                ? "max-w-[min(1920px,100%)]"
                : "max-w-7xl"
            }`}
          >
            <Outlet />
          </div>
        </main>
      </div>
      {!isNativeAppShell() ? <ChatWidget hideLauncher /> : null}
    </div>
  );
}
