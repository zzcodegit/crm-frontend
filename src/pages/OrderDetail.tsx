import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { OrderItem } from "../api";
import { usePageTitle } from "../contexts/PageTitleContext";

const fmt = (v: number | string | boolean | null | undefined) => {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Да" : "Нет";
  return String(v);
};
const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("ru") : "—");

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const { setPageTitle } = usePageTitle();
  
  useEffect(() => {
    const numId = Number(id);
    if (!id || Number.isNaN(numId)) {
      setLoading(false);
      setPageTitle("");
      return;
    }
    setError("");
    api.getOrder(numId).then((o) => {
      setOrder(o);
      setPageTitle(`#${o.order_number || o.id}`);
    }).catch((e) => {
      setError(e instanceof Error ? e.message : "Ошибка");
      setPageTitle("");
    }).finally(() => setLoading(false));
  }, [id, setPageTitle]);
  
  // Очищаем заголовок при размонтировании
  useEffect(() => {
    return () => setPageTitle("");
  }, [setPageTitle]);

  const handleAccept = () => {
    if (!order) return;
    setAccepting(true);
    setError("");
    api.acceptOrder(order.id).then((o) => { setOrder(o); navigate("/orders"); }).catch((e) => setError(e instanceof Error ? e.message : "Ошибка")).finally(() => setAccepting(false));
  };

  if (loading) {
    return (
      <div className="max-w-6xl animate-slide-in">
        <div className="flex items-center gap-3 py-8">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Загрузка заказа...</span>
        </div>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="max-w-6xl animate-slide-in">
        <div 
          className="rounded-xl p-8 text-center"
          style={{ 
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="text-4xl mb-4">📦</div>
          <p className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Заказ не найден</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Возможно, заказ был удален или не существует</p>
          <Link 
            to="/orders" 
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors"
            style={{ 
              color: 'var(--accent)',
              backgroundColor: 'var(--accent-light)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Вернуться к списку
          </Link>
        </div>
      </div>
    );
  }

  const Section = ({ title, icon, headerRight, children }: { title: string; icon?: React.ReactNode; headerRight?: React.ReactNode; children: React.ReactNode }) => (
    <div 
      className="rounded-xl p-5 sm:p-6"
      style={{ 
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          {icon && <div style={{ color: 'var(--accent)' }}>{icon}</div>}
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );

  const Grid = ({ children }: { children: React.ReactNode }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {children}
    </div>
  );

  const Cell = ({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) => (
    <div 
      className="p-4 rounded-lg"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon && <div style={{ color: 'var(--text-tertiary)' }}>{icon}</div>}
        <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
      </div>
      <div className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );

  return (
    <div className="max-w-6xl animate-slide-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link 
            to="/orders" 
            className="inline-flex items-center gap-2 text-sm font-medium mb-3 transition-colors hover:gap-3"
            style={{ color: 'var(--text-secondary)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            К списку заказов
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <div 
              className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl"
              style={{ backgroundColor: 'var(--accent-light)' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            Заказ #{order.order_number || order.id}
          </h1>
          <p className="block md:hidden mt-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {order.warehouse ?? order.warehouse_name ?? "—"}
          </p>
        </div>
        
        {/* Status Badge */}
        <div>
          <span 
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{
              backgroundColor: order.status === "new" ? 'var(--accent-light)' : 'rgba(0, 135, 90, 0.1)',
              color: order.status === "new" ? 'var(--accent)' : 'var(--success)',
            }}
          >
            {order.status === "new" ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                Новый заказ
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                Принят
              </>
            )}
          </span>
        </div>
      </div>

      {error && (
        <div 
          className="p-4 rounded-xl text-sm flex items-start gap-3 animate-slide-in"
          style={{ 
            backgroundColor: 'rgba(222, 53, 11, 0.08)',
            color: 'var(--error)',
            border: '1px solid var(--border)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Main Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section 
          title="Основная информация"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          }
        >
          <Grid>
            <Cell 
              label="Консультант" 
              value={fmt(order.consultant)}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              }
            />
            <Cell 
              label="Дата создания" 
              value={fmtDate(order.date)}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              }
            />
            <Cell 
              label="Готовность" 
              value={fmtDate(order.readiness_date)}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              }
            />
            <Cell 
              label="Склад" 
              value={fmt(order.warehouse ?? order.warehouse_name)}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              }
            />
          </Grid>
        </Section>

        <Section 
          title="Информация о клиенте"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          }
        >
          <Grid>
            <Cell 
              label="Клиент" 
              value={fmt(order.client)}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              }
            />
            <Cell 
              label="Телефон" 
              value={fmt(order.phone)}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              }
            />
          </Grid>
        </Section>
      </div>

      {/* Lens Parameters Section */}
      {(order.diametr || order.od_sph || order.od_cyl || order.od_axis || order.od_pd || order.od_add_deg || order.od_height ||
        order.os_sph || order.os_cyl || order.os_axis || order.os_pd || order.os_add_deg || order.os_height) && (
        <Section 
          title="Параметры линз"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          }
          headerRight={order.diametr ? (
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Диаметр: {fmt(order.diametr)}</span>
          ) : undefined}
        >
          {/* Mobile Layout - Cards */}
          <div className="block md:hidden space-y-4">
            {/* OD Card */}
            <div 
              className="rounded-lg p-4"
              style={{ 
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="flex items-center gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <span 
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-sm font-bold"
                  style={{ 
                    backgroundColor: 'var(--accent-light)',
                    color: 'var(--accent)',
                  }}
                >
                  OD
                </span>
                <div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Oculus Dexter</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>SPH</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(order.od_sph)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>CYL</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(order.od_cyl)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>AXIS</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(order.od_axis)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>PD</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(order.od_pd)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Add/Deg</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(order.od_add_deg)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Уст. высота</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(order.od_height)}</div>
                </div>
              </div>
            </div>

            {/* OS Card */}
            <div 
              className="rounded-lg p-4"
              style={{ 
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="flex items-center gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <span 
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-sm font-bold"
                  style={{ 
                    backgroundColor: 'rgba(0, 135, 90, 0.1)',
                    color: 'var(--success)',
                  }}
                >
                  OS
                </span>
                <div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Oculus Sinister</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>SPH</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(order.os_sph)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>CYL</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(order.os_cyl)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>AXIS</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(order.os_axis)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>PD</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(order.os_pd)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Add/Deg</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(order.os_add_deg)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Уст. высота</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(order.os_height)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Layout - Table */}
          <div className="hidden md:block overflow-x-auto -mx-5 sm:-mx-6">
            <div className="inline-block min-w-full align-middle px-5 sm:px-6">
              <table className="min-w-full text-sm">
                <thead>
                  <tr 
                    className="text-xs uppercase tracking-wider"
                    style={{ 
                      backgroundColor: 'var(--bg-secondary)',
                      borderBottom: '2px solid var(--border)',
                    }}
                  >
                    <th className="text-left py-3 px-3 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Глаз</th>
                    <th className="text-center py-3 px-3 font-semibold" style={{ color: 'var(--text-tertiary)' }}>SPH</th>
                    <th className="text-center py-3 px-3 font-semibold" style={{ color: 'var(--text-tertiary)' }}>CYL</th>
                    <th className="text-center py-3 px-3 font-semibold" style={{ color: 'var(--text-tertiary)' }}>AXIS</th>
                    <th className="text-center py-3 px-3 font-semibold" style={{ color: 'var(--text-tertiary)' }}>PD</th>
                    <th className="text-center py-3 px-3 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Add/Deg</th>
                    <th className="text-center py-3 px-3 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Уст. высота</th>
                  </tr>
                </thead>
                <tbody>
                  {/* OD (Right Eye) */}
                  <tr 
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td className="py-4 px-3">
                      <div className="flex items-center gap-2">
                        <span 
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold"
                          style={{ 
                            backgroundColor: 'var(--accent-light)',
                            color: 'var(--accent)',
                          }}
                        >
                          OD
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-3 text-center font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(order.od_sph)}
                    </td>
                    <td className="py-4 px-3 text-center font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(order.od_cyl)}
                    </td>
                    <td className="py-4 px-3 text-center font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(order.od_axis)}
                    </td>
                    <td className="py-4 px-3 text-center font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(order.od_pd)}
                    </td>
                    <td className="py-4 px-3 text-center font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(order.od_add_deg)}
                    </td>
                    <td className="py-4 px-3 text-center font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(order.od_height)}
                    </td>
                  </tr>
                  
                  {/* OS (Left Eye) */}
                  <tr 
                    className="transition-colors"
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td className="py-4 px-3">
                      <div className="flex items-center gap-2">
                        <span 
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold"
                          style={{ 
                            backgroundColor: 'rgba(0, 135, 90, 0.1)',
                            color: 'var(--success)',
                          }}
                        >
                          OS
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-3 text-center font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(order.os_sph)}
                    </td>
                    <td className="py-4 px-3 text-center font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(order.os_cyl)}
                    </td>
                    <td className="py-4 px-3 text-center font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(order.os_axis)}
                    </td>
                    <td className="py-4 px-3 text-center font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(order.os_pd)}
                    </td>
                    <td className="py-4 px-3 text-center font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(order.os_add_deg)}
                    </td>
                    <td className="py-4 px-3 text-center font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(order.os_height)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}

      {/* Products Section */}
      <Section 
        title="Товары в заказе"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        }
      >
          <div className="overflow-x-auto -mx-5 sm:-mx-6">
            <div className="inline-block min-w-full align-middle px-5 sm:px-6">
              <table className="min-w-full text-sm">
                <thead>
                  <tr 
                    className="text-xs uppercase tracking-wider"
                    style={{ 
                      backgroundColor: 'var(--bg-secondary)',
                      borderBottom: '2px solid var(--border)',
                    }}
                  >
                    <th className="text-left py-3 px-3 font-semibold" style={{ color: 'var(--text-tertiary)' }}>№</th>
                    <th className="text-left py-3 px-3 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Наименование</th>
                    <th className="text-right py-3 px-3 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Кол-во</th>
                    <th className="text-right py-3 px-3 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Цена</th>
                    <th className="text-right py-3 px-3 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items || []).map((it, idx) => (
                    <tr 
                      key={it.id}
                      className="transition-colors"
                      style={{ 
                        borderBottom: idx === (order.items || []).length - 1 ? 'none' : '1px solid var(--border)',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td className="py-4 px-3">
                        <span 
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium"
                          style={{ 
                            backgroundColor: 'var(--accent-light)',
                            color: 'var(--accent)',
                          }}
                        >
                          {it.line_number}
                        </span>
                      </td>
                      <td className="py-4 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {fmt(it.product_name || it.nomenclature)}
                      </td>
                      <td className="py-4 px-3 text-right" style={{ color: 'var(--text-secondary)' }}>
                        {fmt(it.quantity)}
                      </td>
                      <td className="py-4 px-3 text-right font-medium" style={{ color: 'var(--text-primary)' }}>
                        {fmt(it.price)}
                      </td>
                      <td className="py-4 px-3 text-right font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {fmt(it.sum)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr 
                    className="text-base font-bold"
                    style={{ 
                      backgroundColor: 'var(--bg-secondary)',
                      borderTop: '2px solid var(--border)',
                    }}
                  >
                    <td colSpan={4} className="py-4 px-3" style={{ color: 'var(--text-primary)' }}>
                      ИТОГО
                    </td>
                    <td className="py-4 px-3 text-right" style={{ color: 'var(--accent)' }}>
                      {fmt(order.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </Section>

      {/* Comment Section */}
      {order.print_info && (
        <Section
          title="Информация для печати"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9V2h12v7"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
          }
        >
          <div
            className="p-4 rounded-lg text-sm leading-relaxed whitespace-pre-wrap"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
            }}
          >
            {order.print_info}
          </div>
        </Section>
      )}

      {order.comment && (
        <Section 
          title="Комментарий к заказу"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          }
        >
          <div 
            className="p-4 rounded-lg text-sm leading-relaxed"
            style={{ 
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
            }}
          >
            {order.comment}
          </div>
        </Section>
      )}

      {/* Action Button */}
      {order.status === "new" && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleAccept}
            disabled={accepting}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold disabled:opacity-60 transition-all shadow-lg"
            style={{ backgroundColor: 'var(--accent)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--accent-hover)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 12px 24px var(--shadow)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--accent)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px var(--shadow)';
            }}
          >
            {accepting ? (
              <>
                <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="2" x2="12" y2="6"/>
                  <line x1="12" y1="18" x2="12" y2="22"/>
                  <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
                  <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
                  <line x1="2" y1="12" x2="6" y2="12"/>
                  <line x1="18" y1="12" x2="22" y2="12"/>
                  <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
                  <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
                </svg>
                Принятие заказа...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                Принять заказ
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
