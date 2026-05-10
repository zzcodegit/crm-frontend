import { useState, useEffect, useMemo, useRef } from "react";
import type { DragEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { ReportItem, WarehouseItem } from "../api";
import { normalizeReportTableColumnOrder, REPORT_TABLE_COLUMN_LABELS } from "../reportsTableColumns";
import { reportBusinessDayYmd } from "./reportsAnalyticsUtils";
import { isPdfUrl, isHeicUrl, fileFileName, ReportImageLightbox } from "./reportsShared";

/** ФИО продавца в доплате (в JSON могут быть разные ключи или только старый формат). */
function extraPaymentSellerName(p: Record<string, unknown>): string {
  const keys = [
    "consultant_last_name",
    "consultantLastName",
    "consultant_name",
    "consultantName",
    "seller_fio",
    "seller_name",
    "fio",
    "consultant",
  ] as const;
  for (const k of keys) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Склад не указан в отчёте (`warehouse_id` null) — отдельная строка сетки. */
const REPORTS_NO_WAREHOUSE_ID = -1;
const REPORTS_NO_WAREHOUSE_NAME = "Без точки";

/** Дата/время отчёта в списке: момент отправки (`submitted_at`); без него — старые данные по `created_at`. */
function reportSubmittedOrCreatedAt(r: ReportItem): string | null {
  return r.submitted_at ?? r.created_at ?? null;
}

function sortReportsNewestFirst(a: ReportItem, b: ReportItem): number {
  const ta = reportSubmittedOrCreatedAt(a);
  const tb = reportSubmittedOrCreatedAt(b);
  const tna = ta ? new Date(ta).getTime() : 0;
  const tnb = tb ? new Date(tb).getTime() : 0;
  if (tnb !== tna) return tnb - tna;
  return (b.id ?? 0) - (a.id ?? 0);
}

function parseYmdParam(v: string | null, fallback: string): string {
  if (v && YMD_RE.test(v)) return v;
  return fallback;
}

function formatReportPeriodDisplay(v: string | null | undefined): string {
  const raw = (v ?? "").trim();
  if (!raw) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^\d{2}$/);
  if (m) {
    const monthNames: Record<string, string> = {
      "01": "Январь",
      "02": "Февраль",
      "03": "Март",
      "04": "Апрель",
      "05": "Май",
      "06": "Июнь",
      "07": "Июль",
      "08": "Август",
      "09": "Сентябрь",
      "10": "Октябрь",
      "11": "Ноябрь",
      "12": "Декабрь",
    };
    return monthNames[raw] ?? raw;
  }
  return raw;
}

export default function Reports() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [me, setMe] = useState<{ is_consultant?: boolean; is_admin?: boolean; is_manager?: boolean } | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [myDraft, setMyDraft] = useState<ReportItem | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [filesPopup, setFilesPopup] = useState<{ title: string; urls: string[] } | null>(null);
  const [imageGallery, setImageGallery] = useState<{ urls: string[]; index: number } | null>(null);
  const [extraPaymentsPopup, setExtraPaymentsPopup] = useState<
    { amount: number; order_number: string; consultant_last_name?: string | null }[] | null
  >(null);
  const [returnsPopup, setReturnsPopup] = useState<
    { date_check?: string | null; consultant_last_name?: string | null; return_reason?: string | null; amount?: number | null }[] | null
  >(null);
  const [expensesPopup, setExpensesPopup] = useState<
    { expense_article_id: number; expense_article_name: string; amount: number }[] | null
  >(null);
  const [vzyalaPopup, setVzyalaPopup] = useState<
    { order_number?: string; amount?: number; taken_reason_id?: number | null; taken_source_id?: number | null; order_percent?: number | null; report_month?: string | null; warehouse_id?: number | null }[] | null
  >(null);
  const [dolgPopup, setDolgPopup] = useState<
    { order_number?: string; amount?: number; debt_reason_id?: number | null; order_percent?: number | null; report_month?: string | null; warehouse_id?: number | null }[] | null
  >(null);
  const [expenseArticleById, setExpenseArticleById] = useState<Record<number, string>>({});
  const [takenReasonById, setTakenReasonById] = useState<Record<number, string>>({});
  const [takenSourceById, setTakenSourceById] = useState<Record<number, string>>({});
  const [debtReasonById, setDebtReasonById] = useState<Record<number, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<ReportItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const todayLocalStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const today = todayLocalStr();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  /** Явный диапазон в адресной строке (хотя бы один параметр from/to). */
  const hasExplicitDateRange =
    (fromParam != null && fromParam !== "") || (toParam != null && toParam !== "");
  /**
   * Консультанты не видят панель выбора дат (она только у админа), при этом по умолчанию подставлялся «сегодня»,
   * и сетка показывала только этот день — отправленные ранее отчёты пропадали. Без from/to в URL показываем все даты из списка отчётов.
   */
  let dateFrom: string;
  let dateTo: string;
  if (
    me !== null &&
    me.is_consultant === true &&
    me.is_admin !== true &&
    me.is_manager !== true &&
    !hasExplicitDateRange
  ) {
    dateFrom = "";
    dateTo = "";
  } else {
    dateFrom = parseYmdParam(fromParam, today);
    dateTo = parseYmdParam(toParam, today);
    if (dateFrom > dateTo) {
      const t = dateFrom;
      dateFrom = dateTo;
      dateTo = t;
    }
  }
  const warehouseFilterSelected = (() => {
    const p = searchParams.get("point");
    if (p == null || p === "") return null;
    return p;
  })();

  const setFilterSearchParams = (
    mut: (p: URLSearchParams) => void,
    options?: { replace?: boolean }
  ) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mut(next);
        return next;
      },
      { replace: options?.replace ?? true }
    );
  };

  const setDateFrom = (v: string) => {
    setFilterSearchParams((p) => {
      const toRaw = p.get("to");
      const toVal = parseYmdParam(toRaw, today);
      let nextTo = toVal;
      if (v > nextTo) nextTo = v;
      p.set("from", v);
      p.set("to", nextTo);
    });
  };

  const setDateTo = (v: string) => {
    setFilterSearchParams((p) => {
      const fromRaw = p.get("from");
      const fromVal = parseYmdParam(fromRaw, today);
      let nextFrom = fromVal;
      if (v < nextFrom) nextFrom = v;
      p.set("from", nextFrom);
      p.set("to", v);
    });
  };

  const resetDateRangeToToday = () => {
    const t = todayLocalStr();
    setFilterSearchParams((p) => {
      p.set("from", t);
      p.set("to", t);
    });
  };

  const setWarehousePoint = (name: string | null) => {
    setFilterSearchParams((p) => {
      if (name == null || name === "") p.delete("point");
      else p.set("point", name);
    });
  };

  const [hideSubmitted, setHideSubmitted] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [warehouseFilterOpen, setWarehouseFilterOpen] = useState(false);
  const [warehouseFilterSearch, setWarehouseFilterSearch] = useState("");
  const datePickerRef = useRef<HTMLDivElement>(null);
  const warehouseFilterRef = useRef<HTMLDivElement>(null);
  const warehouseSearchInputRef = useRef<HTMLInputElement>(null);
  const draggedReportColumn = useRef<string | null>(null);

  const [reportColumnOrder, setReportColumnOrder] = useState<string[]>([]);
  const [columnsSettingsLoading, setColumnsSettingsLoading] = useState(false);
  const [columnsCustomizeMode, setColumnsCustomizeMode] = useState(false);
  const [columnsSaveMineLoading, setColumnsSaveMineLoading] = useState(false);
  const [columnsSaveDefaultLoading, setColumnsSaveDefaultLoading] = useState(false);
  const [columnsMessage, setColumnsMessage] = useState("");
  const [exportXlsxLoading, setExportXlsxLoading] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) setDatePickerOpen(false);
      if (warehouseFilterRef.current && !warehouseFilterRef.current.contains(e.target as Node)) setWarehouseFilterOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (warehouseFilterOpen) {
      setWarehouseFilterSearch("");
      setTimeout(() => warehouseSearchInputRef.current?.focus(), 0);
    }
  }, [warehouseFilterOpen]);

  const isConsultant = me?.is_consultant ===  true;
  const canSeeAllReports = me?.is_admin === true || me?.is_manager === true;
  const canSeeAllPoints = me?.is_admin === true;
  /** Панель: даты, точка, скрыть отправивших, отчёты расходов/инкассации, аналитика, XLSX — только администратору CRM */
  const isReportsAdminToolbar = me?.is_admin === true;

  useEffect(() => {
    api.getMe().then(setMe).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (me === null) return;
    setColumnsSettingsLoading(true);
    api
      .getReportsTableColumns()
      .then((res) => {
        const inc = me.is_admin === true;
        const def = normalizeReportTableColumnOrder(res.default_columns, { includeActions: inc });
        const mine =
          res.mine_columns != null
            ? normalizeReportTableColumnOrder(res.mine_columns, { includeActions: inc })
            : null;
        setReportColumnOrder(mine ?? def);
      })
      .catch(() => {
        const inc = me.is_admin === true;
        const fallback = normalizeReportTableColumnOrder(null, { includeActions: inc });
        setReportColumnOrder(fallback);
      })
      .finally(() => setColumnsSettingsLoading(false));
  }, [me]);

  useEffect(() => {
    const state = location.state as { reportSubmitted?: boolean; draftSaved?: boolean; reportUpdated?: boolean } | null;
    if (state?.reportSubmitted) {
      setSuccessMessage("Отчёт успешно отправлен.");
      setTimeout(() => setSuccessMessage(""), 4000);
      navigate({ pathname: "/reports", search: location.search }, { replace: true, state: undefined });
    } else if (state?.draftSaved) {
      setSuccessMessage("Черновик сохранен.");
      setTimeout(() => setSuccessMessage(""), 4000);
      navigate({ pathname: "/reports", search: location.search }, { replace: true, state: undefined });
    } else if (state?.reportUpdated) {
      setSuccessMessage("Отчёт обновлён.");
      setTimeout(() => setSuccessMessage(""), 4000);
      navigate({ pathname: "/reports", search: location.search }, { replace: true, state: undefined });
    }
  }, [location.state, location.search, navigate]);

  useEffect(() => {
    if (me === null) return;
    setListLoading(true);
    const draftPromise = isConsultant
      ? api.reports.getDraft().catch((e) => {
          if (e instanceof Error && e.message === "DRAFT_NOT_FOUND") return null;
          return null;
        })
      : Promise.resolve(null);
    Promise.all([
      api.reports.list(),
      api.ref.warehouses.list(),
      api.ref.expenseArticles.list().catch(() => [] as { id: number; name: string }[]),
      api.ref.takenReasons.list().catch(() => [] as { id: number; name: string }[]),
      api.ref.takenSources.list().catch(() => [] as { id: number; name: string }[]),
      api.ref.debtReasons.list().catch(() => [] as { id: number; name: string }[]),
      draftPromise,
    ]).then(([reps, whs, expenseArts, takenReasons, takenSources, debtReasons, draft]) => {
      setReports(reps);
      setWarehouses(whs);
      const m: Record<number, string> = {};
      for (const a of expenseArts) m[a.id] = a.name;
      setExpenseArticleById(m);
      const tr: Record<number, string> = {};
      for (const x of takenReasons) tr[x.id] = x.name;
      setTakenReasonById(tr);
      const ts: Record<number, string> = {};
      for (const x of takenSources) ts[x.id] = x.name;
      setTakenSourceById(ts);
      const dr: Record<number, string> = {};
      for (const x of debtReasons) dr[x.id] = x.name;
      setDebtReasonById(dr);
      setMyDraft(draft);
    })
      .catch(() => {
        setReports([]);
        setWarehouses([]);
        setMyDraft(null);
      })
      .finally(() => setListLoading(false));
  }, [me, successMessage]);

  /** Кратко для ячейки таблицы: только число доплат и сумма (ФИО — в попапе). */
  const extraPaymentsSummary = (arr: { amount: number; order_number: string; consultant_last_name?: string | null }[]) => {
    if (!arr?.length) return "—";
    const sum = arr.reduce((a, p) => a + p.amount, 0);
    return `${arr.length} допл. (${sum})`;
  };

  /** Кратко для ячейки: число строк возвратов и сумма по ним (как у доплат); детали — в попапе. */
  const returnsSummary = (r: ReportItem | null) => {
    if (!r) return "—";
    const details = (r.returns_details ?? []).filter((x) =>
      (x.date_check ?? "").trim() !== "" ||
      (x.consultant_last_name ?? "").trim() !== "" ||
      (x.return_reason ?? "").trim() !== "" ||
      x.amount != null
    );
    const detailsSum = details.reduce((a, x) => a + (x.amount ?? 0), 0);
    if (details.length > 0) {
      return `${details.length} возвр. (${detailsSum})`;
    }
    const agg = (r.return_bn ?? 0) + (r.return_nal ?? 0);
    if (agg === 0) return "—";
    return `0 возвр. (${agg})`;
  };

  /** Строки расходов по статьям справочника: кратко и попап с детализацией. */
  const expensesSummary = (r: ReportItem | null) => {
    if (!r) return "—";
    const rows = r.expenses ?? [];
    const sum = rows.reduce((a, x) => a + (Number(x.amount) || 0), 0);
    if (rows.length > 0) return `${rows.length} расх. (${sum})`;
    if (r.has_expenses) return "0 расх. (0)";
    return "—";
  };

  const openExpensesPopup = (r: ReportItem) => {
    const rows = r.expenses ?? [];
    setExpensesPopup(
      rows.map((row) => ({
        expense_article_id: row.expense_article_id,
        expense_article_name: expenseArticleById[row.expense_article_id] ?? `Статья №${row.expense_article_id}`,
        amount: Number(row.amount) || 0,
      }))
    );
  };

  const openVzyalaPopup = (r: ReportItem) => {
    setVzyalaPopup((r.vzyala_details ?? []) as {
      order_number?: string;
      amount?: number;
      taken_reason_id?: number | null;
      order_percent?: number | null;
      report_month?: string | null;
      warehouse_id?: number | null;
    }[]);
  };

  const openDolgPopup = (r: ReportItem) => {
    setDolgPopup((r.dolg_details ?? []) as {
      order_number?: string;
      amount?: number;
      debt_reason_id?: number | null;
      order_percent?: number | null;
      report_month?: string | null;
      warehouse_id?: number | null;
    }[]);
  };

  const openReportFiles = (title: string, urls: string[]) => {
    const clean = (urls ?? []).filter(Boolean);
    const imageLike = clean.filter((u) => !isPdfUrl(u));
    if (imageLike.length > 0) {
      setFilesPopup(null);
      setImageGallery({ urls: imageLike, index: 0 });
      return;
    }
    setFilesPopup({ title, urls: clean });
  };

  const utroShouldByReportId = useMemo(() => {
    const map = new Map<number, number | null>();
    const byWarehouse = new Map<number, ReportItem[]>();
    for (const r of reports) {
      if (r.warehouse_id == null || r.id == null) continue;
      const arr = byWarehouse.get(r.warehouse_id) ?? [];
      arr.push(r);
      byWarehouse.set(r.warehouse_id, arr);
    }
    for (const [, arr] of byWarehouse) {
      arr.sort((a, b) => {
        const ta = reportSubmittedOrCreatedAt(a);
        const tb = reportSubmittedOrCreatedAt(b);
        const tna = ta ? new Date(ta).getTime() : 0;
        const tnb = tb ? new Date(tb).getTime() : 0;
        if (tna !== tnb) return tna - tnb;
        return (a.id ?? 0) - (b.id ?? 0);
      });
      for (let i = 0; i < arr.length; i++) {
        const cur = arr[i];
        const prev = i > 0 ? arr[i - 1] : null;
        map.set(cur.id, prev != null ? (prev.ost_fact ?? prev.ost ?? null) : null);
      }
    }
    return map;
  }, [reports]);

  type DisplayRow = { dateStr: string; dateLabel: string; warehouseId: number; warehouseName: string; report: ReportItem | null };
  const hasNoWarehouseReports = useMemo(
    () => reports.some((r) => r.warehouse_id == null),
    [reports]
  );

  const appendNoWarehouseRow = (list: { id: number; name: string }[]): { id: number; name: string }[] => {
    if (hasNoWarehouseReports) {
      list.push({ id: REPORTS_NO_WAREHOUSE_ID, name: REPORTS_NO_WAREHOUSE_NAME });
    }
    return list;
  };

  const displayWarehouses = useMemo((): { id: number; name: string }[] => {
    if (canSeeAllPoints) {
      return appendNoWarehouseRow(
        [...warehouses].sort((a, b) => a.name.localeCompare(b.name)).map((w) => ({ id: w.id, name: w.name }))
      );
    }
    const whIds = new Set(reports.map((r) => r.warehouse_id).filter((id): id is number => id != null));
    return appendNoWarehouseRow(
      [...warehouses]
        .filter((w) => whIds.has(w.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((w) => ({ id: w.id, name: w.name }))
    );
  }, [warehouses, reports, canSeeAllPoints, hasNoWarehouseReports]);

  /** Сетка точек: в режиме «только пропуски» админ/менеджер видят все склады, чтобы видеть дыры по каждой точке. */
  const gridWarehouses = useMemo((): { id: number; name: string }[] => {
    if (hideSubmitted && canSeeAllReports) {
      return appendNoWarehouseRow(
        [...warehouses].sort((a, b) => a.name.localeCompare(b.name)).map((w) => ({ id: w.id, name: w.name }))
      );
    }
    return displayWarehouses;
  }, [hideSubmitted, canSeeAllReports, warehouses, displayWarehouses, hasNoWarehouseReports]);

  const allDisplayRows = useMemo(() => {
    const reportByDateWarehouse = new Map<string, ReportItem[]>();
    for (const r of reports) {
      const whKey = r.warehouse_id ?? REPORTS_NO_WAREHOUSE_ID;
      const ds = reportBusinessDayYmd(reportSubmittedOrCreatedAt(r));
      if (!ds) continue;
      const key = `${ds}|${whKey}`;
      const arr = reportByDateWarehouse.get(key) ?? [];
      arr.push(r);
      reportByDateWarehouse.set(key, arr);
    }
    for (const [, arr] of reportByDateWarehouse) {
      arr.sort(sortReportsNewestFirst);
    }
    const toLocalDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let dateStrs: string[];
    if (dateFrom && dateTo) {
      const from = new Date(dateFrom + "T12:00:00");
      const to = new Date(dateTo + "T12:00:00");
      dateStrs = [];
      const cur = new Date(from);
      while (cur <= to) {
        dateStrs.push(toLocalDateStr(cur));
        cur.setDate(cur.getDate() + 1);
      }
      dateStrs.reverse();
    } else {
      const seen = new Set<string>();
      for (const r of reports) {
        const ds = reportBusinessDayYmd(reportSubmittedOrCreatedAt(r));
        if (ds) seen.add(ds);
      }
      dateStrs = seen.size > 0 ? [...seen].sort().reverse() : [toLocalDateStr(new Date())];
    }
    const rows: DisplayRow[] = [];
    for (const ds of dateStrs) {
      const dateLabel = new Date(ds + "T12:00:00").toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const includeEmptyRows = canSeeAllPoints || hideSubmitted;
      for (const wh of gridWarehouses) {
        const key = `${ds}|${wh.id}`;
        const list = reportByDateWarehouse.get(key) ?? [];
        if (list.length === 0) {
          if (!includeEmptyRows) continue;
          rows.push({
            dateStr: ds,
            dateLabel,
            warehouseId: wh.id,
            warehouseName: wh.name,
            report: null,
          });
        } else {
          for (const r of list) {
            rows.push({
              dateStr: ds,
              dateLabel,
              warehouseId: wh.id,
              warehouseName: wh.name,
              report: r,
            });
          }
        }
      }
    }
    return rows;
  }, [reports, gridWarehouses, dateFrom, dateTo, canSeeAllPoints, hideSubmitted]);

  const filteredReports = useMemo(() => {
    return allDisplayRows.filter((row) => {
      if (warehouseFilterSelected !== null && row.warehouseName !== warehouseFilterSelected) return false;
      if (hideSubmitted && row.report !== null) return false;
      return true;
    });
  }, [allDisplayRows, warehouseFilterSelected, hideSubmitted]);

  const totals = useMemo(() => {
    const reportsWithData = filteredReports.filter((row) => row.report);
    const add = (a: number, v: number | null) => a + (v ?? 0);
    const sum = (fn: (r: ReportItem) => number | null) =>
      reportsWithData.reduce((acc, row) => add(acc, fn(row.report!)), 0);
    const extraSum = reportsWithData.reduce(
      (acc, row) => acc + (row.report!.extra_payments?.reduce((s, p) => s + (p.amount ?? 0), 0) ?? 0),
      0
    );
    const expensesSum = reportsWithData.reduce((acc, row) => {
      const ex = row.report!.expenses ?? [];
      return acc + ex.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    }, 0);
    const fmt = (n: number) => (reportsWithData.length > 0 ? n.toFixed(2) : "—");
    return {
      utro: fmt(sum((r) => r.utro)),
      revenue: fmt(sum((r) => r.revenue)),
      nal: fmt(sum((r) => r.nal)),
      ost: fmt(sum((r) => r.ost)),
      return_bn: fmt(sum((r) => r.return_bn)),
      return_nal: fmt(sum((r) => r.return_nal)),
      bn_card_reconciliation: fmt(sum((r) => r.bn_card_reconciliation)),
      bn_z_report: fmt(sum((r) => r.bn_z_report)),
      encashment_nal: fmt(sum((r) => r.encashment_nal ?? null)),
      encashment_bn: fmt(sum((r) => r.encashment_bn ?? null)),
      vyhod: fmt(sum((r) => r.vyhod)),
      vzyala: fmt(sum((r) => r.vzyala)),
      dolg: fmt(sum((r) => r.dolg)),
      extra_payments: fmt(extraSum),
      expenses: fmt(expensesSum),
    };
  }, [filteredReports]);

  const fmtNum = (n: number | null) => (n != null ? String(n) : "—");

  const formatDateTime = (createdAt: string | null) => {
    if (!createdAt) return "—";
    try {
      const d = new Date(createdAt);
      return d.toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return createdAt;
    }
  };

  const openPrivateChat = (report: ReportItem | null) => {
    if (!report?.user_id) return;
    window.dispatchEvent(
      new CustomEvent("chatwidget:open", {
        detail: { userId: report.user_id, username: report.user_username ?? "" },
      })
    );
  };

  const handleReportColumnDragStart = (key: string) => (e: DragEvent) => {
    if (!columnsCustomizeMode) return;
    draggedReportColumn.current = key;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", key);
  };

  const handleReportColumnDragOver = (e: DragEvent) => {
    if (!columnsCustomizeMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleReportColumnDrop = (targetKey: string) => (e: DragEvent) => {
    e.preventDefault();
    const from = draggedReportColumn.current;
    draggedReportColumn.current = null;
    if (!columnsCustomizeMode || !from || from === targetKey) return;
    setReportColumnOrder((prev) => {
      const next = [...prev];
      const i = next.indexOf(from);
      const j = next.indexOf(targetKey);
      if (i < 0 || j < 0) return prev;
      next.splice(i, 1);
      next.splice(j, 0, from);
      return next;
    });
  };

  const handleSaveReportColumnsMine = async () => {
    setColumnsMessage("");
    setColumnsSaveMineLoading(true);
    try {
      await api.updateReportsTableColumnsMine(reportColumnOrder);
      const res = await api.getReportsTableColumns();
      const inc = me?.is_admin === true;
      const def = normalizeReportTableColumnOrder(res.default_columns, { includeActions: !!inc });
      const mine =
        res.mine_columns != null
          ? normalizeReportTableColumnOrder(res.mine_columns, { includeActions: !!inc })
          : null;
      setReportColumnOrder(mine ?? def);
      setColumnsMessage("Порядок столбцов сохранён для вашего аккаунта.");
      setTimeout(() => setColumnsMessage(""), 4000);
    } catch (err) {
      setColumnsMessage(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setColumnsSaveMineLoading(false);
    }
  };

  const handleSaveReportColumnsDefault = async () => {
    if (!me?.is_admin) return;
    setColumnsMessage("");
    setColumnsSaveDefaultLoading(true);
    try {
      await api.updateReportsTableColumnsDefault(reportColumnOrder);
      const res = await api.getReportsTableColumns();
      const def = normalizeReportTableColumnOrder(res.default_columns, { includeActions: true });
      const mine =
        res.mine_columns != null
          ? normalizeReportTableColumnOrder(res.mine_columns, { includeActions: true })
          : null;
      setReportColumnOrder(mine ?? def);
      setColumnsMessage("Порядок столбцов сохранён для всех пользователей.");
      setTimeout(() => setColumnsMessage(""), 4000);
    } catch (err) {
      setColumnsMessage(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setColumnsSaveDefaultLoading(false);
    }
  };

  const handleClearReportColumnsMine = async () => {
    setColumnsMessage("");
    setColumnsSaveMineLoading(true);
    try {
      await api.clearReportsTableColumnsMine();
      const res = await api.getReportsTableColumns();
      const inc = me?.is_admin === true;
      const def = normalizeReportTableColumnOrder(res.default_columns, { includeActions: !!inc });
      setReportColumnOrder(def);
      setColumnsMessage("Используется общий порядок столбцов.");
      setTimeout(() => setColumnsMessage(""), 4000);
    } catch (err) {
      setColumnsMessage(err instanceof Error ? err.message : "Не удалось сбросить");
    } finally {
      setColumnsSaveMineLoading(false);
    }
  };

  type BodyCtx = {
    row: DisplayRow;
    r: ReportItem | null;
    utroShould: number | null;
    utroMismatch: boolean;
  };

  const renderReportsBodyCell = (colKey: string, ctx: BodyCtx) => {
    const { row, r, utroShould, utroMismatch } = ctx;
    switch (colKey) {
      case "created_at":
        return (
          <td
            key={colKey}
            className="px-3 py-2.5 whitespace-nowrap font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {row.report ? formatDateTime(reportSubmittedOrCreatedAt(row.report)) : row.dateLabel}
          </td>
        );
      case "user_username":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
            {r?.user_username && r?.user_id ? (
              <button
                type="button"
                onClick={() => openPrivateChat(r)}
                className="underline decoration-dotted hover:decoration-solid transition-opacity hover:opacity-80"
                style={{ color: "var(--accent)" }}
                title="Открыть чат с пользователем"
              >
                {r.user_username}
              </button>
            ) : (
              r?.user_username ?? "—"
            )}
          </td>
        );
      case "warehouse_name":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
            {row.warehouseName}
          </td>
        );
      case "utro_should":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {fmtNum(utroShould)}
          </td>
        );
      case "utro":
        return (
          <td
            key={colKey}
            className="px-3 py-2.5 whitespace-nowrap tabular-nums"
            style={{
              color: utroMismatch ? "var(--error)" : "var(--text-secondary)",
              background: utroMismatch ? "var(--error-light)" : "transparent",
            }}
            title={utroMismatch ? "Фактическое утро отличается от ожидаемого" : undefined}
          >
            {fmtNum(r?.utro ?? null)}
          </td>
        );
      case "revenue":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {fmtNum(r?.revenue ?? null)}
          </td>
        );
      case "nal":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {fmtNum(r?.nal ?? null)}
          </td>
        );
      case "ost":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {fmtNum(r?.ost ?? null)}
          </td>
        );
      case "has_returns":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>
            {r && (r.returns_details?.length ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => setReturnsPopup(r.returns_details || [])}
                className="cursor-pointer underline decoration-dotted hover:decoration-solid transition-opacity hover:opacity-80"
                style={{ color: "var(--accent)" }}
                title="Показать детализацию возвратов"
              >
                {returnsSummary(r)}
              </button>
            ) : (
              returnsSummary(r ?? null)
            )}
          </td>
        );
      case "has_expenses":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>
            {r && (r.expenses?.length ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => openExpensesPopup(r)}
                className="cursor-pointer underline decoration-dotted hover:decoration-solid transition-opacity hover:opacity-80"
                style={{ color: "var(--accent)" }}
                title="Показать расходы по статьям"
              >
                {expensesSummary(r)}
              </button>
            ) : (
              expensesSummary(r ?? null)
            )}
          </td>
        );
      case "return_bn":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {fmtNum(r?.return_bn ?? null)}
          </td>
        );
      case "return_nal":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {fmtNum(r?.return_nal ?? null)}
          </td>
        );
      case "bn_card_reconciliation":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {fmtNum(r?.bn_card_reconciliation ?? null)}
          </td>
        );
      case "bn_z_report":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {fmtNum(r?.bn_z_report ?? null)}
          </td>
        );
      case "encashment_nal":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {fmtNum(r?.encashment_nal ?? null)}
          </td>
        );
      case "encashment_bn":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {fmtNum(r?.encashment_bn ?? null)}
          </td>
        );
      case "vyhod":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {fmtNum(r?.vyhod ?? null)}
          </td>
        );
      case "percent":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {fmtNum(r?.percent ?? null)}
          </td>
        );
      case "vzyala":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {r && (r.vzyala_details?.length ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => openVzyalaPopup(r)}
                className="cursor-pointer underline decoration-dotted hover:decoration-solid transition-opacity hover:opacity-80 tabular-nums"
                style={{ color: "var(--accent)" }}
                title="Показать детализацию «Взято»"
              >
                {fmtNum(r.vzyala ?? null)}
              </button>
            ) : (
              fmtNum(r?.vzyala ?? null)
            )}
          </td>
        );
      case "dolg":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {r && (r.dolg_details?.length ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => openDolgPopup(r)}
                className="cursor-pointer underline decoration-dotted hover:decoration-solid transition-opacity hover:opacity-80 tabular-nums"
                style={{ color: "var(--accent)" }}
                title="Показать детализацию «Долг»"
              >
                {fmtNum(r.dolg ?? null)}
              </button>
            ) : (
              fmtNum(r?.dolg ?? null)
            )}
          </td>
        );
      case "extra":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>
            {r && (r.extra_payments?.length ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => setExtraPaymentsPopup(r.extra_payments || [])}
                className="cursor-pointer underline decoration-dotted hover:decoration-solid transition-opacity hover:opacity-80"
                style={{ color: "var(--accent)" }}
                title="Показать доплаты по номерам заказов"
              >
                {extraPaymentsSummary(r.extra_payments || [])}
              </button>
            ) : r ? (
              extraPaymentsSummary(r.extra_payments || [])
            ) : (
              "—"
            )}
          </td>
        );
      case "z_report":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap">
            {(r?.z_report_urls?.length ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => openReportFiles("Z-отчёт", r!.z_report_urls!)}
                className="inline-flex items-center justify-center gap-1 w-9 h-9 rounded-xl transition-transform hover:scale-105"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                title="Открыть файлы"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2 5 5h-5V4z" />
                </svg>
                <span className="text-xs font-semibold">{r!.z_report_urls!.length}</span>
              </button>
            ) : (
              <span style={{ color: "var(--text-tertiary)" }}>—</span>
            )}
          </td>
        );
      case "card":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap">
            {(r?.card_reconciliation_urls?.length ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => openReportFiles("Сверка итогов по картам", r!.card_reconciliation_urls!)}
                className="inline-flex items-center justify-center gap-1 w-9 h-9 rounded-xl transition-transform hover:scale-105"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                title="Открыть файлы"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 9h6M9 13h6M9 17h4" />
                </svg>
                <span className="text-xs font-semibold">{r!.card_reconciliation_urls!.length}</span>
              </button>
            ) : (
              <span style={{ color: "var(--text-tertiary)" }}>—</span>
            )}
          </td>
        );
      case "actions":
        if (me?.is_admin !== true) {
          return <td key={colKey} />;
        }
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap">
            {r ? (
              <div className="flex items-center gap-3 flex-wrap">
                <Link
                  to={`/reports/${r.id}/edit`}
                  className="text-sm font-medium hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  Изменить
                </Link>
                <button
                  type="button"
                  className="text-sm font-medium hover:underline"
                  style={{ color: "var(--error)" }}
                  onClick={() => setDeleteTarget(r)}
                >
                  Удалить
                </button>
              </div>
            ) : (
              <span style={{ color: "var(--text-tertiary)" }}>—</span>
            )}
          </td>
        );
      default:
        return <td key={colKey} />;
    }
  };

  const totalCellForColumn = (colKey: string, isFirst: boolean) => {
    if (isFirst) {
      return (
        <td key={colKey} className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
          Итого
        </td>
      );
    }
    switch (colKey) {
      case "utro_should":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            —
          </td>
        );
      case "utro":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }}>
            {totals.utro}
          </td>
        );
      case "revenue":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }}>
            {totals.revenue}
          </td>
        );
      case "nal":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }}>
            {totals.nal}
          </td>
        );
      case "ost":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }}>
            {totals.ost}
          </td>
        );
      case "has_returns":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
            —
          </td>
        );
      case "has_expenses":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums text-xs" style={{ color: "var(--text-primary)" }}>
            {totals.expenses}
          </td>
        );
      case "return_bn":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }}>
            {totals.return_bn}
          </td>
        );
      case "return_nal":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }}>
            {totals.return_nal}
          </td>
        );
      case "bn_card_reconciliation":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }}>
            {totals.bn_card_reconciliation}
          </td>
        );
      case "bn_z_report":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }}>
            {totals.bn_z_report}
          </td>
        );
      case "encashment_nal":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }}>
            {totals.encashment_nal}
          </td>
        );
      case "encashment_bn":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }}>
            {totals.encashment_bn}
          </td>
        );
      case "vyhod":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }}>
            {totals.vyhod}
          </td>
        );
      case "percent":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
            —
          </td>
        );
      case "vzyala":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }}>
            {totals.vzyala}
          </td>
        );
      case "dolg":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }}>
            {totals.dolg}
          </td>
        );
      case "extra":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-primary)" }}>
            {totals.extra_payments}
          </td>
        );
      case "z_report":
      case "card":
      case "created_at":
      case "user_username":
      case "warehouse_name":
      case "actions":
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
            —
          </td>
        );
      default:
        return (
          <td key={colKey} className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
            —
          </td>
        );
    }
  };

  const getReportsExportCellValue = (colKey: string, ctx: BodyCtx): string => {
    const { row, r, utroShould } = ctx;
    switch (colKey) {
      case "created_at":
        return row.report ? formatDateTime(reportSubmittedOrCreatedAt(row.report)) : row.dateLabel;
      case "user_username":
        return r?.user_username ?? "—";
      case "warehouse_name":
        return row.warehouseName;
      case "utro_should":
        return fmtNum(utroShould);
      case "utro":
        return fmtNum(r?.utro ?? null);
      case "revenue":
        return fmtNum(r?.revenue ?? null);
      case "nal":
        return fmtNum(r?.nal ?? null);
      case "ost":
        return fmtNum(r?.ost ?? null);
      case "has_returns":
        return returnsSummary(r ?? null);
      case "has_expenses":
        return expensesSummary(r ?? null);
      case "return_bn":
        return fmtNum(r?.return_bn ?? null);
      case "return_nal":
        return fmtNum(r?.return_nal ?? null);
      case "bn_card_reconciliation":
        return fmtNum(r?.bn_card_reconciliation ?? null);
      case "bn_z_report":
        return fmtNum(r?.bn_z_report ?? null);
      case "encashment_nal":
        return fmtNum(r?.encashment_nal ?? null);
      case "encashment_bn":
        return fmtNum(r?.encashment_bn ?? null);
      case "vyhod":
        return fmtNum(r?.vyhod ?? null);
      case "percent":
        return fmtNum(r?.percent ?? null);
      case "vzyala":
        return fmtNum(r?.vzyala ?? null);
      case "dolg":
        return fmtNum(r?.dolg ?? null);
      case "extra":
        return r ? extraPaymentsSummary(r.extra_payments || []) : "—";
      case "z_report":
        return (r?.z_report_urls?.length ?? 0) > 0 ? String(r!.z_report_urls!.length) : "—";
      case "card":
        return (r?.card_reconciliation_urls?.length ?? 0) > 0 ? String(r!.card_reconciliation_urls!.length) : "—";
      default:
        return "—";
    }
  };

  const getReportsExportTotalValue = (colKey: string): string => {
    switch (colKey) {
      case "utro_should":
        return "—";
      case "utro":
        return totals.utro;
      case "revenue":
        return totals.revenue;
      case "nal":
        return totals.nal;
      case "ost":
        return totals.ost;
      case "has_returns":
        return "—";
      case "has_expenses":
        return totals.expenses;
      case "return_bn":
        return totals.return_bn;
      case "return_nal":
        return totals.return_nal;
      case "bn_card_reconciliation":
        return totals.bn_card_reconciliation;
      case "bn_z_report":
        return totals.bn_z_report;
      case "encashment_nal":
        return totals.encashment_nal;
      case "encashment_bn":
        return totals.encashment_bn;
      case "vyhod":
        return totals.vyhod;
      case "percent":
        return "—";
      case "vzyala":
        return totals.vzyala;
      case "dolg":
        return totals.dolg;
      case "extra":
        return totals.extra_payments;
      case "z_report":
      case "card":
      case "created_at":
      case "user_username":
      case "warehouse_name":
      case "actions":
        return "—";
      default:
        return "—";
    }
  };

  const handleExportReportsXlsx = async () => {
    if (filteredReports.length === 0 || reportColumnOrder.length === 0 || exportXlsxLoading) return;
    setExportXlsxLoading(true);
    try {
      const XLSX = await import("xlsx");
      const cols = reportColumnOrder.filter((k) => k !== "actions");
      const header = cols.map((k) => REPORT_TABLE_COLUMN_LABELS[k] ?? k);
      const data: string[][] = [header];
      for (const row of filteredReports) {
        const r = row.report;
        const utroShould = r ? utroShouldByReportId.get(r.id) ?? null : null;
        const utroMismatch =
          r != null && utroShould != null && r.utro != null && Math.abs(utroShould - r.utro) > 0.0001;
        const ctx: BodyCtx = { row, r, utroShould, utroMismatch };
        data.push(cols.map((colKey) => getReportsExportCellValue(colKey, ctx)));
      }
      data.push(cols.map((colKey, i) => (i === 0 ? "Итого" : getReportsExportTotalValue(colKey))));
      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Отчёты");
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `otchety_${stamp}.xlsx`);
    } finally {
      setExportXlsxLoading(false);
    }
  };

  return (
    <div className="w-full animate-slide-in">
      <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
        Отчёты
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        {isConsultant === false && canSeeAllReports && me !== null && (
          <>Просмотр всех отчётов консультантов.</>
        )}
        {isConsultant === false && !canSeeAllReports && me !== null && (
          <>
            Раздел отчётов. Кнопка «Создать отчёт» доступна только пользователям из группы «Консультанты».
            Чтобы отправлять отчёты, попросите администратора добавить вас в эту группу: Настройки → Пользователи → ваш пользователь → Группы → отметьте «Консультанты».
          </>
        )}
        {isConsultant && "Отправка сменного отчёта: точка, выручка, Z-отчёт и сверка по картам."}
        {me === null && "Загрузка…"}
      </p>

      {successMessage && (
        <div className="mb-4 p-4 rounded-xl text-sm" style={{ backgroundColor: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent)" }}>
          {successMessage}
        </div>
      )}

      {isConsultant && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            to="/reports/new"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white transition-all"
            style={{ background: "var(--accent)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {myDraft ? "Продолжить черновик" : "Создать отчёт"}
          </Link>
          {!isReportsAdminToolbar && (
            <Link
              to="/reports/my-debts-stats"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold border transition-colors"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M3 3v18h18" />
                <path d="M7 16v-4M11 16V8M15 16v-6M19 16V5" />
              </svg>
              Статистика
            </Link>
          )}
        </div>
      )}

      {!isConsultant && !canSeeAllReports && me !== null && (
        <div className="rounded-2xl p-8 text-center" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-tertiary)" }}>
          <p>Скоро здесь появятся отчёты</p>
        </div>
      )}

      {me !== null && (
        <div className="mt-8 rounded-2xl overflow-hidden border shadow-sm" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Отчёты</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {isReportsAdminToolbar ? (
                hideSubmitted
                  ? `Только без отчёта: ${filteredReports.length} строк (дата × точка).`
                  : `Показано: ${filteredReports.length} строк (склады × даты).`
              ) : (
                `Показано: ${filteredReports.length} строк.`
              )}
            </p>
            {/* Панель фильтров */}
            <div className="flex flex-wrap items-center gap-4 mt-4">
              {isReportsAdminToolbar && (
              <div ref={datePickerRef} className="relative">
                <span className="text-xs font-medium mr-2" style={{ color: "var(--text-secondary)" }}>Дата:</span>
                <button
                  type="button"
                  onClick={() => setDatePickerOpen((v) => !v)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[var(--accent)]"
                  style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  {dateFrom && dateTo
                    ? `${new Date(dateFrom + "T12:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })} – ${new Date(dateTo + "T12:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}`
                    : "Диапазон дат"}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.6 }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {datePickerOpen && (
                  <div
                    className="absolute left-0 top-full z-30 mt-1 p-3 rounded-xl border shadow-lg"
                    style={{ background: "var(--bg-primary)", borderColor: "var(--border)", minWidth: 220 }}
                  >
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>С</label>
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-[var(--accent)]"
                          style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>По</label>
                        <input
                          type="date"
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-[var(--accent)]"
                          style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => { resetDateRangeToToday(); setDatePickerOpen(false); }}
                          className="flex-1 px-2 py-1.5 rounded-lg text-sm font-medium"
                          style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                        >
                          Сбросить
                        </button>
                        <button
                          type="button"
                          onClick={() => setDatePickerOpen(false)}
                          className="flex-1 px-2 py-1.5 rounded-lg text-sm font-semibold text-white"
                          style={{ background: "var(--accent)" }}
                        >
                          Применить
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}
              {isReportsAdminToolbar && (
              <div ref={warehouseFilterRef} className="relative">
                <span className="text-xs font-medium mr-2" style={{ color: "var(--text-secondary)" }}>Точка:</span>
                <button
                  type="button"
                  onClick={() => setWarehouseFilterOpen((v) => !v)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[var(--accent)] min-w-[200px] justify-between"
                  style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                >
                  <span className="truncate text-left">{warehouseFilterSelected ?? "Все точки"}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.6 }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {warehouseFilterOpen && (
                  <div
                    className="absolute left-0 top-full z-30 mt-1 rounded-xl border shadow-lg overflow-hidden"
                    style={{ background: "var(--bg-primary)", borderColor: "var(--border)", minWidth: 280, maxHeight: 320 }}
                  >
                    <input
                      ref={warehouseSearchInputRef}
                      type="text"
                      value={warehouseFilterSearch}
                      onChange={(e) => setWarehouseFilterSearch(e.target.value)}
                      placeholder="Поиск по названию точки..."
                      className="w-full px-4 py-3 text-sm border-b outline-none focus:ring-0"
                      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                    <div className="max-h-56 overflow-y-auto py-2">
                      <button
                        type="button"
                        onClick={() => { setWarehousePoint(null); setWarehouseFilterOpen(false); setWarehouseFilterSearch(""); }}
                        className="w-full px-4 py-2.5 text-left text-sm transition-colors"
                        style={{ color: warehouseFilterSelected === null ? "var(--accent)" : "var(--text-primary)", background: warehouseFilterSelected === null ? "var(--accent-light)" : "transparent" }}
                        onMouseEnter={(e) => { if (warehouseFilterSelected !== null) e.currentTarget.style.backgroundColor = "var(--bg-secondary)"; }}
                        onMouseLeave={(e) => { if (warehouseFilterSelected !== null) e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        Все точки
                      </button>
                      {gridWarehouses
                        .filter((w) => w.name.toLowerCase().includes(warehouseFilterSearch.trim().toLowerCase()))
                        .map((wh) => (
                          <button
                            key={wh.id}
                            type="button"
                            onClick={() => { setWarehousePoint(wh.name); setWarehouseFilterOpen(false); setWarehouseFilterSearch(""); }}
                            className="w-full px-4 py-2.5 text-left text-sm transition-colors"
                            style={{ color: warehouseFilterSelected === wh.name ? "var(--accent)" : "var(--text-primary)", background: warehouseFilterSelected === wh.name ? "var(--accent-light)" : "transparent" }}
                            onMouseEnter={(e) => { if (warehouseFilterSelected !== wh.name) e.currentTarget.style.backgroundColor = "var(--bg-secondary)"; }}
                            onMouseLeave={(e) => { if (warehouseFilterSelected !== wh.name) e.currentTarget.style.backgroundColor = "transparent"; }}
                          >
                            {wh.name}
                          </button>
                        ))}
                      {gridWarehouses.filter((w) => w.name.toLowerCase().includes(warehouseFilterSearch.trim().toLowerCase())).length === 0 && (
                        <div className="px-4 py-3 text-sm" style={{ color: "var(--text-tertiary)" }}>Не найдено</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              )}
              {isReportsAdminToolbar && (
                <div className="inline-flex items-center gap-3 select-none max-w-full sm:max-w-md">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hideSubmitted}
                    aria-label="Скрыть строки с уже отправленным отчётом, оставить только пропуски"
                    onClick={() => setHideSubmitted((v) => !v)}
                    className="relative inline-flex h-8 w-[3.25rem] shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-[var(--bg-primary)]"
                    style={{
                      background: hideSubmitted ? "var(--accent)" : "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span
                      className="inline-block h-[1.35rem] w-[1.35rem] rounded-full bg-white shadow-md transition-transform duration-200 ease-out"
                      style={{
                        transform: hideSubmitted ? "translateX(1.35rem)" : "translateX(0.2rem)",
                      }}
                    />
                  </button>
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      Скрыть отправивших отчёт
                    </span>
                    <span className="text-xs leading-snug" style={{ color: "var(--text-tertiary)" }}>
                      Показать только даты и точки, где отчёт ещё не сдан
                    </span>
                  </span>
                </div>
              )}
              {isReportsAdminToolbar && (
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/reports/expenses${location.search}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                    style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  >
                    Отчёт по расходам
                  </Link>
                  <Link
                    to={`/reports/encashment${location.search}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                    style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  >
                    Отчёт по инкассации
                  </Link>
                  <Link
                    to={`/reports/central-cash${location.search}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                    style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  >
                    Центральная касса
                  </Link>
                  <Link
                    to={`/reports/analytics/point?${new URLSearchParams({
                      from: dateFrom,
                      to: dateTo,
                      ...(warehouseFilterSelected ? { point: warehouseFilterSelected } : {}),
                    }).toString()}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                    style={{ borderColor: "var(--accent)", background: "var(--accent-light)", color: "var(--accent)" }}
                  >
                    Аналитика по точке
                  </Link>
                  <Link
                    to={`/reports/analytics/consultant?${new URLSearchParams({ from: dateFrom, to: dateTo }).toString()}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                    style={{ borderColor: "var(--accent)", background: "var(--accent-light)", color: "var(--accent)" }}
                  >
                    Аналитика по продавцу
                  </Link>
                  <Link
                    to="/reports/debts-summary"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                    style={{ borderColor: "var(--accent)", background: "var(--accent-light)", color: "var(--accent)" }}
                  >
                    Долги и «Взято»
                  </Link>
                  <Link
                    to="/reports/withholding"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                    style={{ borderColor: "var(--accent)", background: "var(--accent-light)", color: "var(--accent)" }}
                  >
                    Удержание
                  </Link>
                </div>
              )}
            </div>
            {columnsMessage && (
              <div
                className="mt-3 text-sm rounded-lg px-3 py-2"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}
              >
                {columnsMessage}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {isReportsAdminToolbar && (
              <button
                type="button"
                onClick={() => void handleExportReportsXlsx()}
                disabled={listLoading || filteredReports.length === 0 || reportColumnOrder.length === 0 || exportXlsxLoading}
                className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                  background: "var(--bg-secondary)",
                }}
                title="Выгрузить текущую таблицу (с учётом фильтров и порядка столбцов) в Excel"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {exportXlsxLoading ? "Формирование…" : "Скачать XLSX"}
              </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setColumnsCustomizeMode((v) => !v);
                  setColumnsMessage("");
                }}
                className="text-sm font-medium px-3 py-2 rounded-lg border"
                style={{
                  borderColor: columnsCustomizeMode ? "var(--accent)" : "var(--border)",
                  color: columnsCustomizeMode ? "var(--accent)" : "var(--text-primary)",
                  background: columnsCustomizeMode ? "var(--accent-light)" : "var(--bg-secondary)",
                }}
              >
                {columnsCustomizeMode ? "Готово" : "Настроить столбцы"}
              </button>
              {columnsCustomizeMode && (
                <>
                  <button
                    type="button"
                    disabled={columnsSaveMineLoading || columnsSaveDefaultLoading}
                    onClick={handleSaveReportColumnsMine}
                    className="text-sm font-medium px-3 py-2 rounded-lg text-white disabled:opacity-50"
                    style={{ background: "var(--accent)" }}
                  >
                    {columnsSaveMineLoading ? "Сохранение…" : "Сохранить для себя"}
                  </button>
                  {me?.is_admin === true && (
                    <button
                      type="button"
                      disabled={columnsSaveMineLoading || columnsSaveDefaultLoading}
                      onClick={handleSaveReportColumnsDefault}
                      className="text-sm font-medium px-3 py-2 rounded-lg text-white disabled:opacity-50"
                      style={{ background: "var(--text-primary)" }}
                    >
                      {columnsSaveDefaultLoading ? "Сохранение…" : "Сохранить для всех"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={columnsSaveMineLoading}
                    onClick={handleClearReportColumnsMine}
                    className="text-sm font-medium px-3 py-2 rounded-lg border disabled:opacity-50"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    Как у всех
                  </button>
                </>
              )}
              {columnsSettingsLoading && (
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Загрузка настроек столбцов…
                </span>
              )}
              {columnsCustomizeMode && (
                <span className="text-xs max-w-xl" style={{ color: "var(--text-tertiary)" }}>
                  Перетаскивайте заголовки столбцов. «Сохранить для себя» — только у вас; «Сохранить для всех» — порядок по умолчанию (доступно администратору).
                </span>
              )}
            </div>
          </div>
          {listLoading ? (
            <div className="flex items-center justify-center py-16" style={{ color: "var(--text-secondary)" }}>Загрузка…</div>
          ) : filteredReports.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
              {hideSubmitted
                ? "За выбранный период пропусков нет — по всем показанным точкам отчёты уже отправлены."
                : "Нет отчётов"}
            </div>
          ) : reportColumnOrder.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm" style={{ color: "var(--text-secondary)" }}>
              Загрузка таблицы…
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-sm border-collapse min-w-[1200px]">
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: "var(--bg-secondary)", borderBottom: "2px solid var(--border)" }}>
                    {reportColumnOrder.map((key) => (
                      <th
                        key={key}
                        draggable={columnsCustomizeMode}
                        onDragStart={handleReportColumnDragStart(key)}
                        onDragOver={handleReportColumnDragOver}
                        onDrop={handleReportColumnDrop(key)}
                        onDragEnd={() => {
                          draggedReportColumn.current = null;
                        }}
                        className="text-left px-3 py-3 whitespace-nowrap select-none"
                        style={{
                          color: "var(--text-primary)",
                          borderBottom: "2px solid var(--border)",
                          cursor: columnsCustomizeMode ? "grab" : undefined,
                        }}
                      >
                        <div
                          className="font-semibold text-xs uppercase tracking-wider"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {REPORT_TABLE_COLUMN_LABELS[key] ?? key}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((row, idx) => {
                    const r = row.report;
                    const utroShould = r ? (utroShouldByReportId.get(r.id) ?? null) : null;
                    const utroMismatch =
                      r != null &&
                      utroShould != null &&
                      r.utro != null &&
                      Math.abs(utroShould - r.utro) > 0.0001;
                    const rowKey =
                      r != null
                        ? `r-${r.id}`
                        : `e-${row.dateStr}-${row.warehouseId}-${idx}`;
                    return (
                      <tr
                        key={rowKey}
                        className="border-b transition-colors hover:opacity-95"
                        style={{
                          borderColor: "var(--border)",
                          background: idx % 2 === 0 ? "var(--bg-primary)" : "var(--bg-secondary)",
                          opacity: r ? 1 : 0.85,
                        }}
                      >
                        {reportColumnOrder.map((colKey) =>
                          renderReportsBodyCell(colKey, { row, r, utroShould, utroMismatch })
                        )}
                      </tr>
                    );
                  })}
                  <tr
                    className="font-semibold border-t-2"
                    style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
                  >
                    {reportColumnOrder.map((colKey, i) => totalCellForColumn(colKey, i === 0))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {extraPaymentsPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setExtraPaymentsPopup(null)}>
          <div className="rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>Доплаты по номерам заказов</h3>
              <button type="button" onClick={() => setExtraPaymentsPopup(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-xl leading-none" style={{ color: "var(--text-secondary)" }}>×</button>
            </div>
            <div className="p-4 overflow-y-auto">
              <ul className="space-y-2">
                {extraPaymentsPopup.map((p, i) => {
                  const seller = extraPaymentSellerName(p as unknown as Record<string, unknown>);
                  return (
                  <li key={i} className="py-3 border-b last:border-b-0" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">Заказ №{p.order_number || "—"}</div>
                        <div className="text-sm mt-1.5" style={{ color: "var(--text-secondary)" }}>
                          <span style={{ color: "var(--text-tertiary)" }}>Консультант (ФИО):</span> {seller || "—"}
                        </div>
                      </div>
                      <span className="font-medium tabular-nums shrink-0">{p.amount}</span>
                    </div>
                  </li>
                  );
                })}
              </ul>
              <div className="mt-3 pt-3 flex justify-between font-semibold" style={{ borderTop: "1px solid var(--border)", color: "var(--text-primary)" }}>
                <span>Итого:</span>
                <span className="tabular-nums">{extraPaymentsPopup.reduce((s, p) => s + (p.amount ?? 0), 0)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {returnsPopup && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setReturnsPopup(null)}>
          <div className="rounded-2xl shadow-xl w-[min(96vw,980px)] max-h-[90vh] overflow-hidden flex flex-col" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>Детализация возвратов</h3>
              <button type="button" onClick={() => setReturnsPopup(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-xl leading-none" style={{ color: "var(--text-secondary)" }}>×</button>
            </div>
            <div className="p-4 overflow-y-auto">
              <ul className="space-y-2">
                {returnsPopup.map((p, i) => (
                  <li key={i} className="py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-sm">
                      <span><span style={{ color: "var(--text-tertiary)" }}>Дата:</span> {p.date_check || "—"}</span>
                      <span><span style={{ color: "var(--text-tertiary)" }}>Консультант:</span> {p.consultant_last_name || "—"}</span>
                      <span><span style={{ color: "var(--text-tertiary)" }}>Причина:</span> {p.return_reason || "—"}</span>
                      <span className="tabular-nums"><span style={{ color: "var(--text-tertiary)" }}>Сумма:</span> {p.amount ?? "—"}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 pt-3 flex justify-between font-semibold" style={{ borderTop: "1px solid var(--border)", color: "var(--text-primary)" }}>
                <span>Итого:</span>
                <span className="tabular-nums">{returnsPopup.reduce((s, p) => s + (p.amount ?? 0), 0)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {expensesPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setExpensesPopup(null)}>
          <div className="rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>Расходы по статьям</h3>
              <button type="button" onClick={() => setExpensesPopup(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-xl leading-none" style={{ color: "var(--text-secondary)" }}>×</button>
            </div>
            <div className="p-4 overflow-y-auto">
              <ul className="space-y-2">
                {expensesPopup.map((p, i) => (
                  <li key={`${p.expense_article_id}-${i}`} className="py-3 border-b last:border-b-0" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{p.expense_article_name}</div>
                      </div>
                      <span className="font-medium tabular-nums shrink-0">{p.amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 pt-3 flex justify-between font-semibold" style={{ borderTop: "1px solid var(--border)", color: "var(--text-primary)" }}>
                <span>Итого:</span>
                <span className="tabular-nums">
                  {expensesPopup.reduce((s, p) => s + p.amount, 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {vzyalaPopup && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setVzyalaPopup(null)}>
          <div
            className="rounded-xl shadow-xl w-full max-w-[min(92vw,560px)] max-h-[min(72vh,440px)] overflow-hidden flex flex-col"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Детализация «Взято»</h3>
              <button type="button" onClick={() => setVzyalaPopup(null)} className="w-7 h-7 rounded-lg flex items-center justify-center text-lg leading-none" style={{ color: "var(--text-secondary)" }}>×</button>
            </div>
            <div className="px-3 pt-2 pb-0 overflow-auto flex-1 min-h-0">
              {(() => {
                const showOrder = vzyalaPopup.some((p) => (p.order_number ?? "").trim() !== "");
                const showOrderPercent = vzyalaPopup.some((p) => p.order_percent != null);
                const showDate = vzyalaPopup.some((p) => (p.report_month ?? "").trim() !== "");
                const showPoint = vzyalaPopup.some((p) => p.warehouse_id != null);
                return (
              <table className="w-full text-xs border-collapse min-w-[520px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                    <th className="text-left py-1.5 pr-2 whitespace-nowrap">За что взято</th>
                    <th className="text-left py-1.5 pr-2 whitespace-nowrap">Откуда взято</th>
                    {showOrder && <th className="text-left py-1.5 pr-2 whitespace-nowrap">Заказ</th>}
                    <th className="text-left py-1.5 pr-2 whitespace-nowrap">Сумма</th>
                    {showOrderPercent && <th className="text-left py-1.5 pr-2 whitespace-nowrap">% от заказа</th>}
                    {showDate && <th className="text-left py-1.5 pr-2 whitespace-nowrap">Дата</th>}
                    {showPoint && <th className="text-left py-1.5 pr-2 whitespace-nowrap">Торговая точка</th>}
                  </tr>
                </thead>
                <tbody>
                  {vzyalaPopup.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}>
                      <td className="py-1.5 pr-2">{(p.taken_reason_id != null ? takenReasonById[p.taken_reason_id] : "") || "—"}</td>
                      <td className="py-1.5 pr-2">{(p.taken_source_id != null ? takenSourceById[p.taken_source_id] : "") || "—"}</td>
                      {showOrder && <td className="py-1.5 pr-2">{(p.order_number ?? "").trim() || "—"}</td>}
                      <td className="py-1.5 pr-2 tabular-nums">{p.amount ?? "—"}</td>
                      {showOrderPercent && <td className="py-1.5 pr-2 tabular-nums">{p.order_percent ?? "—"}</td>}
                      {showDate && <td className="py-1.5 pr-2">{formatReportPeriodDisplay(p.report_month)}</td>}
                      {showPoint && <td className="py-1.5 pr-2">{(p.warehouse_id != null ? warehouses.find((w) => w.id === p.warehouse_id)?.name : "") || "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
                );
              })()}
            </div>
            <div className="px-3 py-2 flex justify-between text-sm font-semibold shrink-0 border-t" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
              <span>Итого:</span>
              <span className="tabular-nums">{vzyalaPopup.reduce((s, p) => s + (Number(p.amount) || 0), 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      )}

      {dolgPopup && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setDolgPopup(null)}>
          <div
            className="rounded-xl shadow-xl w-full max-w-[min(92vw,560px)] max-h-[min(72vh,440px)] overflow-hidden flex flex-col"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Детализация «Долг»</h3>
              <button type="button" onClick={() => setDolgPopup(null)} className="w-7 h-7 rounded-lg flex items-center justify-center text-lg leading-none" style={{ color: "var(--text-secondary)" }}>×</button>
            </div>
            <div className="px-3 pt-2 pb-0 overflow-auto flex-1 min-h-0">
              {(() => {
                const showOrder = dolgPopup.some((p) => (p.order_number ?? "").trim() !== "");
                const showOrderPercent = dolgPopup.some((p) => p.order_percent != null);
                const showDate = dolgPopup.some((p) => (p.report_month ?? "").trim() !== "");
                const showPoint = dolgPopup.some((p) => p.warehouse_id != null);
                return (
              <table className="w-full text-xs border-collapse min-w-[520px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                    <th className="text-left py-1.5 pr-2 whitespace-nowrap">За что долг</th>
                    {showOrder && <th className="text-left py-1.5 pr-2 whitespace-nowrap">Заказ</th>}
                    <th className="text-left py-1.5 pr-2 whitespace-nowrap">Сумма</th>
                    {showOrderPercent && <th className="text-left py-1.5 pr-2 whitespace-nowrap">% от заказа</th>}
                    {showDate && <th className="text-left py-1.5 pr-2 whitespace-nowrap">Дата</th>}
                    {showPoint && <th className="text-left py-1.5 pr-2 whitespace-nowrap">Торговая точка</th>}
                  </tr>
                </thead>
                <tbody>
                  {dolgPopup.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}>
                      <td className="py-1.5 pr-2">{(p.debt_reason_id != null ? debtReasonById[p.debt_reason_id] : "") || "—"}</td>
                      {showOrder && <td className="py-1.5 pr-2">{(p.order_number ?? "").trim() || "—"}</td>}
                      <td className="py-1.5 pr-2 tabular-nums">{p.amount ?? "—"}</td>
                      {showOrderPercent && <td className="py-1.5 pr-2 tabular-nums">{p.order_percent ?? "—"}</td>}
                      {showDate && <td className="py-1.5 pr-2">{formatReportPeriodDisplay(p.report_month)}</td>}
                      {showPoint && <td className="py-1.5 pr-2">{(p.warehouse_id != null ? warehouses.find((w) => w.id === p.warehouse_id)?.name : "") || "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
                );
              })()}
            </div>
            <div className="px-3 py-2 flex justify-between text-sm font-semibold shrink-0 border-t" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
              <span>Итого:</span>
              <span className="tabular-nums">{dolgPopup.reduce((s, p) => s + (Number(p.amount) || 0), 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      )}

      {filesPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setFilesPopup(null)}>
          <div className="rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>{filesPopup.title}</h3>
              <button type="button" onClick={() => setFilesPopup(null)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: "var(--text-secondary)" }}>×</button>
            </div>
            <div className="p-4 overflow-y-auto flex flex-wrap gap-3">
              {filesPopup.urls.map((url, i) => (
                isPdfUrl(url) ? (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex flex-col rounded-xl overflow-hidden border flex-shrink-0 w-28" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
                    <div className="aspect-square flex items-center justify-center" style={{ color: "var(--text-tertiary)" }}>
                      <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2 5 5h-5V4z" /></svg>
                    </div>
                    <span className="truncate text-xs px-2 py-1" style={{ color: "var(--text-secondary)" }} title={fileFileName(url)}>{fileFileName(url)}</span>
                  </a>
                ) : isHeicUrl(url) ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const imageOnly = filesPopup.urls.filter((u) => !isPdfUrl(u));
                      const idx = imageOnly.indexOf(url);
                      setFilesPopup(null);
                      setImageGallery({ urls: imageOnly, index: idx >= 0 ? idx : 0 });
                    }}
                    className="flex flex-col rounded-xl overflow-hidden border flex-shrink-0 w-28 text-left"
                    style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
                    title="Открыть HEIC"
                  >
                    <div className="aspect-square flex items-center justify-center" style={{ color: "var(--text-tertiary)" }}>
                      <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6M9 13h6M9 17h4" /></svg>
                    </div>
                    <span className="truncate text-xs px-2 py-1" style={{ color: "var(--text-secondary)" }} title={fileFileName(url)}>
                      HEIC · {fileFileName(url)}
                    </span>
                  </button>
                ) : (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const imageOnly = filesPopup.urls.filter((u) => !isPdfUrl(u));
                      const idx = imageOnly.indexOf(url);
                      setFilesPopup(null);
                      setImageGallery({ urls: imageOnly, index: idx >= 0 ? idx : 0 });
                    }}
                    className="flex flex-col rounded-xl overflow-hidden border flex-shrink-0 w-28 text-left"
                    style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
                    title="Открыть изображение"
                  >
                    <div className="aspect-square flex items-center justify-center" style={{ color: "var(--text-tertiary)" }}>
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="truncate text-xs px-2 py-1" style={{ color: "var(--text-secondary)" }} title={fileFileName(url)}>{fileFileName(url)}</span>
                  </button>
                )
              ))}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center p-4"
          style={{ background: "rgba(15, 23, 42, 0.55)", backdropFilter: "blur(8px)" }}
          onClick={() => !deleteSubmitting && setDeleteTarget(null)}
          role="presentation"
        >
          <div
            className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-report-title"
          >
            <div
              className="h-1.5 w-full"
              style={{
                background: "linear-gradient(90deg, var(--error) 0%, rgba(239, 68, 68, 0.4) 100%)",
              }}
            />
            <div className="p-6 sm:p-7">
              <div className="flex gap-4">
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: "var(--error-light)", color: "var(--error)" }}
                  aria-hidden
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 id="delete-report-title" className="text-lg font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
                    Удалить отчёт?
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    Это действие нельзя отменить. Отчёт будет удалён безвозвратно.
                  </p>
                  <div
                    className="mt-4 rounded-xl px-3 py-2.5 text-sm"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  >
                    <div className="font-medium">{deleteTarget.warehouse_name ?? "—"}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                      {formatDateTime(reportSubmittedOrCreatedAt(deleteTarget))} · {deleteTarget.user_username ?? "—"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <button
                  type="button"
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                  disabled={deleteSubmitting}
                  onClick={() => setDeleteTarget(null)}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                  disabled={deleteSubmitting}
                  onClick={async () => {
                    const id = deleteTarget.id;
                    setDeleteSubmitting(true);
                    try {
                      await api.reports.delete(id);
                      setReports((prev) => prev.filter((x) => x.id !== id));
                      setSuccessMessage("Отчёт удалён.");
                      setTimeout(() => setSuccessMessage(""), 4000);
                      setDeleteTarget(null);
                    } catch (e) {
                      alert(e instanceof Error ? e.message : "Не удалось удалить отчёт");
                    } finally {
                      setDeleteSubmitting(false);
                    }
                  }}
                >
                  {deleteSubmitting ? "Удаление…" : "Да, удалить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ReportImageLightbox gallery={imageGallery} onClose={() => setImageGallery(null)} />
    </div>
  );
}
