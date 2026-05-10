import { useEffect, useMemo, useState } from "react";
import { api, type SupplyTicketItem, type SupplyTicketMessageItem, type WarehouseItem } from "../api";
import { useAuth } from "../contexts/AuthContext";

type TicketLastMessageMeta = {
  atMs: number;
  authorUserId: number | null;
};

const ticketReadKey = (userId: number, ticketId: number) => `supply_ticket_read_at_${userId}_${ticketId}`;

const readTs = (userId: number, ticketId: number): number => {
  try {
    const raw = localStorage.getItem(ticketReadKey(userId, ticketId));
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
};

const writeReadTs = (userId: number, ticketId: number, ts: number) => {
  try {
    localStorage.setItem(ticketReadKey(userId, ticketId), String(ts));
  } catch {
    // ignore storage errors
  }
};

export default function SupplyTickets() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.is_admin) || user?.role === "admin";
  const userId = user?.id ?? 0;
  const [tickets, setTickets] = useState<SupplyTicketItem[]>([]);
  const [totalTickets, setTotalTickets] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [messages, setMessages] = useState<SupplyTicketMessageItem[]>([]);
  const [ticketLastMessageMeta, setTicketLastMessageMeta] = useState<Record<number, TicketLastMessageMeta>>({});
  const [readVersion, setReadVersion] = useState(0);
  const [newWarehouseId, setNewWarehouseId] = useState<number | "">("");
  const [newRequestText, setNewRequestText] = useState("");
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMessageText, setNewMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [statusFilter, setStatusFilter] = useState<"open" | "closed">("open");

  const ITEMS_PER_PAGE = 15;
  const totalPages = Math.ceil(totalTickets / ITEMS_PER_PAGE);

  const loadTickets = async (page: number = 1) => {
    setLoading(true);
    try {
      const offset = (page - 1) * ITEMS_PER_PAGE;
      const [result, w] = await Promise.all([
        api.supplyTickets.list(ITEMS_PER_PAGE, offset, statusFilter),
        api.ref.warehouses.list()
      ]);
      setTickets(result.items);
      setTotalTickets(result.total);
      setWarehouses(w);
      if (result.items.length > 0 && selectedTicketId == null) setSelectedTicketId(result.items[0].id);

      const lastByTicket: Record<number, TicketLastMessageMeta> = {};
      await Promise.all(
        result.items.map(async (ticket) => {
          try {
            const list = await api.supplyTickets.messages(ticket.id);
            const last = list[list.length - 1];
            if (!last) return;
            const ts = Date.parse(last.created_at || "");
            if (!Number.isFinite(ts)) return;
            lastByTicket[ticket.id] = {
              atMs: ts,
              authorUserId: last.author_user_id ?? null,
            };
          } catch {
            // ignore per-ticket message loading errors for unread indicator
          }
        })
      );
      setTicketLastMessageMeta(lastByTicket);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, statusFilter]);

  useEffect(() => {
    if (!selectedTicketId) {
      setMessages([]);
      return;
    }
    api.supplyTickets
      .messages(selectedTicketId)
      .then((list) => {
        setMessages(list);
        const last = list[list.length - 1];
        if (!last || !userId) return;
        const ts = Date.parse(last.created_at || "");
        if (!Number.isFinite(ts)) return;
        writeReadTs(userId, selectedTicketId, ts);
        setReadVersion((v) => v + 1);
      })
      .catch(() => setMessages([]));
  }, [selectedTicketId, userId]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) ?? null,
    [tickets, selectedTicketId]
  );

  const unreadByTicketId = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const ticket of tickets) {
      const meta = ticketLastMessageMeta[ticket.id];
      if (!meta || !userId) {
        map.set(ticket.id, false);
        continue;
      }
      // Don't show unread marker for messages authored by current user.
      if (meta.authorUserId != null && meta.authorUserId === userId) {
        map.set(ticket.id, false);
        continue;
      }
      map.set(ticket.id, meta.atMs > readTs(userId, ticket.id));
    }
    return map;
  }, [tickets, ticketLastMessageMeta, userId, readVersion]);

  const filteredWarehouses = useMemo(() => {
    const needle = warehouseSearch.trim().toLowerCase();
    if (!needle) return warehouses;
    return warehouses.filter((w) => (w.name || "").toLowerCase().includes(needle));
  }, [warehouses, warehouseSearch]);

  const createTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newRequestText.trim();
    if (!text) return;
    await api.supplyTickets.create({ warehouse_id: newWarehouseId === "" ? null : Number(newWarehouseId), request_text: text });
    setNewRequestText("");
    setNewWarehouseId("");
    setWarehouseSearch("");
    setShowCreateModal(false);
    setCurrentPage(1);
    await loadTickets(1);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId) return;
    const text = newMessageText.trim();
    if (!text) return;
    await api.supplyTickets.sendMessage(selectedTicketId, text);
    setNewMessageText("");
    const list = await api.supplyTickets.messages(selectedTicketId);
    setMessages(list);
    const last = list[list.length - 1];
    if (last && userId) {
      const ts = Date.parse(last.created_at || "");
      if (Number.isFinite(ts)) {
        writeReadTs(userId, selectedTicketId, ts);
        setReadVersion((v) => v + 1);
      }
    }
    await loadTickets(currentPage);
  };

  const toggleTicketStatus = async () => {
    if (!selectedTicket) return;
    const nextStatus = selectedTicket.status === "open" ? "closed" : "open";
    await api.supplyTickets.updateStatus(selectedTicket.id, nextStatus);
    if (nextStatus === "closed") {
      setSelectedTicketId(null);
      setMobileView("list");
    }
    await loadTickets(currentPage);
  };

  return (
    <div className="animate-slide-in space-y-5">
      <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
        Заявки на поставку
      </h1>

      <div className="rounded-xl p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <button
            type="button"
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
            onClick={() => setShowCreateModal(true)}
          >
            Создать
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{
                background: statusFilter === "open" ? "var(--accent-light)" : "var(--bg-secondary)",
                color: statusFilter === "open" ? "var(--accent)" : "var(--text-primary)",
                border: `1px solid ${statusFilter === "open" ? "var(--accent)" : "var(--border)"}`,
              }}
              onClick={() => {
                setStatusFilter("open");
                setCurrentPage(1);
                setSelectedTicketId(null);
              }}
            >
              Открытые
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{
                background: statusFilter === "closed" ? "var(--accent-light)" : "var(--bg-secondary)",
                color: statusFilter === "closed" ? "var(--accent)" : "var(--text-primary)",
                border: `1px solid ${statusFilter === "closed" ? "var(--accent)" : "var(--border)"}`,
              }}
              onClick={() => {
                setStatusFilter("closed");
                setCurrentPage(1);
                setSelectedTicketId(null);
              }}
            >
              Архив
            </button>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center p-3"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl p-4 md:p-5 space-y-3"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Новая заявка на поставку
              </div>
              <button
                type="button"
                className="px-2 py-1 rounded-md text-sm"
                style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
                onClick={() => setShowCreateModal(false)}
              >
                Закрыть
              </button>
            </div>

            <form onSubmit={createTicket} className="space-y-3">
              <div className="space-y-2">
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Торговая точка
                </div>
                <input
                  value={warehouseSearch}
                  onChange={(e) => setWarehouseSearch(e.target.value)}
                  placeholder="Поиск торговой точки..."
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
                <select
                  value={newWarehouseId}
                  onChange={(e) => setNewWarehouseId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                >
                  <option value="">Не выбрано</option>
                  {filteredWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Запрос
                </div>
                <textarea
                  value={newRequestText}
                  onChange={(e) => {
                    setNewRequestText(e.target.value);
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 400)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      const form = e.currentTarget.form;
                      if (form) form.requestSubmit();
                    }
                  }}
                  placeholder="Опишите запрос (что нужно поставить, количество, детали)... (Ctrl+Enter для отправки)"
                  className="w-full min-h-[130px] px-3 py-2 rounded-lg text-sm resize-none"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  required
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
                  onClick={() => setShowCreateModal(false)}
                >
                  Отмена
                </button>
                <button type="submit" className="px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: "var(--text-secondary)" }}>Загрузка...</div>
      ) : (
        <div className="space-y-4">
          <div className="md:hidden rounded-xl p-2 grid grid-cols-2 gap-2" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => setMobileView("list")}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{
                background: mobileView === "list" ? "var(--accent-light)" : "var(--bg-secondary)",
                color: mobileView === "list" ? "var(--accent)" : "var(--text-primary)",
                border: `1px solid ${mobileView === "list" ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              Список тикетов
            </button>
            <button
              type="button"
              onClick={() => setMobileView("chat")}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{
                background: mobileView === "chat" ? "var(--accent-light)" : "var(--bg-secondary)",
                color: mobileView === "chat" ? "var(--accent)" : "var(--text-primary)",
                border: `1px solid ${mobileView === "chat" ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              Чат по тикету
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-[340px_1fr]">
            <div className={`space-y-2 ${mobileView === "chat" ? "hidden md:block" : ""}`}>
              {tickets.map((ticket) => (
                <button
                  type="button"
                  key={ticket.id}
                  onClick={() => {
                    setSelectedTicketId(ticket.id);
                    setMobileView("chat");
                  }}
                  className="w-full text-left rounded-xl p-3"
                  style={{
                    background: selectedTicketId === ticket.id ? "var(--accent-light)" : "var(--bg-primary)",
                    border: unreadByTicketId.get(ticket.id) ? "1px solid rgba(222,53,11,0.45)" : "1px solid var(--border)",
                  }}
                >
                  <div className="font-semibold text-sm flex items-center justify-between gap-2" style={{ color: "var(--text-primary)" }}>
                    <span>#{ticket.id} · {ticket.warehouse_name || "Без точки"}</span>
                    {unreadByTicketId.get(ticket.id) ? (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(222,53,11,0.14)", color: "#de350b" }}>
                        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#de350b" }} />
                        Не прочитано
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Прочитано</span>
                    )}
                  </div>
                  <div className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{ticket.request_text}</div>
                  <div className="text-[11px] mt-2" style={{ color: "var(--text-tertiary)" }}>
                    {isAdmin ? `От: ${ticket.created_by_username || "пользователь"}` : "Мой тикет"}
                  </div>
                </button>
              ))}
              {tickets.length === 0 && <div style={{ color: "var(--text-secondary)" }}>Тикетов пока нет</div>}
              
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-3">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  >
                    ←
                  </button>
                  <span className="text-sm px-2" style={{ color: "var(--text-secondary)" }}>
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  >
                    →
                  </button>
                </div>
              )}
            </div>

            <div className={`rounded-xl p-4 ${mobileView === "list" ? "hidden md:block" : ""}`} style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
              {!selectedTicket ? (
                <div style={{ color: "var(--text-secondary)" }}>Выберите тикет</div>
              ) : (
                <div className="space-y-4">
                  <button
                    type="button"
                    className="md:hidden inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                    onClick={() => setMobileView("list")}
                  >
                    ← К списку
                  </button>
                  <div>
                    <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      Тикет #{selectedTicket.id} · {selectedTicket.warehouse_name || "Без точки"}
                    </div>
                    <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{selectedTicket.request_text}</div>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                      style={{
                        background: selectedTicket.status === "open" ? "rgba(25,135,84,0.14)" : "rgba(108,117,125,0.14)",
                        color: selectedTicket.status === "open" ? "#198754" : "#6c757d",
                      }}
                    >
                      {selectedTicket.status === "open" ? "Открыто" : "Закрыто"}
                    </span>
                    <button
                      type="button"
                      onClick={toggleTicketStatus}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                      style={{ background: selectedTicket.status === "open" ? "#c82333" : "var(--accent)" }}
                    >
                      {selectedTicket.status === "open" ? "Закрыть заявку" : "Открыть заявку"}
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {messages.map((msg) => (
                      <div key={msg.id} className="rounded-lg p-2.5" style={{ background: "var(--bg-secondary)" }}>
                        <div className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>{msg.author_username || "Пользователь"}</div>
                        <div className="text-sm" style={{ color: "var(--text-primary)" }}>{msg.message}</div>
                      </div>
                    ))}
                    {messages.length === 0 && <div style={{ color: "var(--text-secondary)" }}>Сообщений пока нет</div>}
                  </div>
                  <form onSubmit={sendMessage} className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={newMessageText}
                      onChange={(e) => setNewMessageText(e.target.value)}
                      placeholder="Напишите сообщение по тикету..."
                      className="flex-1 px-3 py-2 rounded-lg text-sm"
                      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                      required
                    />
                    <button type="submit" className="px-3 py-2 rounded-lg text-sm font-semibold text-white sm:w-auto w-full" style={{ background: "var(--accent)" }}>
                      Отправить
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
