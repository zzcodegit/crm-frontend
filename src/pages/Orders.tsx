import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { OrderItem } from "../api";
import { useAuth } from "../contexts/AuthContext";

type Filter = "new" | "accepted" | "all";

export default function Orders() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = Boolean(user?.is_admin);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("new");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minSum, setMinSum] = useState("");
  const [maxSum, setMaxSum] = useState("");
  const [consultantFilter, setConsultantFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkAccepting, setBulkAccepting] = useState(false);

  const parseLocalDate = (v: string) => {
    // Backend отдает date в формате YYYY-MM-DD.
    // `new Date("YYYY-MM-DD")` парсится как UTC, из-за чего в MSK получается +3 часа (03:00).
    // Поэтому при "date-only" принудительно создаём дату как локальную полуночь.
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00`);
    return new Date(v);
  };

  const loadOrders = (offset: number, append: boolean) => {
    const load = append ? setLoadingMore : setLoading;
    load(true);
    setError("");
    api.getOrders(filter, offset)
      .then((res) => {
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        const has_more = Array.isArray(res) ? false : (res?.has_more ?? false);
        setOrders((prev) => (append ? [...prev, ...items] : items));
        setHasMore(has_more);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => { load(false); });
  };

  useEffect(() => {
    loadOrders(0, false);
  }, [filter]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [filter]);

  const filteredOrders = useMemo(() => {
    return (orders ?? []).filter((o) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          String(o.order_number || o.id).includes(query) ||
          o.consultant?.toLowerCase().includes(query) ||
          (o.warehouse ?? o.warehouse_name)?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      if (dateFrom && o.date) {
        const orderTs = parseLocalDate(o.date).getTime();
        const fromTs = parseLocalDate(dateFrom).getTime();
        if (orderTs < fromTs) return false;
      }
      if (dateTo && o.date) {
        const orderTs = parseLocalDate(o.date).getTime();
        const toDate = parseLocalDate(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (orderTs > toDate.getTime()) return false;
      }
      if (minSum && o.total < Number(minSum)) return false;
      if (maxSum && o.total > Number(maxSum)) return false;
      if (consultantFilter && (o.consultant || "").trim() !== consultantFilter) return false;
      return true;
    });
  }, [orders, searchQuery, dateFrom, dateTo, minSum, maxSum, consultantFilter]);

  const newOrdersInView = useMemo(
    () => filteredOrders.filter((o) => o.status === "new"),
    [filteredOrders]
  );

  const selectedNewCount = useMemo(() => {
    let n = 0;
    for (const id of selectedIds) {
      const o = orders.find((x) => x.id === id);
      if (o?.status === "new") n += 1;
    }
    return n;
  }, [selectedIds, orders]);

  const toggleSelectOrder = useCallback((orderId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, []);

  const selectAllNewInView = useCallback(() => {
    setSelectedIds(new Set(newOrdersInView.map((o) => o.id)));
  }, [newOrdersInView]);

  const handleBulkAccept = useCallback(async () => {
    const ids = [...selectedIds].filter((id) => orders.some((o) => o.id === id && o.status === "new"));
    if (ids.length === 0) {
      setSelectedIds(new Set());
      return;
    }
    if (!window.confirm(`Принять выбранные заказы (${ids.length})?`)) return;
    setBulkAccepting(true);
    setError("");
    const results = await Promise.allSettled(ids.map((id) => api.acceptOrder(id)));
    const acceptedIds = new Set<number>();
    results.forEach((r, i) => {
      if (r.status === "fulfilled") acceptedIds.add(ids[i]);
    });
    setOrders((prev) =>
      prev.map((o) => (acceptedIds.has(o.id) ? { ...o, status: "accepted" } : o))
    );
    setSelectedIds(new Set());
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      setError(`Не удалось принять ${failed} из ${ids.length}. Проверьте права и список заказов.`);
    }
    setBulkAccepting(false);
  }, [selectedIds, orders]);

  const handleShowMore = () => loadOrders(orders.length, true);

  const consultantOptions = useMemo(
    () =>
      Array.from(new Set((orders ?? []).map((o) => (o.consultant || "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "ru")
      ),
    [orders]
  );

  const acceptedCount = orders.filter((o) => o.status === "accepted").length;

  if (loading) {
    return (
      <div className="animate-slide-in">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Загрузка заказов...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-slide-in max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
              Заказы
            </h1>
          </div>
          
          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setFilter("new")}
              className="px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap"
              style={{
                backgroundColor: filter === "new" ? 'var(--accent)' : 'transparent',
                color: filter === "new" ? '#ffffff' : 'var(--text-primary)',
                border: `1px solid ${filter === "new" ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              Новые
            </button>
            <button
              type="button"
              onClick={() => setFilter("accepted")}
              className="px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap"
              style={{
                backgroundColor: filter === "accepted" ? 'var(--accent)' : 'transparent',
                color: filter === "accepted" ? '#ffffff' : 'var(--text-primary)',
                border: `1px solid ${filter === "accepted" ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              Принятые {acceptedCount > 0 && `(${acceptedCount})`}
            </button>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap"
              style={{
                backgroundColor: filter === "all" ? 'var(--accent)' : 'transparent',
                color: filter === "all" ? '#ffffff' : 'var(--text-primary)',
                border: `1px solid ${filter === "all" ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              Все
            </button>
          </div>
        </div>
        
        {/* Search and Filters */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по номеру заказа, консультанту, складу..."
                className="w-full pl-10 pr-4 py-2.5 rounded-md text-sm transition-all focus:outline-none"
                style={{ 
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--accent)';
                  e.target.style.boxShadow = '0 0 0 3px var(--accent-light)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border)';
                  e.target.style.boxShadow = 'none';
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
            
            {/* Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-md text-sm font-medium transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap"
              style={{
                backgroundColor: showFilters || dateFrom || dateTo || minSum || maxSum || consultantFilter ? 'var(--accent)' : 'var(--bg-primary)',
                color: showFilters || dateFrom || dateTo || minSum || maxSum || consultantFilter ? '#ffffff' : 'var(--text-primary)',
                border: `1px solid ${showFilters || dateFrom || dateTo || minSum || maxSum || consultantFilter ? 'var(--accent)' : 'var(--border)'}`,
                boxShadow: showFilters || dateFrom || dateTo || minSum || maxSum || consultantFilter ? '0 2px 8px var(--shadow)' : 'none',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              <span>Фильтры</span>
              {(dateFrom || dateTo || minSum || maxSum || consultantFilter) && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold bg-white" style={{ color: 'var(--accent)' }}>
                  {[dateFrom, dateTo, minSum, maxSum, consultantFilter].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>
        
          {/* Advanced Filters */}
          {showFilters && (
          <div 
            className="rounded-xl p-5 space-y-4 animate-slide-in"
            style={{ 
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--accent)',
              boxShadow: '0 4px 12px var(--shadow)',
            }}
          >
            <div className="flex items-center gap-2 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Расширенные фильтры
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Consultant */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Консультант
                </label>
                <select
                  value={consultantFilter}
                  onChange={(e) => setConsultantFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-md text-sm transition-all focus:outline-none"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">Все консультанты</option>
                  {consultantOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Дата от
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-md text-sm transition-all focus:outline-none"
                  style={{ 
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--accent)';
                    e.target.style.boxShadow = '0 0 0 3px var(--accent-light)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
              
              {/* Date To */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Дата до
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-md text-sm transition-all focus:outline-none"
                  style={{ 
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--accent)';
                    e.target.style.boxShadow = '0 0 0 3px var(--accent-light)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
              
              {/* Min Sum */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Сумма от
                </label>
                <input
                  type="number"
                  value={minSum}
                  onChange={(e) => setMinSum(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-md text-sm transition-all focus:outline-none"
                  style={{ 
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--accent)';
                    e.target.style.boxShadow = '0 0 0 3px var(--accent-light)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
              
              {/* Max Sum */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Сумма до
                </label>
                <input
                  type="number"
                  value={maxSum}
                  onChange={(e) => setMaxSum(e.target.value)}
                  placeholder="∞"
                  className="w-full px-3 py-2 rounded-md text-sm transition-all focus:outline-none"
                  style={{ 
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--accent)';
                    e.target.style.boxShadow = '0 0 0 3px var(--accent-light)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>
            
            {/* Clear Filters Button */}
            {(dateFrom || dateTo || minSum || maxSum || consultantFilter) && (
              <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Активных фильтров: {[dateFrom, dateTo, minSum, maxSum, consultantFilter].filter(Boolean).length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setMinSum("");
                    setMaxSum("");
                    setConsultantFilter("");
                  }}
                  className="text-sm font-medium transition-all inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--error)';
                    e.currentTarget.style.backgroundColor = 'rgba(222, 53, 11, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  Сбросить
                </button>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {error && (
        <div 
          className="mb-6 p-4 rounded-md text-sm"
          style={{ 
            backgroundColor: 'rgba(222, 53, 11, 0.08)',
            color: 'var(--error)',
            border: '1px solid var(--border)',
          }}
        >
          {error}
        </div>
      )}

      {isAdmin && newOrdersInView.length > 0 && (
        <div
          className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl px-4 py-3"
          style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        >
          <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Массовое принятие (только новые)
          </span>
          <button
            type="button"
            onClick={selectAllNewInView}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            Выбрать все на экране ({newOrdersInView.length})
          </button>
          {selectedNewCount > 0 && (
            <>
              <span className="text-sm tabular-nums" style={{ color: "var(--text-primary)" }}>
                Выбрано: {selectedNewCount}
              </span>
              <button
                type="button"
                disabled={bulkAccepting}
                onClick={() => void handleBulkAccept()}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
                style={{ backgroundColor: "var(--success)", border: "1px solid var(--success)", color: "#fff" }}
              >
                {bulkAccepting ? "Принимаем…" : `Принять выбранные (${selectedNewCount})`}
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border)", backgroundColor: "var(--bg-primary)" }}
              >
                Снять выбор
              </button>
            </>
          )}
        </div>
      )}
      
      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <div 
          className="rounded-xl p-20 text-center"
          style={{ 
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="text-base font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
            {searchQuery ? 'Ничего не найдено' : 'Нет заказов'}
          </div>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {searchQuery ? `По запросу "${searchQuery}" ничего не найдено` : 'Заказы с выбранным фильтром не найдены'}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((o) => (
            <div
              key={o.id}
              className="group cursor-pointer rounded-xl p-4 sm:p-5 transition-all duration-200"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 16px var(--shadow)';
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
              onClick={() => navigate(`/orders/${o.id}`)}
            >
              {/* Mobile Layout */}
              <div className="flex flex-col gap-4 md:hidden">
                {/* Header with icon, number and status */}
                <div className="flex items-start gap-3">
                  {isAdmin && o.status === "new" && (
                    <div
                      className="flex items-center justify-center shrink-0 pt-1"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(o.id)}
                        onChange={() => toggleSelectOrder(o.id)}
                        className="w-4 h-4 rounded border"
                        style={{ accentColor: "var(--accent)" }}
                        aria-label={`Выбрать заказ ${o.order_number ?? o.id}`}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex-shrink-0" style={{ backgroundColor: 'var(--accent-light)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                      <polyline points="10 9 9 9 8 9"/>
                    </svg>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Link 
                        to={`/orders/${o.id}`}
                        className="text-sm sm:text-base font-semibold hover:underline"
                        style={{ color: 'var(--accent)' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Заказ #{o.order_number || o.id}
                      </Link>
                      <span 
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: o.status === "new" ? 'var(--accent-light)' : 'rgba(0, 135, 90, 0.1)',
                          color: o.status === "new" ? 'var(--accent)' : 'var(--success)',
                        }}
                      >
                        {o.status === "new" ? "Новый" : "Принят"}
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {o.date ? parseLocalDate(o.date).toLocaleDateString("ru", { 
                        day: '2-digit', 
                        month: 'short',
                        year: 'numeric',
                      }) : "—"}
                    </div>
                  </div>
                </div>

                {/* Consultant, warehouse, sum */}
                <div className="flex flex-col gap-2 pl-13">
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {o.consultant || "Не указан"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                      <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }} title={o.warehouse ?? o.warehouse_name ?? undefined}>
                      {o.warehouse ?? o.warehouse_name ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold" style={{ color: 'var(--text-tertiary)' }}>₽</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                      {o.total ? `${o.total.toLocaleString('ru-RU')} ₽` : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Desktop Layout */}
              <div className="hidden md:grid items-center gap-4 grid-cols-[minmax(280px,1.35fr)_minmax(180px,1fr)_minmax(200px,1fr)_minmax(140px,auto)_24px]">
                <div className="flex items-center gap-4 min-w-0">
                  {isAdmin && o.status === "new" && (
                    <div
                      className="flex items-center justify-center shrink-0"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(o.id)}
                        onChange={() => toggleSelectOrder(o.id)}
                        className="w-4 h-4 rounded border"
                        style={{ accentColor: "var(--accent)" }}
                        aria-label={`Выбрать заказ ${o.order_number ?? o.id}`}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0" style={{ backgroundColor: "var(--accent-light)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                      <polyline points="10 9 9 9 8 9"/>
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 min-w-0">
                      <Link
                        to={`/orders/${o.id}`}
                        className="text-base font-semibold hover:underline truncate"
                        style={{ color: "var(--accent)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Заказ #{o.order_number || o.id}
                      </Link>
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0"
                        style={{
                          backgroundColor: o.status === "new" ? "var(--accent-light)" : "rgba(0, 135, 90, 0.1)",
                          color: o.status === "new" ? "var(--accent)" : "var(--success)",
                        }}
                      >
                        {o.status === "new" ? "Новый" : "Принят"}
                      </span>
                    </div>
                    <div className="text-sm whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                      {o.date ? parseLocalDate(o.date).toLocaleDateString("ru", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      }) : "—"}
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }} title={o.consultant ?? undefined}>
                    {o.consultant || "Не указан"}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    Консультант
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }} title={o.warehouse ?? o.warehouse_name ?? undefined}>
                    {o.warehouse ?? o.warehouse_name ?? "—"}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    Склад
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums whitespace-nowrap" style={{ color: "var(--accent)" }}>
                    {o.total ? `${o.total.toLocaleString("ru-RU")} ₽` : "—"}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    Сумма
                  </div>
                </div>

                <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </div>
            </div>
          ))}
          {hasMore && (
            <div className="pt-4 flex justify-center">
              <button
                type="button"
                onClick={handleShowMore}
                disabled={loadingMore}
                className="px-6 py-3 rounded-xl font-medium transition-all"
                style={{
                  backgroundColor: 'var(--accent-light)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                }}
              >
                {loadingMore ? "Загрузка…" : "Показать ещё"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
