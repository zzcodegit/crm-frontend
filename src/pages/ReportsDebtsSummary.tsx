import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import ReportsSubnav from "../components/ReportsSubnav";
import type { DebtSummaryRow, DebtTakeEventItem, EmployeeLedgerResponse, RefItem, TakenSummaryRow } from "../api";

const AMT_EPS = 1e-6;
const PAGE_SIZE = 100;

type MainTab = "debts" | "taken" | "employee";

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMoney(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtWarehouse(name?: string | null): string {
  const t = (name ?? "").trim();
  return t || "—";
}

/** Период/дата долга без времени (1С присылает «20.05.2026 0:00:00»). */
function fmtDebtReportMonth(v?: string | null): string {
  const raw = (v ?? "").trim();
  if (!raw) return "—";
  const dmy = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (dmy) return `${dmy[1]}.${dmy[2]}.${dmy[3]}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const head = raw.split(/\s+/)[0];
  return head || "—";
}

function ReportNumLink({ id, className }: { id: number; className?: string }) {
  return (
    <Link to={`/reports/${id}/edit`} className={className ?? "underline"} style={{ color: "var(--accent)" }}>
      #{id}
    </Link>
  );
}

function DebtSourceKindBadge({ kind }: { kind?: string | null }) {
  if (kind === "1c") return <>1С</>;
  if (kind === "manual") return <>Ручной</>;
  if (kind === "report") return <>Отчёт</>;
  return null;
}

function takenPart(r: DebtSummaryRow): number {
  const t = r.taken_amount;
  if (t == null || Number.isNaN(t)) return 0;
  return Math.max(0, t);
}

function debtTotal(r: DebtSummaryRow): number {
  const d = Number(r.debt_amount);
  return Number.isNaN(d) ? 0 : Math.max(0, d);
}

function remainingDebt(r: DebtSummaryRow): number {
  if (r.status === "taken") return 0;
  return Math.max(0, debtTotal(r) - takenPart(r));
}

/** Все зачёты по долгу (каждая строка «Взято» отдельно); fallback для старых ответов API. */
function takeEventsForDisplay(r: DebtSummaryRow): DebtTakeEventItem[] {
  const evs = r.take_events;
  if (evs && evs.length > 0) return evs;
  const taken = takenPart(r);
  if (taken > AMT_EPS && r.taken_report_id != null) {
    return [
      {
        amount: taken,
        report_id: r.taken_report_id,
        taken_at: r.taken_at,
        taken_user_id: r.taken_user_id,
        taken_user_name: r.taken_user_name ?? undefined,
        taken_reason_id: r.taken_reason_id ?? undefined,
        taken_reason_name: r.taken_reason_name,
      },
    ];
  }
  return [];
}

type RowStatusUi = { label: string; key: "open" | "partial" | "taken" };

function rowStatusUi(r: DebtSummaryRow): RowStatusUi {
  if (r.status === "taken") {
    return { label: "Закрыт", key: "taken" };
  }
  if (takenPart(r) > AMT_EPS) {
    return { label: "Частично", key: "partial" };
  }
  return { label: "Открыт", key: "open" };
}

function canDeleteManualDebt(r: DebtSummaryRow): boolean {
  return (
    r.manual_debt_id != null &&
    (r.debt_source === "manual" || r.debt_report_id === 0) &&
    takenPart(r) <= AMT_EPS
  );
}

function canDeleteOneCDebt(r: DebtSummaryRow): boolean {
  return r.debt_source === "1c" && !!r.debt_row_uid && takenPart(r) <= AMT_EPS;
}

/** Ключ строки для массового выбора (только удаляемые без зачётов). */
function rowBulkSelectKey(r: DebtSummaryRow): string | null {
  if (canDeleteManualDebt(r) && r.manual_debt_id != null) return `manual:${r.manual_debt_id}`;
  if (canDeleteOneCDebt(r)) return `1c:${r.debt_row_uid}`;
  return null;
}

function canBulkSelectRow(r: DebtSummaryRow): boolean {
  return rowBulkSelectKey(r) != null;
}

/** Ручная запись долга (админ может корректировать / гасить). */
function isManualDebtAdminRow(r: DebtSummaryRow): boolean {
  return r.manual_debt_id != null && (r.debt_source === "manual" || r.debt_report_id === 0);
}

function isOneCDebtAdminRow(r: DebtSummaryRow): boolean {
  return r.debt_source === "1c" && !!r.debt_row_uid;
}

/** Долг из сменного отчёта (не 1С, не ручная запись). */
function isReportDebtAdminRow(r: DebtSummaryRow): boolean {
  return r.debt_source === "report" && r.debt_report_id > 0 && r.manual_debt_id == null;
}

type ReportsDebtsSummaryProps = {
  consultantSelfView?: boolean;
  withholdingView?: boolean;
};

type DebtsSummaryNavState = { tab?: MainTab } | null;

export default function ReportsDebtsSummary({ consultantSelfView = false, withholdingView = false }: ReportsDebtsSummaryProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState<MainTab>(withholdingView ? "taken" : "debts");
  const [rows, setRows] = useState<DebtSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debtsVisibleCount, setDebtsVisibleCount] = useState(PAGE_SIZE);

  const [takenRows, setTakenRows] = useState<TakenSummaryRow[]>([]);
  const [takenLoading, setTakenLoading] = useState(false);
  const [takenSearch, setTakenSearch] = useState("");
  const [takenVisibleCount, setTakenVisibleCount] = useState(PAGE_SIZE);

  const [consultants, setConsultants] = useState<{ id: number; last_name: string }[]>([]);
  const [debtReasons, setDebtReasons] = useState<RefItem[]>([]);
  const [warehouses, setWarehouses] = useState<RefItem[]>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [newUserId, setNewUserId] = useState<number | "">("");
  const [newAmount, setNewAmount] = useState("");
  const [newReasonId, setNewReasonId] = useState<number | "">("");
  const [newWhId, setNewWhId] = useState<number | "">("");
  const [newMonth, setNewMonth] = useState("");
  const [newOrder, setNewOrder] = useState("");
  const [newNote, setNewNote] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState("");
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [deleteOneCBusyUid, setDeleteOneCBusyUid] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);
  const [settleBusyId, setSettleBusyId] = useState<number | null>(null);
  const [settleOneCBusyUid, setSettleOneCBusyUid] = useState<string | null>(null);
  const [closeReportBusyUid, setCloseReportBusyUid] = useState<string | null>(null);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustRow, setAdjustRow] = useState<DebtSummaryRow | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReasonId, setAdjustReasonId] = useState<number | "">("");
  const [adjustWhId, setAdjustWhId] = useState<number | "">("");
  const [adjustMonth, setAdjustMonth] = useState("");
  const [adjustOrder, setAdjustOrder] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState("");

  const [withholdOpen, setWithholdOpen] = useState(false);
  const [withholdRow, setWithholdRow] = useState<DebtSummaryRow | null>(null);
  const [withholdAmount, setWithholdAmount] = useState("");
  const [withholdReason, setWithholdReason] = useState("");
  const [withholdNote, setWithholdNote] = useState("");
  const [withholdSubmitting, setWithholdSubmitting] = useState(false);
  const [withholdError, setWithholdError] = useState("");

  const [empUserId, setEmpUserId] = useState<number | "">("");
  const [empFromDate, setEmpFromDate] = useState("");
  const [empToDate, setEmpToDate] = useState("");
  const [ledger, setLedger] = useState<EmployeeLedgerResponse | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState("");

  const loadDebts = useCallback(() => {
    setLoading(true);
    const req = consultantSelfView ? api.reports.debtsMySummary() : api.reports.debtsSummary();
    req
      .then((r) => setRows(Array.isArray(r.rows) ? r.rows : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [consultantSelfView]);

  const loadTaken = useCallback(() => {
    setTakenLoading(true);
    const req = consultantSelfView ? api.reports.takenMySummary() : api.reports.takenSummary();
    req
      .then((r) => setTakenRows(Array.isArray(r.rows) ? r.rows : []))
      .catch(() => setTakenRows([]))
      .finally(() => setTakenLoading(false));
  }, [consultantSelfView]);

  useEffect(() => {
    loadDebts();
    if (!consultantSelfView) {
      api.reports.consultants().then(setConsultants).catch(() => setConsultants([]));
      api.ref.debtReasons.list().then(setDebtReasons).catch(() => setDebtReasons([]));
      api.ref.warehouses.list().then(setWarehouses).catch(() => setWarehouses([]));
    }
  }, [loadDebts, consultantSelfView]);

  useEffect(() => {
    if (consultantSelfView && tab === "employee") setTab("debts");
  }, [consultantSelfView, tab]);

  useEffect(() => {
    if (withholdingView && tab !== "taken") setTab("taken");
  }, [withholdingView, tab]);

  useEffect(() => {
    if (tab === "taken") loadTaken();
  }, [tab, loadTaken]);

  useEffect(() => {
    const st = location.state as DebtsSummaryNavState;
    if (st?.tab === "taken" || st?.tab === "debts") {
      setTab(st.tab);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  /** Полностью закрытые долги — только во вкладке «Взято». */
  const activeDebtRows = useMemo(() => rows.filter((r) => r.status !== "taken"), [rows]);

  const closedDebtRows = useMemo(() => rows.filter((r) => r.status === "taken"), [rows]);

  useEffect(() => {
    const valid = new Set(
      activeDebtRows.map((r) => rowBulkSelectKey(r)).filter((k): k is string => k != null),
    );
    setSelectedRowKeys((prev) => {
      const next = new Set([...prev].filter((k) => valid.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [activeDebtRows]);

  const closedDebtsTotals = useMemo(() => {
    let sum = 0;
    for (const r of closedDebtRows) {
      sum += debtTotal(r);
    }
    return { count: closedDebtRows.length, sum };
  }, [closedDebtRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeDebtRows;
    return activeDebtRows.filter((r) => {
      const hay = [
        r.debt_user_name,
        r.debt_warehouse_name ?? "",
        r.debt_reason_name ?? "",
        r.debt_order_number ?? "",
        r.taken_user_name ?? "",
        r.taken_reason_name ?? "",
        String(r.debt_report_id),
        r.debt_report_month ?? "",
        String(takenPart(r)),
        String(remainingDebt(r)),
        r.debt_source ?? "",
        r.admin_note ?? "",
        String(r.manual_debt_id ?? ""),
        ...(r.take_events ?? []).flatMap((e) => [
          String(e.amount),
          e.taken_user_name ?? "",
          e.taken_reason_name ?? "",
          String(e.report_id),
          e.taken_at ?? "",
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [activeDebtRows, search]);

  useEffect(() => {
    setDebtsVisibleCount(PAGE_SIZE);
  }, [search, activeDebtRows.length]);

  const debtsFilterActive = search.trim().length > 0;
  const visibleDebts = useMemo(
    () => (debtsFilterActive ? filtered : filtered.slice(0, debtsVisibleCount)),
    [filtered, debtsVisibleCount, debtsFilterActive],
  );
  const debtsHasMore = !debtsFilterActive && debtsVisibleCount < filtered.length;

  const filteredTaken = useMemo(() => {
    const q = takenSearch.trim().toLowerCase();
    if (!q) return takenRows;
    return takenRows.filter((r) => {
      const hay = [
        r.user_name,
        String(r.user_id),
        String(r.report_id),
        r.taken_reason_name ?? "",
        r.taken_source_name ?? "",
        r.debt_source_label ?? "",
        r.debt_source_kind ?? "",
        r.debt_reason_name ?? "",
        r.order_number,
        r.report_month ?? "",
        r.warehouse_name ?? "",
        String(r.amount),
        r.linked_debt_row_uid ?? "",
        String(r.linked_debt_report_id ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [takenRows, takenSearch]);

  useEffect(() => {
    setTakenVisibleCount(PAGE_SIZE);
  }, [takenSearch, takenRows.length]);

  const takenFilterActive = takenSearch.trim().length > 0;
  const visibleTaken = useMemo(
    () => (takenFilterActive ? filteredTaken : filteredTaken.slice(0, takenVisibleCount)),
    [filteredTaken, takenVisibleCount, takenFilterActive],
  );
  const takenHasMore = !takenFilterActive && takenVisibleCount < filteredTaken.length;

  const deletableInView = useMemo(
    () => visibleDebts.filter((r) => canBulkSelectRow(r)),
    [visibleDebts],
  );

  const allDeletableSelected = useMemo(() => {
    if (deletableInView.length === 0) return false;
    return deletableInView.every((r) => {
      const k = rowBulkSelectKey(r);
      return k != null && selectedRowKeys.has(k);
    });
  }, [deletableInView, selectedRowKeys]);

  const someDeletableSelected = selectedRowKeys.size > 0;

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el) return;
    el.indeterminate = someDeletableSelected && !allDeletableSelected;
  }, [someDeletableSelected, allDeletableSelected]);

  const toggleRowSelected = (r: DebtSummaryRow) => {
    const key = rowBulkSelectKey(r);
    if (!key) return;
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAllDeletable = () => {
    if (allDeletableSelected) {
      setSelectedRowKeys(new Set());
      return;
    }
    const next = new Set<string>();
    for (const r of deletableInView) {
      const k = rowBulkSelectKey(r);
      if (k) next.add(k);
    }
    setSelectedRowKeys(next);
  };

  const clearRowSelection = () => setSelectedRowKeys(new Set());

  const bulkDeleteSelected = async () => {
    const toDelete = filtered.filter((r) => {
      const k = rowBulkSelectKey(r);
      return k != null && selectedRowKeys.has(k);
    });
    if (toDelete.length === 0) return;
    if (
      !window.confirm(
        `Удалить выбранные записи (${toDelete.length})? Действие необратимо. Удаляются только строки без зачётов в «Взято».`,
      )
    ) {
      return;
    }
    setBulkDeleteBusy(true);
    const failed: string[] = [];
    for (const r of toDelete) {
      try {
        if (canDeleteManualDebt(r) && r.manual_debt_id != null) {
          await api.reports.deleteManualDebt(r.manual_debt_id);
        } else if (canDeleteOneCDebt(r)) {
          await api.reports.deleteOneCDebtItem(r.debt_row_uid);
        }
      } catch (e) {
        const label =
          r.debt_user_name ||
          (r.manual_debt_id != null ? `запись №${r.manual_debt_id}` : r.debt_row_uid);
        failed.push(`${label}: ${e instanceof Error ? e.message : "ошибка"}`);
      }
    }
    clearRowSelection();
    loadDebts();
    setBulkDeleteBusy(false);
    if (failed.length > 0) {
      alert(`Не удалось удалить ${failed.length} из ${toDelete.length}:\n${failed.slice(0, 8).join("\n")}${failed.length > 8 ? "\n…" : ""}`);
    }
  };

  const totals = useMemo(() => {
    let openLines = 0;
    let partialLines = 0;
    let remainingSum = 0;
    let takenRecordedSum = 0;

    for (const r of filtered) {
      const taken = takenPart(r);
      const rem = remainingDebt(r);

      if (rem > AMT_EPS) {
        openLines += 1;
        remainingSum += rem;
        if (taken > AMT_EPS) partialLines += 1;
        takenRecordedSum += taken;
      }
    }

    return {
      openLines,
      partialLines,
      remainingSum,
      takenRecordedSum,
    };
  }, [filtered]);

  const takenTotals = useMemo(() => {
    const linked = filteredTaken.filter((r) => r.is_linked_debt_take).reduce((s, r) => s + r.amount, 0);
    const all = filteredTaken.reduce((s, r) => s + r.amount, 0);
    return { count: filteredTaken.length, all, linked };
  }, [filteredTaken]);

  const submitManualDebt = async () => {
    setAddError("");
    if (newUserId === "") {
      setAddError("Выберите сотрудника");
      return;
    }
    const amt = parseFloat(newAmount.replace(",", ".").trim());
    if (Number.isNaN(amt) || amt <= 0) {
      setAddError("Укажите сумму больше нуля");
      return;
    }
    setAddSubmitting(true);
    try {
      await api.reports.createManualDebt({
        user_id: Number(newUserId),
        amount: amt,
        debt_reason_id: newReasonId === "" ? undefined : Number(newReasonId),
        warehouse_id: newWhId === "" ? undefined : Number(newWhId),
        report_month: newMonth.trim() || undefined,
        order_number: newOrder.trim(),
        note: newNote.trim() || undefined,
      });
      setNewAmount("");
      setNewNote("");
      setNewOrder("");
      setAddOpen(false);
      loadDebts();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setAddSubmitting(false);
    }
  };

  const deleteManual = async (id: number) => {
    if (!window.confirm("Удалить ручную запись долга?")) return;
    setDeleteBusyId(id);
    try {
      await api.reports.deleteManualDebt(id);
      loadDebts();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setDeleteBusyId(null);
    }
  };

  const deleteOneC = async (debtRowUid: string) => {
    if (!window.confirm("Удалить эту строку долга из сводки (1С)?")) return;
    setDeleteOneCBusyUid(debtRowUid);
    try {
      await api.reports.deleteOneCDebtItem(debtRowUid);
      loadDebts();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setDeleteOneCBusyUid(null);
    }
  };

  const closeReportDebt = async (debtRowUid: string, reportId: number) => {
    if (
      !window.confirm(
        `Закрыть долг из отчёта №${reportId}? Непогашенный остаток будет записан в «Взято» этого отчёта; долг исчезнет из активной сводки.`,
      )
    ) {
      return;
    }
    setCloseReportBusyUid(debtRowUid);
    try {
      await api.reports.closeReportDebtItem(debtRowUid);
      navigate("/reports/debts-summary", { replace: true, state: { tab: "taken" as const } });
      loadDebts();
      loadTaken();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось закрыть долг");
    } finally {
      setCloseReportBusyUid(null);
    }
  };

  const settleManual = async (id: number) => {
    if (
      !window.confirm(
        "Погасить долг полностью? Сумма записи будет приведена к уже зачтённому в «Взято» (остаток станет нулём). Если зачётов не было — запись будет удалена."
      )
    )
      return;
    setSettleBusyId(id);
    try {
      await api.reports.settleManualDebt(id);
      loadDebts();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось погасить");
    } finally {
      setSettleBusyId(null);
    }
  };

  const settleOneC = async (uid: string) => {
    if (
      !window.confirm(
        "Погасить долг 1С полностью? Сумма записи будет приведена к уже зачтённому в «Взято» (остаток станет нулём). Если зачётов не было — строка будет удалена."
      )
    )
      return;
    setSettleOneCBusyUid(uid);
    try {
      await api.reports.settleOneCDebtItem(uid);
      loadDebts();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось погасить");
    } finally {
      setSettleOneCBusyUid(null);
    }
  };

  const openAdjust = (r: DebtSummaryRow) => {
    if (isManualDebtAdminRow(r) && r.manual_debt_id != null) {
      setAdjustRow(r);
      setAdjustAmount(String(debtTotal(r)));
      setAdjustReasonId(r.debt_reason_id ?? "");
      setAdjustWhId(r.debt_warehouse_id ?? "");
      setAdjustMonth(r.debt_report_month ?? "");
      setAdjustOrder(r.debt_order_number ?? "");
      setAdjustNote(r.admin_note ?? "");
      setAdjustError("");
      setAdjustOpen(true);
      return;
    }
    if (isOneCDebtAdminRow(r)) {
      setAdjustRow(r);
      setAdjustAmount(String(debtTotal(r)));
      setAdjustReasonId("");
      setAdjustWhId(r.debt_warehouse_id ?? "");
      setAdjustMonth(r.debt_report_month ?? "");
      setAdjustOrder(r.debt_order_number ?? "");
      setAdjustNote(r.admin_note ?? "");
      setAdjustError("");
      setAdjustOpen(true);
    }
  };

  const submitAdjust = async () => {
    if (!adjustRow) return;
    setAdjustError("");
    const amt = parseFloat(adjustAmount.replace(",", ".").trim());
    if (Number.isNaN(amt) || amt < 0) {
      setAdjustError("Укажите корректную сумму");
      return;
    }
    const taken = takenPart(adjustRow);
    if (amt + AMT_EPS < taken) {
      setAdjustError(`Сумма не может быть меньше уже зачтённого: ${fmtMoney(taken)}`);
      return;
    }
    if (amt <= AMT_EPS && taken > AMT_EPS) {
      setAdjustError(
        "Нельзя обнулить долг при уже зачтённой сумме. Используйте «Погасить полностью» или укажите сумму не ниже зачтённого."
      );
      return;
    }
    setAdjustSubmitting(true);
    try {
      if (isOneCDebtAdminRow(adjustRow)) {
        await api.reports.updateOneCDebtItem(adjustRow.debt_row_uid, {
          amount: amt,
          warehouse_id: adjustWhId === "" ? null : Number(adjustWhId),
          report_month: adjustMonth.trim() || null,
          order_number: adjustOrder.trim(),
          note: adjustNote.trim() || null,
        });
      } else if (adjustRow.manual_debt_id != null) {
        await api.reports.updateManualDebt(adjustRow.manual_debt_id, {
          amount: amt,
          debt_reason_id: adjustReasonId === "" ? null : Number(adjustReasonId),
          warehouse_id: adjustWhId === "" ? null : Number(adjustWhId),
          report_month: adjustMonth.trim() || null,
          order_number: adjustOrder.trim(),
          note: adjustNote.trim() || null,
        });
      } else {
        setAdjustError("Неизвестный тип записи");
        return;
      }
      setAdjustOpen(false);
      setAdjustRow(null);
      loadDebts();
    } catch (e) {
      setAdjustError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const openWithhold = (r: DebtSummaryRow) => {
    if (!isManualDebtAdminRow(r) && !isOneCDebtAdminRow(r)) return;
    const rem = remainingDebt(r);
    setWithholdRow(r);
    setWithholdAmount(rem > AMT_EPS ? String(rem) : String(debtTotal(r) || ""));
    setWithholdReason((r.debt_reason_name || "").trim());
    setWithholdNote((r.admin_note || "").trim());
    setWithholdError("");
    setWithholdOpen(true);
  };

  const submitWithhold = async () => {
    if (!withholdRow) return;
    setWithholdError("");
    const amt = parseFloat(withholdAmount.replace(",", ".").trim());
    if (Number.isNaN(amt) || amt <= AMT_EPS) {
      setWithholdError("Укажите сумму удержания больше нуля");
      return;
    }
    setWithholdSubmitting(true);
    try {
      if (isManualDebtAdminRow(withholdRow) && withholdRow.manual_debt_id != null) {
        await api.reports.withholdManualDebt(withholdRow.manual_debt_id, {
          amount: amt,
          reason: withholdReason.trim() || null,
          note: withholdNote.trim() || null,
        });
      } else if (isOneCDebtAdminRow(withholdRow)) {
        const noteParts = [
          withholdNote.trim(),
          `По долгу 1С (${withholdRow.debt_row_uid.slice(0, 8)}…)`,
        ].filter(Boolean);
        await api.reports.createWithholding({
          user_id: withholdRow.debt_user_id,
          amount: amt,
          warehouse_id: withholdRow.debt_warehouse_id ?? null,
          report_month: (withholdRow.debt_report_month || "").trim() || null,
          reason: withholdReason.trim() || null,
          note: noteParts.join(" · ") || null,
        });
      } else {
        setWithholdError("Неизвестный тип записи");
        return;
      }
      setWithholdOpen(false);
      setWithholdRow(null);
      loadDebts();
    } catch (e) {
      setWithholdError(e instanceof Error ? e.message : "Не удалось создать удержание");
    } finally {
      setWithholdSubmitting(false);
    }
  };

  const loadLedger = async () => {
    setLedgerError("");
    if (empUserId === "") {
      setLedgerError("Выберите сотрудника");
      return;
    }
    setLedgerLoading(true);
    try {
      const res = await api.reports.employeeLedger(Number(empUserId));
      setLedger(res);
    } catch (e) {
      setLedger(null);
      setLedgerError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLedgerLoading(false);
    }
  };

  const filteredLedgerLines = useMemo(() => {
    if (!ledger) return [];
    const from = empFromDate ? new Date(empFromDate + "T00:00:00") : null;
    const to = empToDate ? new Date(empToDate + "T23:59:59") : null;
    const fromTs = from && !Number.isNaN(from.getTime()) ? from.getTime() : null;
    const toTs = to && !Number.isNaN(to.getTime()) ? to.getTime() : null;
    if (fromTs == null && toTs == null) return ledger.lines;
    return ledger.lines.filter((ln) => {
      const d = ln.at ? new Date(ln.at) : null;
      const ts = d && !Number.isNaN(d.getTime()) ? d.getTime() : null;
      if (ts == null) return true;
      if (fromTs != null && ts < fromTs) return false;
      if (toTs != null && ts > toTs) return false;
      return true;
    });
  }, [ledger, empFromDate, empToDate]);

  const tabBtn = (id: MainTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      style={{
        background: tab === id ? "var(--accent)" : "var(--bg-secondary)",
        color: tab === id ? "#fff" : "var(--text-primary)",
        border: "1px solid var(--border)",
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="w-full animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            {withholdingView
              ? "Удержание"
              : consultantSelfView
                ? "Моя статистика: долги и «Взято»"
                : "К взятию и взято"}
          </h1>
          <p className="text-sm mt-1 max-w-3xl" style={{ color: "var(--text-secondary)" }}>
            {withholdingView
              ? "Сводка по строкам удержания (блок «Взято» в отчётах)."
              : consultantSelfView
                ? "Открытые долги — вкладка «Долги к взятию»; полностью закрытые и «Взято» — вкладка «Взято»."
                : "Вкладка «Долги к взятию» — только открытые и частично закрытые. Полностью закрытые — во вкладке «Взято»."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {!withholdingView ? tabBtn("debts", "Долги к взятию") : null}
          {tabBtn("taken", withholdingView ? "Удержание" : "Взято")}
          {!consultantSelfView && !withholdingView ? tabBtn("employee", "По сотруднику") : null}
          <Link
            to="/reports"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
          >
            К отчётам
          </Link>
        </div>
      </div>

      {!consultantSelfView ? <ReportsSubnav active={withholdingView ? "withholding" : "debts"} /> : null}

      {tab === "debts" && (
        <>
          <div className="rounded-2xl border p-4 mb-4" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {consultantSelfView ? "Итоги по вашим долгам" : "Итоги по долгам"}
              </span>
              {!consultantSelfView && (
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen((v) => !v);
                    setAddError("");
                  }}
                  className="text-sm font-medium px-4 py-2 rounded-lg"
                  style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--border)" }}
                >
                  {addOpen ? "Скрыть форму" : "+ Долг сотруднику (вручную)"}
                </button>
              )}
            </div>
            {addOpen && !consultantSelfView && (
              <div
                className="mb-4 p-4 rounded-xl space-y-3"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              >
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Запись появится у сотрудника в списке доступных долгов в отчёте (как мотивация и т.п.). В таблице:
                  «Погасить полностью» / «Корректировка» / «Удержать» — для ручных записей и долгов из 1С.
                  «Удержать» создаёт удержание (баланс может уйти в минус). «Удалить» — только пока нет зачёта в
                  «Взято».
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <label className="block text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>Сотрудник (консультант)</span>
                    <select
                      value={newUserId === "" ? "" : String(newUserId)}
                      onChange={(e) => setNewUserId(e.target.value === "" ? "" : Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                    >
                      <option value="">—</option>
                      {consultants.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.last_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>Сумма долга</span>
                    <input
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm tabular-nums"
                      style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                      placeholder="0"
                    />
                  </label>
                  <label className="block text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>Причина долга</span>
                    <select
                      value={newReasonId === "" ? "" : String(newReasonId)}
                      onChange={(e) => setNewReasonId(e.target.value === "" ? "" : Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                    >
                      <option value="">—</option>
                      {debtReasons.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>Точка (необязательно)</span>
                    <select
                      value={newWhId === "" ? "" : String(newWhId)}
                      onChange={(e) => setNewWhId(e.target.value === "" ? "" : Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                    >
                      <option value="">—</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>Период (месяц/дата, текстом)</span>
                    <input
                      value={newMonth}
                      onChange={(e) => setNewMonth(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                      placeholder="например 03 или 2026-04"
                    />
                  </label>
                  <label className="block text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>Заказ №</span>
                    <input
                      value={newOrder}
                      onChange={(e) => setNewOrder(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>Комментарий</span>
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                  />
                </label>
                {addError && (
                  <div className="text-sm" style={{ color: "var(--error)" }}>
                    {addError}
                  </div>
                )}
                <button
                  type="button"
                  disabled={addSubmitting}
                  onClick={() => void submitManualDebt()}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "var(--accent)" }}
                >
                  {addSubmitting ? "Сохранение…" : "Сохранить долг"}
                </button>
              </div>
            )}
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Полностью закрытые долги ({closedDebtsTotals.count}
              {closedDebtsTotals.count > 0 ? `, ${fmtMoney(closedDebtsTotals.sum)}` : ""}) — во вкладке «
              <button
                type="button"
                className="underline font-medium"
                style={{ color: "var(--accent)" }}
                onClick={() => setTab("taken")}
              >
                Взято
              </button>
              ».
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div style={{ color: "var(--text-secondary)" }}>
                Строк с остатком:{" "}
                <span className="font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {totals.openLines}
                </span>
              </div>
              <div style={{ color: "var(--text-secondary)" }}>
                Из них частично:{" "}
                <span className="font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {totals.partialLines}
                </span>
              </div>
              <div style={{ color: "var(--text-secondary)" }}>
                Остаток к забору:{" "}
                <span className="font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {fmtMoney(totals.remainingSum)}
                </span>
              </div>
              <div style={{ color: "var(--text-secondary)" }}>
                Зачтено (по открытым):{" "}
                <span className="font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {fmtMoney(totals.takenRecordedSum)}
                </span>
              </div>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                consultantSelfView
                  ? "Поиск: точка, причина, № отчёта, суммы…"
                  : "Поиск: точка, причина, № отчёта, суммы…"
              }
              className="mt-3 w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
            />
            {!consultantSelfView && deletableInView.length > 0 ? (
              <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                Отметьте строки без зачётов в «Взято» — можно удалить несколько сразу (ручные записи и строки 1С).
              </p>
            ) : null}
          </div>

          {!consultantSelfView && someDeletableSelected ? (
            <div
              className="mb-3 flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl border"
              style={{ borderColor: "var(--border)", background: "var(--accent-light)" }}
            >
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Выбрано: {selectedRowKeys.size}
              </span>
              <button
                type="button"
                disabled={bulkDeleteBusy}
                onClick={() => void bulkDeleteSelected()}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "var(--error)" }}
              >
                {bulkDeleteBusy ? "Удаление…" : "Удалить выбранные"}
              </button>
              <button
                type="button"
                disabled={bulkDeleteBusy}
                onClick={clearRowSelection}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border disabled:opacity-50"
                style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
              >
                Снять выделение
              </button>
            </div>
          ) : null}

          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
            {loading ? (
              <div className="p-8 text-center" style={{ color: "var(--text-secondary)" }}>
                Загрузка…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center" style={{ color: "var(--text-secondary)" }}>
                {activeDebtRows.length === 0 && closedDebtRows.length > 0
                  ? "Открытых долгов нет. Полностью закрытые — во вкладке «Взято»."
                  : "Нет данных"}
              </div>
            ) : (
              <>
                <div className="overflow-auto max-h-[72vh]">
                  <table
                    className={`w-full text-sm border-collapse ${consultantSelfView ? "min-w-[1320px]" : "min-w-[1760px]"}`}
                  >
                    <thead className="sticky top-0 z-10">
                      <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
                        {!consultantSelfView ? (
                          <th className="text-center px-2 py-2 w-10">
                            <input
                              ref={selectAllCheckboxRef}
                              type="checkbox"
                              checked={allDeletableSelected}
                              disabled={deletableInView.length === 0 || bulkDeleteBusy}
                              onChange={toggleSelectAllDeletable}
                              title={
                                deletableInView.length === 0
                                  ? "Нет строк, доступных для удаления"
                                  : allDeletableSelected
                                    ? "Снять выделение со всех"
                                    : `Выбрать все удаляемые (${deletableInView.length})`
                              }
                              aria-label="Выбрать все удаляемые строки"
                            />
                          </th>
                        ) : null}
                        <th className="text-left px-3 py-2">Источник</th>
                        <th className="text-left px-3 py-2">Статус</th>
                        <th className="text-left px-3 py-2 min-w-[160px]">Точка</th>
                        {!consultantSelfView ? <th className="text-left px-3 py-2">Кто должен</th> : null}
                        <th className="text-left px-3 py-2">За что долг</th>
                        <th className="text-right px-3 py-2">Сумма долга</th>
                        <th className="text-right px-3 py-2">Зачтено</th>
                        <th className="text-right px-3 py-2">Остаток</th>
                        <th className="text-left px-3 py-2">Период</th>
                        <th className="text-left px-3 py-2">Отчёт / запись</th>
                        <th className="text-left px-3 py-2 min-w-[240px]">Зачёты по отчётам</th>
                        {!consultantSelfView ? (
                          <th className="text-left px-3 py-2 min-w-[200px]">Действия</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleDebts.map((r) => {
                      const st = rowStatusUi(r);
                      const debt = debtTotal(r);
                      const taken = takenPart(r);
                      const rem = remainingDebt(r);
                      const isFrom1c = r.debt_source === "1c";
                      const isManual = !isFrom1c && (r.debt_source === "manual" || r.manual_debt_id != null || r.debt_report_id === 0);
                      const badgeStyle =
                        st.key === "taken"
                          ? { background: "var(--accent-light)", color: "var(--accent)" }
                          : st.key === "partial"
                            ? { background: "rgba(234, 179, 8, 0.15)", color: "rgb(161, 98, 7)" }
                            : { background: "var(--bg-secondary)", color: "var(--text-secondary)" };
                      const selectKey = rowBulkSelectKey(r);
                      const isSelected = selectKey != null && selectedRowKeys.has(selectKey);
                      return (
                        <tr
                          key={r.debt_row_uid}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            background: isSelected ? "rgba(87, 157, 255, 0.06)" : undefined,
                          }}
                        >
                          {!consultantSelfView ? (
                            <td className="text-center px-2 py-2 align-top">
                              {selectKey ? (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={bulkDeleteBusy}
                                  onChange={() => toggleRowSelected(r)}
                                  aria-label={`Выбрать строку ${r.debt_user_name || r.debt_row_uid}`}
                                />
                              ) : (
                                <span className="text-xs" style={{ color: "var(--text-tertiary)" }} title="Есть зачёт в «Взято» — удаление недоступно">
                                  —
                                </span>
                              )}
                            </td>
                          ) : null}
                          <td className="px-3 py-2">
                            <span
                              className="text-xs font-medium px-2 py-0.5 rounded"
                              style={{
                                background: isFrom1c
                                  ? "rgba(14, 165, 233, 0.15)"
                                  : isManual
                                    ? "rgba(99, 102, 241, 0.15)"
                                    : "var(--bg-secondary)",
                                color: isFrom1c
                                  ? "rgb(3, 105, 161)"
                                  : isManual
                                    ? "rgb(79, 70, 229)"
                                    : "var(--text-secondary)",
                              }}
                            >
                              {isFrom1c ? "1С" : isManual ? "Вручную" : "Отчёт"}
                            </span>
                            {r.admin_note ? (
                              <div
                                className="text-xs mt-1 max-w-[280px] whitespace-pre-wrap break-words line-clamp-4"
                                title={r.admin_note}
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                {r.admin_note}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <span className="px-2 py-1 rounded-md text-xs font-medium" style={badgeStyle}>
                              {st.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 min-w-[160px]">
                            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                              {fmtWarehouse(r.debt_warehouse_name)}
                            </span>
                          </td>
                          {!consultantSelfView ? (
                            <td className="px-3 py-2">{r.debt_user_name || `ID ${r.debt_user_id}`}</td>
                          ) : null}
                          <td className="px-3 py-2">{r.debt_reason_name || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(debt)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{taken > AMT_EPS ? fmtMoney(taken) : "—"}</td>
                          <td
                            className="px-3 py-2 text-right tabular-nums font-medium"
                            style={{ color: rem > AMT_EPS ? "var(--text-primary)" : "var(--text-tertiary)" }}
                          >
                            {fmtMoney(rem)}
                          </td>
                          <td className="px-3 py-2">{fmtDebtReportMonth(r.debt_report_month)}</td>
                          <td className="px-3 py-2">
                            {isManual && r.manual_debt_id != null ? (
                              <>Запись №{r.manual_debt_id}</>
                            ) : isFrom1c ? (
                              <>
                                1С
                                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                  {fmtDate(r.debt_submitted_at || r.debt_created_at)}
                                </div>
                              </>
                            ) : r.debt_report_id > 0 ? (
                              <>
                                #{r.debt_report_id}
                                {!consultantSelfView ? (
                                  <div className="text-xs mt-0.5">
                                    <Link
                                      to={`/reports/${r.debt_report_id}/edit`}
                                      className="underline"
                                      style={{ color: "var(--accent)" }}
                                    >
                                      Открыть
                                    </Link>
                                  </div>
                                ) : null}
                                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                  {fmtDate(r.debt_submitted_at || r.debt_created_at)}
                                </div>
                              </>
                            ) : (
                              <>
                                —
                                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                  {fmtDate(r.debt_submitted_at || r.debt_created_at)}
                                </div>
                              </>
                            )}
                            {r.debt_order_number ? (
                              <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                                Заказ №{r.debt_order_number}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 align-top min-w-[240px]">
                            {(() => {
                              const events = takeEventsForDisplay(r);
                              if (events.length === 0) return "—";
                              return events.map((ev, i) => (
                                <div
                                  key={`${ev.report_id}-${ev.taken_at ?? ""}-${i}`}
                                  className="py-1.5 border-b border-dashed last:border-b-0 last:pb-0"
                                  style={{ borderColor: "var(--border)" }}
                                >
                                  <div className="font-medium tabular-nums">{fmtMoney(ev.amount)}</div>
                                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                                    {(ev.taken_user_name ?? "").trim() || "—"} · {fmtDate(ev.taken_at)}
                                  </div>
                                  {ev.taken_reason_name ? (
                                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                      {ev.taken_reason_name}
                                    </div>
                                  ) : null}
                                  {ev.report_id > 0 ? (
                                    <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                                      Отчёт #{ev.report_id}
                                      {!consultantSelfView ? (
                                        <>
                                          {" "}
                                          <Link to={`/reports/${ev.report_id}/edit`} className="underline" style={{ color: "var(--accent)" }}>
                                            Редактировать
                                          </Link>
                                        </>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              ));
                            })()}
                          </td>
                          {!consultantSelfView ? (
                            <td className="px-3 py-2 align-top">
                              {isManualDebtAdminRow(r) ? (
                                <div className="flex flex-col gap-1.5 items-start max-w-[200px]">
                                  {remainingDebt(r) > AMT_EPS ? (
                                    <button
                                      type="button"
                                      disabled={settleBusyId === r.manual_debt_id}
                                      onClick={() => void settleManual(r.manual_debt_id!)}
                                      className="text-xs font-medium underline disabled:opacity-50"
                                      style={{ color: "var(--accent)" }}
                                    >
                                      {settleBusyId === r.manual_debt_id ? "…" : "Погасить полностью"}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => openAdjust(r)}
                                    className="text-xs font-medium underline"
                                    style={{ color: "var(--text-primary)" }}
                                  >
                                    Корректировка
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openWithhold(r)}
                                    className="text-xs font-medium underline"
                                    style={{ color: "var(--accent)" }}
                                  >
                                    Удержать
                                  </button>
                                  {canDeleteManualDebt(r) && r.manual_debt_id != null ? (
                                    <button
                                      type="button"
                                      disabled={deleteBusyId === r.manual_debt_id}
                                      onClick={() => void deleteManual(r.manual_debt_id!)}
                                      className="text-xs font-medium underline disabled:opacity-50"
                                      style={{ color: "var(--error)" }}
                                    >
                                      {deleteBusyId === r.manual_debt_id ? "…" : "Удалить"}
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                              {isOneCDebtAdminRow(r) ? (
                                <div className="flex flex-col gap-1.5 items-start max-w-[200px] mt-1.5">
                                  {remainingDebt(r) > AMT_EPS ? (
                                    <button
                                      type="button"
                                      disabled={settleOneCBusyUid === r.debt_row_uid}
                                      onClick={() => void settleOneC(r.debt_row_uid)}
                                      className="text-xs font-medium underline disabled:opacity-50"
                                      style={{ color: "var(--accent)" }}
                                    >
                                      {settleOneCBusyUid === r.debt_row_uid ? "…" : "Погасить полностью"}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => openAdjust(r)}
                                    className="text-xs font-medium underline"
                                    style={{ color: "var(--text-primary)" }}
                                  >
                                    Корректировка
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openWithhold(r)}
                                    className="text-xs font-medium underline"
                                    style={{ color: "var(--accent)" }}
                                  >
                                    Удержать
                                  </button>
                                  {canDeleteOneCDebt(r) ? (
                                    <button
                                      type="button"
                                      disabled={deleteOneCBusyUid === r.debt_row_uid}
                                      onClick={() => void deleteOneC(r.debt_row_uid)}
                                      className="text-xs font-medium underline disabled:opacity-50"
                                      style={{ color: "var(--error)" }}
                                    >
                                      {deleteOneCBusyUid === r.debt_row_uid ? "…" : "Удалить"}
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                              {isReportDebtAdminRow(r) ? (
                                <div className="flex flex-col gap-1.5 items-start max-w-[200px] mt-1.5">
                                  <button
                                    type="button"
                                    disabled={closeReportBusyUid === r.debt_row_uid}
                                    onClick={() => void closeReportDebt(r.debt_row_uid, r.debt_report_id)}
                                    className="text-xs font-medium underline disabled:opacity-50"
                                    style={{ color: "var(--accent)" }}
                                  >
                                    {closeReportBusyUid === r.debt_row_uid ? "…" : "Закрыть долг"}
                                  </button>
                                </div>
                              ) : null}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
                <div
                  className="flex flex-wrap items-center justify-center gap-3 px-4 py-3 border-t"
                  style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
                >
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {debtsFilterActive
                      ? `Найдено: ${filtered.length}`
                      : `Показано ${visibleDebts.length} из ${filtered.length}`}
                  </span>
                  {debtsHasMore ? (
                    <button
                      type="button"
                      onClick={() => setDebtsVisibleCount((n) => n + PAGE_SIZE)}
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      Показать ещё
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {tab === "taken" && (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
          <div className="p-4 border-b space-y-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {consultantSelfView
                ? "Строки «Взято» из ваших отчётов и полностью закрытые долги. «Зачёт долга» — привязка к строке долга."
                : "Строки «Взято» из отчётов и полностью закрытые долги (их нет на вкладке «Долги к взятию»)."}
            </p>
            <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--text-secondary)" }}>
              <span>
                Строк «Взято»: <strong style={{ color: "var(--text-primary)" }}>{takenTotals.count}</strong>
              </span>
              <span>
                Сумма «Взято»:{" "}
                <strong className="tabular-nums" style={{ color: "var(--text-primary)" }}>{fmtMoney(takenTotals.all)}</strong>
              </span>
              <span>
                Зачёт долга:{" "}
                <strong className="tabular-nums" style={{ color: "var(--text-primary)" }}>{fmtMoney(takenTotals.linked)}</strong>
              </span>
              {!withholdingView ? (
                <span>
                  Закрытых долгов:{" "}
                  <strong style={{ color: "var(--text-primary)" }}>{closedDebtsTotals.count}</strong>
                  {closedDebtsTotals.count > 0 ? (
                    <>
                      {" "}
                      (<strong className="tabular-nums">{fmtMoney(closedDebtsTotals.sum)}</strong>)
                    </>
                  ) : null}
                </span>
              ) : null}
            </div>
            <input
              type="text"
              value={takenSearch}
              onChange={(e) => setTakenSearch(e.target.value)}
              placeholder={
                consultantSelfView
                  ? "Поиск: отчёт, причина, источник, откуда взято, сумма…"
                  : "Поиск: сотрудник, отчёт, источник, откуда взято, сумма…"
              }
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
            />
          </div>
          {takenLoading ? (
            <div className="p-8 text-center" style={{ color: "var(--text-secondary)" }}>
              Загрузка…
            </div>
          ) : filteredTaken.length === 0 ? (
            <div className="p-8 text-center" style={{ color: "var(--text-secondary)" }}>
              Нет данных
            </div>
          ) : (
            <>
              <div className="overflow-auto max-h-[72vh]">
                <table className={`w-full text-sm border-collapse ${consultantSelfView ? "min-w-[1200px]" : "min-w-[1500px]"}`}>
                  <thead className="sticky top-0 z-10">
                    <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
                      <th className="text-left px-3 py-2">Дата отчёта</th>
                      {!consultantSelfView ? <th className="text-left px-3 py-2">Сотрудник</th> : null}
                      <th className="text-right px-3 py-2">Сумма</th>
                      <th className="text-left px-3 py-2">За что взято</th>
                      <th className="text-left px-3 py-2">Причина долга</th>
                      <th className="text-left px-3 py-2">Откуда взято</th>
                      <th className="text-left px-3 py-2 min-w-[220px]">Источник</th>
                      <th className="text-left px-3 py-2">Зачёт долга</th>
                      <th className="text-left px-3 py-2">Отчёт</th>
                      <th className="text-left px-3 py-2 min-w-[160px]">Точка</th>
                      <th className="text-left px-3 py-2">Период</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTaken.map((r) => (
                      <tr key={r.row_key} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="px-3 py-2">{fmtDate(r.report_submitted_at || r.report_created_at)}</td>
                        {!consultantSelfView ? (
                          <td className="px-3 py-2">
                            {r.user_name}
                            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                              id {r.user_id}
                            </div>
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(r.amount)}</td>
                        <td className="px-3 py-2">{r.taken_reason_name || "—"}</td>
                        <td className="px-3 py-2">{r.debt_reason_name || "—"}</td>
                        <td className="px-3 py-2">{r.taken_source_name || "—"}</td>
                        <td className="px-3 py-2 min-w-[220px]">
                          {r.debt_source_label ? (
                            <>
                              <div className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                                <DebtSourceKindBadge kind={r.debt_source_kind} />
                              </div>
                              <div className="whitespace-pre-wrap break-words" title={r.debt_source_label}>
                                {r.debt_source_kind === "report" && r.linked_debt_report_id != null ? (
                                  <>
                                    Отчёт <ReportNumLink id={r.linked_debt_report_id} />
                                    {r.debt_source_label.replace(/^Отчёт #\d+/, "").trim()
                                      ? ` ${r.debt_source_label.replace(/^Отчёт #\d+/, "").trim()}`
                                      : ""}
                                  </>
                                ) : (
                                  r.debt_source_label
                                )}
                              </div>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.is_linked_debt_take ? (
                            <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                              Да
                            </span>
                          ) : (
                            "—"
                          )}
                          {r.linked_debt_report_id != null ? (
                            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                              долг из отчёта <ReportNumLink id={r.linked_debt_report_id} />
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <ReportNumLink id={r.report_id} />
                        </td>
                        <td className="px-3 py-2 min-w-[160px]">
                          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                            {fmtWarehouse(r.warehouse_name)}
                          </span>
                          {r.order_number ? (
                            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                              заказ {r.order_number}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">{fmtDebtReportMonth(r.report_month)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                className="flex flex-wrap items-center justify-center gap-3 px-4 py-3 border-t"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
              >
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {takenFilterActive
                    ? `Найдено: ${filteredTaken.length}`
                    : `Показано ${visibleTaken.length} из ${filteredTaken.length}`}
                </span>
                {takenHasMore ? (
                  <button
                    type="button"
                    onClick={() => setTakenVisibleCount((n) => n + PAGE_SIZE)}
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    Показать ещё
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "employee" && (
        <div className="rounded-2xl border p-4 space-y-4" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Хронология: ручные долги, долги из отчётов и все строки «Взято» по выбранному консультанту. Сводка: остаток
            долга (по всем строкам), сумма «Взято», из неё — с привязкой к долгу.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block mb-1" style={{ color: "var(--text-secondary)" }}>
                Сотрудник
              </span>
              <select
                value={empUserId === "" ? "" : String(empUserId)}
                onChange={(e) => {
                  setEmpUserId(e.target.value === "" ? "" : Number(e.target.value));
                  setLedger(null);
                }}
                className="rounded-lg border px-3 py-2 min-w-[220px]"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              >
                <option value="">—</option>
                {consultants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.last_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block mb-1" style={{ color: "var(--text-secondary)" }}>
                Дата с
              </span>
              <input
                type="date"
                value={empFromDate}
                onChange={(e) => setEmpFromDate(e.target.value)}
                className="rounded-lg border px-3 py-2"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1" style={{ color: "var(--text-secondary)" }}>
                Дата по
              </span>
              <input
                type="date"
                value={empToDate}
                onChange={(e) => setEmpToDate(e.target.value)}
                className="rounded-lg border px-3 py-2"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              />
            </label>
            <button
              type="button"
              onClick={() => void loadLedger()}
              disabled={ledgerLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {ledgerLoading ? "Загрузка…" : "Показать сводку"}
            </button>
            {(empFromDate || empToDate) && (
              <button
                type="button"
                onClick={() => {
                  setEmpFromDate("");
                  setEmpToDate("");
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium border"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              >
                Сбросить даты
              </button>
            )}
          </div>
          {ledgerError && (
            <div className="text-sm" style={{ color: "var(--error)" }}>
              {ledgerError}
            </div>
          )}
          {ledger && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl p-3 border" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
                  <div style={{ color: "var(--text-secondary)" }}>Остаток долга (всего)</div>
                  <div className="text-lg font-semibold tabular-nums mt-1" style={{ color: "var(--text-primary)" }}>
                    {fmtMoney(ledger.remaining_debt_total)}
                  </div>
                </div>
                <div className="rounded-xl p-3 border" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
                  <div style={{ color: "var(--text-secondary)" }}>Взято (все строки)</div>
                  <div className="text-lg font-semibold tabular-nums mt-1" style={{ color: "var(--text-primary)" }}>
                    {fmtMoney(ledger.vzyala_total)}
                  </div>
                </div>
                <div className="rounded-xl p-3 border" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
                  <div style={{ color: "var(--text-secondary)" }}>Взято — зачёт долга</div>
                  <div className="text-lg font-semibold tabular-nums mt-1" style={{ color: "var(--text-primary)" }}>
                    {fmtMoney(ledger.vzyala_linked_debt_total)}
                  </div>
                </div>
              </div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Леджер: {ledger.user_name}
              </div>
              <div className="overflow-auto max-h-[56vh] rounded-xl border" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-sm border-collapse min-w-[1100px]">
                  <thead>
                    <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
                      <th className="text-left px-3 py-2">Когда</th>
                      <th className="text-left px-3 py-2">Тип</th>
                      <th className="text-right px-3 py-2">Сумма</th>
                      <th className="text-left px-3 py-2">Причина долга</th>
                      <th className="text-left px-3 py-2">Откуда взято</th>
                      <th className="text-left px-3 py-2 min-w-[200px]">Источник</th>
                      <th className="text-left px-3 py-2">Отчёт</th>
                      <th className="text-left px-3 py-2">Описание</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedgerLines.map((ln, idx) => (
                      <tr key={`${ln.kind}-${idx}-${ln.report_id}-${ln.manual_debt_id}`} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(ln.at)}</td>
                        <td className="px-3 py-2">
                          {ln.kind === "debt_manual"
                            ? "Долг (вручную)"
                            : ln.kind === "debt_report"
                              ? "Долг (отчёт)"
                              : ln.kind === "taken"
                                ? ln.is_linked_debt_take
                                  ? "Взято — зачёт"
                                  : "Взято"
                                : ln.kind}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(ln.amount)}</td>
                        <td className="px-3 py-2">{ln.debt_reason_name || "—"}</td>
                        <td className="px-3 py-2">
                          {ln.kind === "taken" ? ln.taken_source_name || "—" : "—"}
                        </td>
                        <td className="px-3 py-2 min-w-[200px]">
                          {ln.debt_source_label ? (
                            <>
                              <div className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                                <DebtSourceKindBadge kind={ln.debt_source_kind} />
                              </div>
                              <div className="whitespace-pre-wrap break-words" title={ln.debt_source_label}>
                                {ln.debt_source_kind === "report" &&
                                (ln.linked_debt_report_id != null || ln.report_id != null) &&
                                ln.kind !== "taken" ? (
                                  <>
                                    Отчёт{" "}
                                    <ReportNumLink id={ln.linked_debt_report_id ?? ln.report_id!} />
                                    {ln.debt_source_label.replace(/^Долг в отчёте №\d+|^Отчёт #\d+/, "").trim()
                                      ? ` ${ln.debt_source_label.replace(/^Долг в отчёте №\d+|^Отчёт #\d+/, "").trim()}`
                                      : ""}
                                  </>
                                ) : ln.kind === "taken" && ln.linked_debt_report_id != null ? (
                                  <>
                                    {ln.debt_source_label}
                                    <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                                      долг из отчёта <ReportNumLink id={ln.linked_debt_report_id} />
                                    </div>
                                  </>
                                ) : (
                                  ln.debt_source_label
                                )}
                              </div>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {ln.report_id != null ? <ReportNumLink id={ln.report_id} /> : "—"}
                        </td>
                        <td className="px-3 py-2">{ln.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {adjustOpen && adjustRow && !consultantSelfView && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="adjust-debt-title"
        >
          <div
            className="w-full max-w-lg rounded-2xl border p-5 shadow-xl max-h-[90vh] overflow-y-auto"
            style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
          >
            <h2 id="adjust-debt-title" className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              {isOneCDebtAdminRow(adjustRow)
                ? `Корректировка долга 1С`
                : `Корректировка записи №${adjustRow.manual_debt_id}`}
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
              {isOneCDebtAdminRow(adjustRow) ? (
                <>
                  Тип: {adjustRow.debt_reason_name || "1С"}. Сумма не может быть меньше уже зачтённого в «Взято» (
                  {fmtMoney(takenPart(adjustRow))}). Обнуление без зачётов удалит строку.
                </>
              ) : (
                <>
                  Сумма не может быть меньше уже зачтённого в «Взято» ({fmtMoney(takenPart(adjustRow))}). Обнуление без
                  зачётов удалит запись.
                </>
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <label className="block text-sm">
                <span style={{ color: "var(--text-secondary)" }}>Сумма долга</span>
                <input
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm tabular-nums"
                  style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                />
              </label>
              {!isOneCDebtAdminRow(adjustRow) ? (
                <label className="block text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>Причина долга</span>
                  <select
                    value={adjustReasonId === "" ? "" : String(adjustReasonId)}
                    onChange={(e) => setAdjustReasonId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  >
                    <option value="">—</option>
                    {debtReasons.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>Тип (1С)</span>
                  <input
                    value={adjustRow.debt_reason_name || "1С"}
                    readOnly
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}
                  />
                </label>
              )}
              <label className="block text-sm">
                <span style={{ color: "var(--text-secondary)" }}>Точка</span>
                <select
                  value={adjustWhId === "" ? "" : String(adjustWhId)}
                  onChange={(e) => setAdjustWhId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                >
                  <option value="">—</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span style={{ color: "var(--text-secondary)" }}>Период</span>
                <input
                  value={adjustMonth}
                  onChange={(e) => setAdjustMonth(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span style={{ color: "var(--text-secondary)" }}>Заказ №</span>
                <input
                  value={adjustOrder}
                  onChange={(e) => setAdjustOrder(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                />
              </label>
            </div>
            <label className="block text-sm mb-4">
              <span style={{ color: "var(--text-secondary)" }}>
                {isOneCDebtAdminRow(adjustRow) ? "Комментарий (из 1С)" : "Комментарий"}
              </span>
              <textarea
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                rows={isOneCDebtAdminRow(adjustRow) ? 4 : 2}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              />
            </label>
            {adjustError ? (
              <div className="text-sm mb-3" style={{ color: "var(--error)" }}>
                {adjustError}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setAdjustOpen(false);
                  setAdjustRow(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium border"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={adjustSubmitting}
                onClick={() => void submitAdjust()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                {adjustSubmitting ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {withholdOpen && withholdRow && !consultantSelfView && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="withhold-debt-title"
        >
          <div
            className="w-full max-w-lg rounded-2xl border p-5 shadow-xl max-h-[90vh] overflow-y-auto"
            style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
          >
            <h2 id="withhold-debt-title" className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              {isOneCDebtAdminRow(withholdRow)
                ? "Удержать по долгу 1С"
                : `Удержать по записи №${withholdRow.manual_debt_id}`}
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
              Создаётся открытое удержание у {withholdRow.debt_user_name || "сотрудника"}. Баланс уменьшится и может
              уйти в минус. В отчёте будет видно сумму и причину. Долг при этом не гасится.
            </p>
            <label className="block text-sm mb-3">
              <span style={{ color: "var(--text-secondary)" }}>Сумма удержания</span>
              <input
                value={withholdAmount}
                onChange={(e) => setWithholdAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm tabular-nums"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                inputMode="decimal"
              />
            </label>
            <label className="block text-sm mb-3">
              <span style={{ color: "var(--text-secondary)" }}>За что (причина)</span>
              <input
                value={withholdReason}
                onChange={(e) => setWithholdReason(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                placeholder="Например: мотивация, переплата…"
              />
            </label>
            <label className="block text-sm mb-3">
              <span style={{ color: "var(--text-secondary)" }}>Комментарий</span>
              <textarea
                value={withholdNote}
                onChange={(e) => setWithholdNote(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              />
            </label>
            {withholdError ? (
              <div className="text-sm mb-3" style={{ color: "var(--error)" }}>
                {withholdError}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setWithholdOpen(false);
                  setWithholdRow(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium border"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={withholdSubmitting}
                onClick={() => void submitWithhold()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                {withholdSubmitting ? "Сохранение…" : "Удержать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
