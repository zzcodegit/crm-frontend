import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useNavigate, useMatch, useLocation } from "react-router-dom";
import { api, warehousesVisibleInReports } from "../api";
import type { AvailableDebtRow, EmployeeSalaryBalanceResponse, RefItem, ReportItem } from "../api";

function reportCreatedAtToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(local: string): string | undefined {
  const t = local.trim();
  if (!t) return undefined;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** Дата для подписи долга в списке (без времени). */
function formatDebtListDate(v: string | null | undefined): string {
  const raw = (v ?? "").trim();
  if (!raw) return "без даты";
  const dmy = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (dmy) return `${dmy[1]}.${dmy[2]}.${dmy[3]}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const head = raw.split(/\s+/)[0];
  return head || "без даты";
}

import { inputStyle, uploadReportFile, FileThumbnail } from "./reportsShared";
import {
  REPORT_REQUIRED_FIELD_OPTIONS,
  validateReportRequiredFieldsClient,
  type ReportCreatePayloadLike,
} from "../reportRequiredValidation";

type ConsultantOption = { id: number; last_name: string };

/** Скрытые в форме заполнения отчёта (данные в БД и API не меняем). */
const REPORT_FORM_HIDDEN_FIELD_KEYS = new Set(["vyhod", "percent", "dolg"]);

const TAKE_DEBT_REASON_VIRTUAL_ID = -999001;

function resolveTakeDebtReasonIdFromOptions(options: RefItem[]): number {
  const found = options.find((x) => {
    const n = (x.name ?? "").trim().toLowerCase();
    return n.includes("заб") && n.includes("долг");
  });
  return found?.id ?? TAKE_DEBT_REASON_VIRTUAL_ID;
}

/** Справочник «Откуда взято»: «Наличными из кассы» — влияет на остаток наличных. */
function resolveCashFromRegisterSourceId(options: RefItem[]): number | null {
  const found = options.find((x) => {
    const n = (x.name ?? "").trim().toLowerCase();
    return n.includes("налич") && n.includes("касс");
  });
  return found?.id ?? null;
}

function takenSourceIsCashFromRegister(sourceId: number | "", cashFromRegisterSourceId: number | null): boolean {
  return cashFromRegisterSourceId != null && sourceId === cashFromRegisterSourceId;
}

const fmtSalaryBalanceRub = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseAmountLoose(s: string): number | undefined {
  const t = s.trim().replace(",", ".");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

type DebtTakePick = { selected: boolean; amount: string };

type VzyalaDebtRow = {
  amount: string;
  order_number: string;
  taken_reason_id: number;
  linked_debt_row_uid: string;
  linked_debt_report_id: number | null;
  warehouse_id: number | null;
};

function debtCardTitle(d: AvailableDebtRow): string {
  const kind = (d.debt_reason_name ?? "").trim() || (d.debt_row_uid.startsWith("1c-log-") ? "1С" : `Отчёт #${d.report_id}`);
  const orderPart = (d.order_number ?? "").trim() ? ` · заказ ${(d.order_number ?? "").trim()}` : "";
  return `${kind}${orderPart}`;
}

/** Непогашенный остаток долга с учётом суммы зачёта в текущей форме (при редактировании отчёта). */
function debtUnpaidRemaining(maxAvailableInReport: number, pick: DebtTakePick | undefined): number {
  if (!pick?.selected) return maxAvailableInReport;
  const entered = parseAmountLoose(pick.amount);
  const takeAmt = entered != null && entered >= 0 ? entered : 0;
  return Math.max(0, Math.round((maxAvailableInReport - takeAmt) * 100) / 100);
}

function sumVzyalaPendingAmount(
  rows: {
    amount: string;
    linked_debt_row_uid: string;
  }[],
): number {
  let total = 0;
  for (const row of rows) {
    const entered = parseAmountLoose(row.amount);
    if (entered != null && entered > 0) {
      total += entered;
    }
  }
  return total;
}

function ConsultantSelect({
  valueUserId,
  options,
  onChange,
  disabled,
  allowClear = true,
}: {
  valueUserId: number | null;
  options: ConsultantOption[];
  onChange: (nextUserId: number | null, nextLastName: string) => void;
  disabled?: boolean;
  /** Если false — нельзя снять выбор (например, обязательный «отправитель отчёта»). */
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.id === valueUserId);

  useEffect(() => {
    setSearch(selected?.last_name ?? "");
  }, [valueUserId, options]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const q = search.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.last_name.toLowerCase().includes(q)) : options;

  return (
    <div ref={rootRef} className="relative">
      <div
        className="rounded-xl border min-h-[44px] flex items-center px-3 cursor-pointer"
        style={{ ...inputStyle, borderColor: open ? "var(--accent)" : "var(--border)" }}
        onClick={() => { if (!disabled) setOpen(true); }}
      >
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => { if (!disabled) setOpen(true); }}
          placeholder={disabled ? "Консультанты не загружены" : allowClear ? "Поиск по ФИО" : "Выберите консультанта"}
          className="flex-1 bg-transparent outline-none min-w-0"
          style={{ color: "var(--text-primary)" }}
          disabled={disabled}
        />
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ transform: open ? "rotate(180deg)" : "none", color: "var(--text-tertiary)" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {open && (
        <div
          className="absolute top-full left-0 right-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-xl border shadow-lg"
          style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm" style={{ color: "var(--text-tertiary)" }}>Ничего не найдено</div>
          ) : (
            <div className="py-1">
              {allowClear && valueUserId != null && (
                <button
                  type="button"
                  className="w-full text-left px-4 py-3 text-sm hover:bg-opacity-80 transition-colors"
                  style={{ color: "var(--accent)", background: "transparent" }}
                  onClick={() => { setOpen(false); setSearch(""); onChange(null, ""); }}
                >
                  —
                </button>
              )}

              {filtered.slice(0, 50).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left px-4 py-3 text-sm hover:bg-opacity-80 transition-colors"
                  style={{ color: "var(--text-primary)", background: c.id === valueUserId ? "var(--accent-light)" : "transparent" }}
                  onClick={() => { setOpen(false); setSearch(c.last_name); onChange(c.id, c.last_name); }}
                >
                  {c.last_name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReportNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const editMatch = useMatch("/reports/:id/edit");
  const editReportId = editMatch?.params.id ? Number.parseInt(editMatch.params.id, 10) : NaN;
  const isEditMode = Number.isFinite(editReportId);

  const [me, setMe] = useState<{ id?: number; is_consultant?: boolean; is_admin?: boolean; is_reportnik?: boolean } | null>(null);
  const [editLoading, setEditLoading] = useState(isEditMode);
  const [editLoadError, setEditLoadError] = useState("");
  const [editMeta, setEditMeta] = useState<{ user_username: string; created_at: string | null; submitted_at?: string | null } | null>(null);
  /** Локальная дата/время для input datetime-local при редактировании админом */
  const [editCreatedAtLocal, setEditCreatedAtLocal] = useState("");
  const [warehouses, setWarehouses] = useState<RefItem[]>([]);
  const [consultants, setConsultants] = useState<{ id: number; last_name: string; first_name?: string | null; patronymic?: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitOk, setSubmitOk] = useState("");
  const [pointId, setPointId] = useState<number | "">("");
  const [pointSearch, setPointSearch] = useState("");
  const [pointOpen, setPointOpen] = useState(false);
  const pointRef = useRef<HTMLDivElement>(null);
  const [utroShould, setUtroShould] = useState("");
  const [utro, setUtro] = useState("");
  const [revenue, setRevenue] = useState("");
  const [nal, setNal] = useState("");
  const [bn, setBn] = useState("");
  const [ostFact, setOstFact] = useState("");
  const [bnCardReconciliation, setBnCardReconciliation] = useState("");
  const [bnZReport, setBnZReport] = useState("");
  const [hasExtraPayments, setHasExtraPayments] = useState(false);
  const [extraPayments, setExtraPayments] = useState<
    { amount: string; order_number: string; consultant_user_id: number | null; consultant_last_name: string }[]
  >([]);
  const [vyhod, setVyhod] = useState("");
  const [percent, setPercent] = useState("");
  /** Режим строк «взято» всегда включён: сумма собирается из элементов. */
  const [vzyalaDetailMode] = useState(true);
  /** Выбор долгов для зачёта в «Взято»: uid → вкл/сумма */
  const [debtTakeByUid, setDebtTakeByUid] = useState<Record<string, DebtTakePick>>({});
  /** Режим строк «долг» всегда включён: сумма собирается из элементов. */
  const [dolgDetailMode] = useState(true);
  const [dolgRows, setDolgRows] = useState<
    {
      order_number: string;
      amount: string;
      debt_reason_id: number | "";
      order_percent: string;
      report_month: string;
      warehouse_id: number | "";
    }[]
  >([]);
  const [expenseArticleOptions, setExpenseArticleOptions] = useState<RefItem[]>([]);
  const [takenReasonOptions, setTakenReasonOptions] = useState<RefItem[]>([]);
  const [takenSourceOptions, setTakenSourceOptions] = useState<RefItem[]>([]);
  const [debtReasonOptions, setDebtReasonOptions] = useState<RefItem[]>([]);
    const [withholdingTakeById, setWithholdingTakeById] = useState<
    Record<number, { selected: boolean; amount: string }>
  >({});
  /** Уже сохранённые в черновике/отчёте погашения (для редактирования). */
  const [loadedWithholdingDetails, setLoadedWithholdingDetails] = useState<
    { withholding_id: number; amount: number }[]
  >([]);

const [availableDebtRows, setAvailableDebtRows] = useState<AvailableDebtRow[]>([]);
  const [availableDebtLoading, setAvailableDebtLoading] = useState(false);
  const [editReportUserId, setEditReportUserId] = useState<number | null>(null);
  const [hasExpenses, setHasExpenses] = useState(false);
  const [expenseRows, setExpenseRows] = useState<
    { amount: string; expense_article_id: number | ""; taken_source_id: number | "" }[]
  >([{ amount: "", expense_article_id: "", taken_source_id: "" }]);
  const [hasReturns, setHasReturns] = useState(false);
  const [hasEncashment, setHasEncashment] = useState(false);
  const [encashmentNal, setEncashmentNal] = useState("");
  const [encashmentBn, setEncashmentBn] = useState("");
  const [returnBn, setReturnBn] = useState("");
  const [returnNal, setReturnNal] = useState("");
  const [returnDetails, setReturnDetails] = useState<{ date_check: string; consultant_last_name: string; consultant_user_id: number | null; return_reason: string; amount: string }[]>([
    { date_check: "", consultant_last_name: "", consultant_user_id: null, return_reason: "", amount: "" },
  ]);
  const [zReportFiles, setZReportFiles] = useState<string[]>([]);
  const [zReportUploading, setZReportUploading] = useState(false);
  const [cardFiles, setCardFiles] = useState<string[]>([]);
  const [cardUploading, setCardUploading] = useState(false);
  const [comment, setComment] = useState("");
  const [uploadError, setUploadError] = useState("");
  const zReportInputRef = useRef<HTMLInputElement | null>(null);
  const cardInputRef = useRef<HTMLInputElement | null>(null);
  const [reportRequiredKeys, setReportRequiredKeys] = useState<string[]>([]);
  const [reportRequiredAdminSelection, setReportRequiredAdminSelection] = useState<string[]>([]);
  const [reportRequiredSaving, setReportRequiredSaving] = useState(false);
  const [reportRequiredSettingsOpen, setReportRequiredSettingsOpen] = useState(false);

  const isConsultant = me?.is_consultant === true;
  const draftLoadedRef = useRef(false);
  const lastDraftUserIdRef = useRef<number | null>(null);
  const applyingDraftRef = useRef(false);
  const numToStr = (v: number | null | undefined) => (v == null ? "" : String(v));

  useEffect(() => {
    api.getMe().then(setMe).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    api
      .getReportRequiredFields()
      .then((r) => {
        setReportRequiredKeys(r.required);
        setReportRequiredAdminSelection(r.required);
      })
      .catch(() => {
        setReportRequiredKeys([]);
        setReportRequiredAdminSelection([]);
      });
  }, []);

  const effectiveRequiredKeys =
    isEditMode && me?.is_admin ? reportRequiredAdminSelection : reportRequiredKeys;
  const validationRequiredKeys = effectiveRequiredKeys.filter((k) => !REPORT_FORM_HIDDEN_FIELD_KEYS.has(k));
  const showReq = (key: string) =>
    effectiveRequiredKeys.includes(key) && !REPORT_FORM_HIDDEN_FIELD_KEYS.has(key);
  const reqMark = (key: string) =>
    showReq(key) ? <span style={{ color: "var(--error)" }}> *</span> : null;

  const handleSaveReportRequiredFields = async () => {
    setSubmitError("");
    setReportRequiredSaving(true);
    try {
      await api.updateReportRequiredFields(reportRequiredAdminSelection);
      const r = await api.getReportRequiredFields();
      setReportRequiredKeys(r.required);
      setReportRequiredAdminSelection(r.required);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Не удалось сохранить обязательные поля");
    } finally {
      setReportRequiredSaving(false);
    }
  };

  useEffect(() => {
    if (me !== null && isEditMode && !me.is_admin && me.is_reportnik !== true) {
      navigate("/reports", { replace: true });
    }
  }, [me, isEditMode, navigate]);

  useEffect(() => {
    if (me === null) return;

    const applyLoadedReport = (
      draft: ReportItem,
      mapped: { id: number; last_name: string; first_name?: string | null; patronymic?: string | null }[]
    ) => {
      applyingDraftRef.current = true;
      setPointId(draft.warehouse_id ?? "");
      setUtro(numToStr(draft.utro));
      setRevenue(numToStr(draft.revenue));
      setNal(numToStr(draft.nal));
      setBn(numToStr(draft.bn));
      setOstFact(numToStr(draft.ost_fact));
      setBnCardReconciliation(numToStr(draft.bn_card_reconciliation));
      setBnZReport(numToStr(draft.bn_z_report));

      setHasEncashment(!!draft.has_encashment);
      setEncashmentNal(numToStr(draft.encashment_nal));
      setEncashmentBn(numToStr(draft.encashment_bn));

      const whDetails = Array.isArray(draft.withholding_details)
        ? draft.withholding_details
            .map((x) => ({
              withholding_id: Number(x.withholding_id),
              amount: Number(x.amount),
            }))
            .filter((x) => x.withholding_id > 0 && Number.isFinite(x.amount) && x.amount > 0)
        : [];
      setLoadedWithholdingDetails(whDetails);
      const whTake: Record<number, { selected: boolean; amount: string }> = {};
      for (const x of whDetails) {
        whTake[x.withholding_id] = { selected: true, amount: String(x.amount) };
      }
      setWithholdingTakeById(whTake);

      setHasReturns(!!draft.has_returns);
      setReturnBn(numToStr(draft.return_bn));
      setReturnNal(numToStr(draft.return_nal));

      const pickConsultantId = (fullNameOrLastName: string | null | undefined) => {
        const q = (fullNameOrLastName ?? "").trim().toLowerCase();
        if (!q) return null;
        const foundExact = mapped.find((c) => c.last_name.trim().toLowerCase() === q);
        if (foundExact) return foundExact.id;
        const foundByLastNamePart = mapped.find((c) => {
          const full = c.last_name.trim().toLowerCase();
          const firstPart = full.split(/\s+/)[0] ?? "";
          return firstPart === q;
        });
        return foundByLastNamePart?.id ?? null;
      };

      const rdDetails = (draft.returns_details ?? []) as { date_check: string | null; consultant_last_name: string | null; return_reason?: string | null; amount?: number | null }[];
      const mappedRd =
        rdDetails.length > 0
          ? rdDetails.map((rd) => ({
              date_check: rd.date_check ?? "",
              consultant_last_name: (rd.consultant_last_name ?? "").trim(),
              consultant_user_id: pickConsultantId(rd.consultant_last_name),
              return_reason: (rd.return_reason ?? "").trim(),
              amount: rd.amount != null ? String(rd.amount) : "",
            }))
          : [{ date_check: "", consultant_last_name: "", consultant_user_id: null, return_reason: "", amount: "" }];
      setReturnDetails(mappedRd);

      const ep = (draft.extra_payments ?? []) as { amount: number; order_number: string; consultant_last_name?: string | null }[];
      setHasExtraPayments((ep?.length ?? 0) > 0);
      const mappedEp: { amount: string; order_number: string; consultant_user_id: number | null; consultant_last_name: string }[] = (ep ?? []).map((p) => ({
        amount: numToStr(p.amount),
        order_number: p.order_number ?? "",
        consultant_user_id: pickConsultantId(p.consultant_last_name ?? null),
        consultant_last_name: (p.consultant_last_name ?? "").trim(),
      }));
      setExtraPayments(mappedEp);

      setVyhod(numToStr(draft.vyhod));
      setPercent(numToStr(draft.percent));
      const vz = (draft.vzyala_details ?? []) as {
        order_number?: string;
        amount?: number;
        taken_reason_id?: number | null;
        taken_source_id?: number | null;
        order_percent?: number | null;
        report_month?: string | null;
        warehouse_id?: number | null;
        linked_debt_row_uid?: string | null;
        linked_debt_report_id?: number | null;
      }[];
      const nextTake: Record<string, DebtTakePick> = {};
      for (const row of vz) {
        const uid = (row.linked_debt_row_uid ?? "").trim();
        if (!uid) continue;
        const amt = row.amount != null ? String(row.amount) : "";
        nextTake[uid] = { selected: true, amount: amt };
      }
      setDebtTakeByUid(nextTake);
      const dg = (draft.dolg_details ?? []) as {
        order_number?: string;
        amount?: number;
        debt_reason_id?: number | null;
        order_percent?: number | null;
        report_month?: string | null;
        warehouse_id?: number | null;
      }[];
      if (dg.length > 0) {
        setDolgRows(
          dg.map((row) => ({
            order_number: (row.order_number ?? "").trim(),
            amount: row.amount != null ? String(row.amount) : "",
            debt_reason_id: row.debt_reason_id != null ? row.debt_reason_id : "",
            order_percent: row.order_percent != null ? String(row.order_percent) : "",
            report_month: (row.report_month ?? "").trim(),
            warehouse_id: row.warehouse_id != null && row.warehouse_id !== undefined ? row.warehouse_id : "",
          }))
        );
      } else {
        const amount = numToStr(draft.dolg);
        setDolgRows(
          amount
            ? [{ order_number: "", amount, debt_reason_id: "", order_percent: "", report_month: defaultReportMonth, warehouse_id: "" }]
            : []
        );
      }
      setHasExpenses(!!draft.has_expenses);
      const ex = (draft.expenses ?? []) as {
        amount?: number;
        expense_article_id?: number;
        taken_source_id?: number | null;
      }[];
      if (ex.length > 0) {
        setExpenseRows(
          ex.map((row) => ({
            amount: row.amount != null ? String(row.amount) : "",
            expense_article_id: typeof row.expense_article_id === "number" ? row.expense_article_id : "",
            taken_source_id: typeof row.taken_source_id === "number" ? row.taken_source_id : "",
          }))
        );
      } else {
        setExpenseRows([{ amount: "", expense_article_id: "", taken_source_id: "" }]);
      }
      setZReportFiles((draft.z_report_urls ?? []) as string[]);
      setCardFiles((draft.card_reconciliation_urls ?? []) as string[]);
      setComment(((draft as ReportItem).comment ?? "").toString());

      setTimeout(() => {
        applyingDraftRef.current = false;
      }, 0);
    };

    if (isEditMode) {
      if (!me.is_admin) return;
      let cancelled = false;
      setEditLoadError("");
      (async () => {
        try {
          const [whs, list, loaded, expenseArts, takenReasons, takenSources, debtReasons] = await Promise.all([
            api.ref.warehouses.list().catch(() => []),
            api.reports.consultants().catch(() => []),
            api.reports.get(editReportId),
            api.ref.expenseArticles.list().catch(() => []),
            api.ref.takenReasons.list().catch(() => []),
            api.ref.takenSources.list().catch(() => []),
            api.ref.debtReasons.list().catch(() => []),
          ]);
          if (cancelled) return;
          setWarehouses(whs);
          setExpenseArticleOptions(expenseArts);
          setTakenReasonOptions(takenReasons);
          setTakenSourceOptions(takenSources);
          setDebtReasonOptions(debtReasons);
          const mapped = list
            .filter((c) => (c.last_name ?? "").trim() !== "")
            .map((c) => ({ id: c.id, last_name: c.last_name, first_name: null, patronymic: null }));
          mapped.sort((a, b) => a.last_name.localeCompare(b.last_name, "ru"));
          setConsultants(mapped);
          setEditReportUserId(loaded.user_id ?? null);
          setEditMeta({ user_username: loaded.user_username, created_at: loaded.created_at, submitted_at: loaded.submitted_at ?? null });
          setEditCreatedAtLocal(reportCreatedAtToDatetimeLocal(loaded.submitted_at ?? loaded.created_at));
          applyLoadedReport(loaded, mapped);
        } catch (e) {
          if (!cancelled) setEditLoadError(e instanceof Error ? e.message : "Ошибка загрузки");
        } finally {
          if (!cancelled) setEditLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (!isEditMode && !isConsultant) {
      navigate("/reports", { replace: true });
      return;
    }
    api.ref.warehouses.list().then(setWarehouses).catch(() => setWarehouses([]));
    api.ref.expenseArticles.list().then(setExpenseArticleOptions).catch(() => setExpenseArticleOptions([]));
    api.ref.takenReasons.list().then(setTakenReasonOptions).catch(() => setTakenReasonOptions([]));
    api.ref.takenSources.list().then(setTakenSourceOptions).catch(() => setTakenSourceOptions([]));
    api.ref.debtReasons.list().then(setDebtReasonOptions).catch(() => setDebtReasonOptions([]));
    (async () => {
      try {
        const list = await api.reports.consultants().catch(() => []);
        const mapped = list
          .filter((c) => (c.last_name ?? "").trim() !== "")
          .map((c) => ({ id: c.id, last_name: c.last_name, first_name: null, patronymic: null }));
        mapped.sort((a, b) => a.last_name.localeCompare(b.last_name, "ru"));
        setConsultants(mapped);

        const curUserId = me?.id ?? null;
        const shouldLoadDraft = !draftLoadedRef.current || lastDraftUserIdRef.current !== curUserId;

        if (curUserId != null && shouldLoadDraft) {
          const [draft, takenReasons] = await Promise.all([
            api.reports.getDraft().catch((e) => {
              if (e instanceof Error && e.message === "DRAFT_NOT_FOUND") return null;
              return null;
            }),
            api.ref.takenReasons.list().catch(() => [] as RefItem[]),
          ]);
          setTakenReasonOptions(takenReasons);

          draftLoadedRef.current = true;
          lastDraftUserIdRef.current = curUserId;
          if (draft) {
            applyLoadedReport(draft, mapped);
          } else {
            setDebtTakeByUid({});
            setLoadedWithholdingDetails([]);
            setWithholdingTakeById({});
          }
        }
      } catch {
        setConsultants([]);
      }
    })();
  }, [me, isConsultant, isEditMode, editReportId, navigate]);

  useEffect(() => {
    if (typeof pointId !== "number") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.reports.getWarehouseLastOst(pointId, isEditMode && editReportId ? { beforeReportId: editReportId } : undefined);
        if (cancelled) return;
        const ostStr = res.ost != null ? String(res.ost) : "";
        setUtroShould(ostStr);
        // «Фактическое значение на утро» не подставляем автоматически — только вручную или из черновика/отчёта.
      } catch {
        // If lookup fails, don't block form filling.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pointId, isEditMode, editReportId]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (pointRef.current && !pointRef.current.contains(e.target as Node)) setPointOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const warehousesForPointSelect = useMemo(() => warehousesVisibleInReports(warehouses), [warehouses]);

  const filteredWarehouses = pointSearch.trim()
    ? warehousesForPointSelect.filter((w) => w.name.toLowerCase().includes(pointSearch.toLowerCase()))
    : warehousesForPointSelect;
  const selectedWarehouse = pointId ? warehouses.find((w) => w.id === pointId) : null;

  /** Список консультантов + текущий автор отчёта, если его ещё нет в справочнике (редкий случай). */
  const consultantAuthorOptions = useMemo((): ConsultantOption[] => {
    const base = consultants;
    if (
      editReportUserId != null &&
      !base.some((c) => c.id === editReportUserId) &&
      editMeta?.user_username
    ) {
      return [...base, { id: editReportUserId, last_name: editMeta.user_username }].sort((a, b) =>
        a.last_name.localeCompare(b.last_name, "ru")
      );
    }
    return base;
  }, [consultants, editReportUserId, editMeta?.user_username]);

  const handleZReportAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const fileList = input.files;
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    input.value = "";
    setUploadError("");
    setZReportUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        try {
          const url = await uploadReportFile(files[i]);
          setZReportFiles((prev) => [...prev, url]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Ошибка загрузки файла";
          setUploadError(msg);
        }
      }
    } finally {
      setZReportUploading(false);
    }
  };

  const handleCardAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const fileList = input.files;
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    input.value = "";
    setUploadError("");
    setCardUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        try {
          const url = await uploadReportFile(files[i]);
          setCardFiles((prev) => [...prev, url]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Ошибка загрузки файла";
          setUploadError(msg);
        }
      }
    } finally {
      setCardUploading(false);
    }
  };

  const removeZReport = (index: number) => setZReportFiles((prev) => prev.filter((_, i) => i !== index));
  const removeCard = (index: number) => setCardFiles((prev) => prev.filter((_, i) => i !== index));

  const parseNum = (s: string): number | undefined => {
    const v = parseFloat(s.replace(/,/, ".").trim());
    return Number.isNaN(v) ? undefined : v;
  };

  type RowFieldsVisibility = {
    showOrder: boolean;
    dateFieldType: "none" | "month_list" | "date";
    showPoint: boolean;
    showOrderPercent: boolean;
  };

  const DEFAULT_ROW_VISIBILITY: RowFieldsVisibility = {
    showOrder: false,
    dateFieldType: "none",
    showPoint: false,
    showOrderPercent: false,
  };

  const rowVisibilityByReasonName = (reasonName?: string): RowFieldsVisibility => {
    const n = (reasonName ?? "").trim().toLowerCase();
    if (!n) return DEFAULT_ROW_VISIBILITY;
    if (n.includes("выход")) {
      return { showOrder: false, dateFieldType: "date", showPoint: true, showOrderPercent: false };
    }
    if (n.includes("заказ")) {
      return { showOrder: true, dateFieldType: "none", showPoint: true, showOrderPercent: false };
    }
    if (n.includes("мотивац")) {
      return { showOrder: false, dateFieldType: "month_list", showPoint: false, showOrderPercent: false };
    }
    if (n.includes("процент")) {
      return { showOrder: false, dateFieldType: "date", showPoint: true, showOrderPercent: false };
    }
    return DEFAULT_ROW_VISIBILITY;
  };

  const getDebtRowVisibility = (reasonId: number | "") =>
    rowVisibilityByReasonName(debtReasonOptions.find((x) => x.id === reasonId)?.name);
  const defaultTakeDebtReasonId = useMemo(
    () => resolveTakeDebtReasonIdFromOptions(takenReasonOptions),
    [takenReasonOptions]
  );

  const cashFromRegisterSourceId = useMemo(
    () => resolveCashFromRegisterSourceId(takenSourceOptions),
    [takenSourceOptions]
  );

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const withholdingAppliedSum = useMemo(() => {
    let s = 0;
    for (const pick of Object.values(withholdingTakeById)) {
      if (!pick?.selected) continue;
      const amt = parseNum(pick.amount);
      if (amt == null || amt <= 0) continue;
      s += amt;
    }
    return round2(s);
  }, [withholdingTakeById]);

  /** Касса до забора «Взято»: база + погашенные удержания. */
  const cashBaseBeforeVzyala = useMemo(() => {
    const u = parseNum(utro) ?? 0;
    const n = parseNum(nal) ?? 0;
    const ret = hasReturns ? parseNum(returnNal) ?? 0 : 0;
    const encNal = hasEncashment ? parseNum(encashmentNal) ?? 0 : 0;
    const expFromCash = hasExpenses
      ? expenseRows.reduce((s, r) => {
          if (!takenSourceIsCashFromRegister(r.taken_source_id, cashFromRegisterSourceId)) return s;
          return s + (parseNum(r.amount) ?? 0);
        }, 0)
      : 0;
    return round2(u + n - ret - encNal - expFromCash + withholdingAppliedSum);
  }, [
    utro,
    nal,
    hasReturns,
    returnNal,
    hasEncashment,
    encashmentNal,
    hasExpenses,
    expenseRows,
    cashFromRegisterSourceId,
    withholdingAppliedSum,
  ]);

  const ostForPayload = (): number | undefined => {
    const v = round2(computedCashOst);
    return Number.isFinite(v) ? v : undefined;
  };

  const ostFactForPayload = (): number | null => {
    const v = parseNum(ostFact);
    if (v === undefined) return null;
    const r = round2(v);
    return Number.isFinite(r) ? r : null;
  };

  useEffect(() => {
    if (!me) return;
    const userIdForDebt = isEditMode && me.is_admin ? editReportUserId : undefined;
    if (isEditMode && me.is_admin && !userIdForDebt) return;
    setAvailableDebtLoading(true);
    api.reports
      .availableDebts({
        userId: userIdForDebt ?? undefined,
        excludeReportId: isEditMode && Number.isFinite(editReportId) ? editReportId : undefined,
      })
      .then((r) => setAvailableDebtRows(Array.isArray(r.rows) ? r.rows : []))
      .catch(() => setAvailableDebtRows([]))
      .finally(() => setAvailableDebtLoading(false));
  }, [me, isEditMode, editReportUserId, editReportId]);

  const normalizeReportMonth = (v: string | null | undefined): string => {
    const raw = (v ?? "").trim();
    if (!raw) return "";
    const d = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (d) return d[2];
    const m = raw.match(/^(\d{4})-(\d{2})$/);
    if (m) return m[2];
    if (/^\d{2}$/.test(raw)) return raw;
    return "";
  };

  const normalizeReportDate = (v: string | null | undefined): string => {
    const raw = (v ?? "").trim();
    if (!raw) return "";
    const d = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (d) return raw;
    return "";
  };

  const defaultReportMonth = useMemo(() => {
    const d = new Date();
    return String(d.getMonth() + 1).padStart(2, "0");
  }, []);

  useEffect(() => {
    setDebtTakeByUid((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const d of availableDebtRows) {
        if (next[d.debt_row_uid]) continue;
        next[d.debt_row_uid] = { selected: false, amount: String(d.amount) };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [availableDebtRows]);

  /** API + строки, уже зачтённые в этом отчёте, но не попавшие в /debts/available (иначе скрытый зачёт + новый долг = удвоение). */
  const debtRowsForForm = useMemo((): AvailableDebtRow[] => {
    const map = new Map<string, AvailableDebtRow>();
    for (const d of availableDebtRows) {
      map.set(d.debt_row_uid, d);
    }
    if (isEditMode) {
      for (const [uid, pick] of Object.entries(debtTakeByUid)) {
        const key = uid.trim();
        if (!key || map.has(key)) continue;
        const savedAmt = parseAmountLoose(pick.amount);
        if (!pick.selected && (savedAmt == null || savedAmt <= 0)) continue;
        map.set(key, {
          debt_row_uid: key,
          report_id: 0,
          amount: savedAmt != null && savedAmt > 0 ? savedAmt : 0,
          order_number: "",
          debt_reason_name: key.startsWith("1c-log-") ? "1С" : null,
        });
      }
    }
    return Array.from(map.values());
  }, [availableDebtRows, debtTakeByUid, isEditMode]);

  const vzyalaRows = useMemo((): VzyalaDebtRow[] => {
    const rows: VzyalaDebtRow[] = [];
    const seen = new Set<string>();
    for (const d of debtRowsForForm) {
      const uid = d.debt_row_uid;
      if (seen.has(uid)) continue;
      const pick = debtTakeByUid[uid];
      if (!pick?.selected) continue;
      seen.add(uid);
      rows.push({
        amount: pick.amount,
        order_number: (d.order_number ?? "").trim(),
        taken_reason_id: defaultTakeDebtReasonId,
        linked_debt_row_uid: uid,
        linked_debt_report_id: d.report_id > 0 ? d.report_id : null,
        warehouse_id: d.warehouse_id ?? null,
      });
    }
    return rows;
  }, [debtRowsForForm, debtTakeByUid, defaultTakeDebtReasonId]);

  const defaultReportDate = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const reportMonthOptions = useMemo(
    () => [
      { value: "01", label: "Январь" },
      { value: "02", label: "Февраль" },
      { value: "03", label: "Март" },
      { value: "04", label: "Апрель" },
      { value: "05", label: "Май" },
      { value: "06", label: "Июнь" },
      { value: "07", label: "Июль" },
      { value: "08", label: "Август" },
      { value: "09", label: "Сентябрь" },
      { value: "10", label: "Октябрь" },
      { value: "11", label: "Ноябрь" },
      { value: "12", label: "Декабрь" },
    ],
    []
  );

  const [vzyalaBaselinePending, setVzyalaBaselinePending] = useState(0);
  const vzyalaBaselineCapturedRef = useRef(false);

  const vzyalaRowsSum = useMemo(() => {
    const amounts = vzyalaRows.map((r) => parseNum(r.amount)).filter((x): x is number => x != null);
    if (amounts.length === 0) return null;
    return amounts.reduce((a, b) => a + b, 0);
  }, [vzyalaRows]);

  const vzyalaPendingCurrent = useMemo(() => sumVzyalaPendingAmount(vzyalaRows), [vzyalaRows]);

  /** При редактировании отчёта не вычитаем уже сохранённые строки «Взято» повторно — только изменения. */
  const vzyalaPendingForBalance = useMemo(() => {
    if (!isEditMode) return vzyalaPendingCurrent;
    return Math.max(0, vzyalaPendingCurrent - vzyalaBaselinePending);
  }, [isEditMode, vzyalaPendingCurrent, vzyalaBaselinePending]);

  useEffect(() => {
    vzyalaBaselineCapturedRef.current = false;
    setVzyalaBaselinePending(0);
  }, [editReportId]);

  useEffect(() => {
    if (!isEditMode || editLoading || vzyalaBaselineCapturedRef.current) return;
    setVzyalaBaselinePending(vzyalaPendingCurrent);
    vzyalaBaselineCapturedRef.current = true;
  }, [isEditMode, editLoading, vzyalaPendingCurrent]);

  const salaryBalanceUserId = useMemo(() => {
    if (isEditMode) return editReportUserId;
    return typeof me?.id === "number" ? me.id : null;
  }, [isEditMode, editReportUserId, me?.id]);

  const [salaryBalance, setSalaryBalance] = useState<EmployeeSalaryBalanceResponse | null>(null);
  const [salaryBalanceLoading, setSalaryBalanceLoading] = useState(false);

  useEffect(() => {
    if (salaryBalanceUserId == null || salaryBalanceUserId <= 0) {
      setSalaryBalance(null);
      setSalaryBalanceLoading(false);
      return;
    }
    let cancelled = false;
    setSalaryBalanceLoading(true);
    api.reports
      .employeeSalaryBalance({
        userId: salaryBalanceUserId,
        excludeReportId: isEditMode && Number.isFinite(editReportId) ? editReportId : undefined,
      })
      .then((r) => {
        if (!cancelled) setSalaryBalance(r);
      })
      .catch(() => {
        if (!cancelled) setSalaryBalance(null);
      })
      .finally(() => {
        if (!cancelled) setSalaryBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [salaryBalanceUserId, isEditMode, editReportId]);

  const BALANCE_EPS = 0.005;

  /** Остаток выплат из ЦК после «Взято» в уже отправленных отчётах (без текущей формы). */
  const ccAvailableBeforeForm = useMemo(() => {
    if (salaryBalance == null) return 0;
    const v = round2(salaryBalance.balance);
    return v > BALANCE_EPS ? v : 0;
  }, [salaryBalance]);

  const openWithholdingItems = useMemo(() => {
    if (salaryBalance == null) return [] as NonNullable<typeof salaryBalance>["withholding_items"];
    return Array.isArray(salaryBalance.withholding_items) ? salaryBalance.withholding_items : [];
  }, [salaryBalance]);

  /** Строки блока «Удержания»: открытые + уже отмеченные в этом отчёте. */
  const reportWithholdingRows = useMemo(() => {
    const byId = new Map<
      number,
      {
        id: number;
        amount: number;
        reason?: string | null;
        note?: string | null;
        report_month?: string | null;
        warehouse_name?: string | null;
        maxAmount: number;
      }
    >();
    for (const w of openWithholdingItems) {
      const openAmt = Number(w.amount) || 0;
      const prevApplied = loadedWithholdingDetails.find((x) => x.withholding_id === w.id)?.amount || 0;
      byId.set(w.id, {
        id: w.id,
        amount: openAmt,
        reason: w.reason,
        note: w.note,
        report_month: w.report_month,
        warehouse_name: w.warehouse_name,
        maxAmount: round2(openAmt + prevApplied),
      });
    }
    for (const d of loadedWithholdingDetails) {
      if (byId.has(d.withholding_id)) continue;
      byId.set(d.withholding_id, {
        id: d.withholding_id,
        amount: 0,
        reason: `Удержание #${d.withholding_id}`,
        note: null,
        report_month: null,
        warehouse_name: null,
        maxAmount: round2(Number(d.amount) || 0),
      });
    }
    return Array.from(byId.values()).sort((a, b) => b.id - a.id);
  }, [openWithholdingItems, loadedWithholdingDetails]);

  const salaryBalancePreview = useMemo(() => {
    if (salaryBalance == null) return null;
    const issued = Number(salaryBalance.central_cash_issued) || 0;
    const alreadyTaken = Number(salaryBalance.vzyala_taken) || 0;
    const pending = vzyalaPendingForBalance;
    const ccPool = round2(issued - alreadyTaken);
    const displayBalance = round2(ccPool);
    const rawBalance = round2(salaryBalance.balance);
    const availableAfterSubmitted = ccAvailableBeforeForm;
    const remaining = availableAfterSubmitted - pending;
    const cashToTake = Math.max(0, round2(pending - availableAfterSubmitted));
    return {
      issued,
      alreadyTaken,
      pending,
      availableAfterSubmitted,
      remaining,
      rawBalance,
      displayBalance,
      displayRemaining: displayBalance - pending,
      displayAfterIssued: displayBalance - pending > BALANCE_EPS ? displayBalance - pending : 0,
      withholdings: 0,
      withholdingItems: openWithholdingItems,
      uncoveredWithholding: 0,
      afterIssued: remaining > BALANCE_EPS ? remaining : 0,
      cashToTake,
    };
  }, [salaryBalance, vzyalaPendingForBalance, ccAvailableBeforeForm, openWithholdingItems]);

  /** Часть «Взято», которую нужно выдать из кассы точки (сверх ЦК). */
  const vzyalaFromCashRegister = useMemo(() => {
    const total = vzyalaRowsSum ?? 0;
    return Math.max(0, round2(total - ccAvailableBeforeForm));
  }, [vzyalaRowsSum, ccAvailableBeforeForm]);

  /** Остаток наличных в кассе: база минус забор из кассы в блоке «Взято». */
  const computedCashOst = useMemo(
    () => round2(cashBaseBeforeVzyala - vzyalaFromCashRegister),
    [cashBaseBeforeVzyala, vzyalaFromCashRegister]
  );

  const vzyalaExceedsCashOst = useMemo(() => {
    if (vzyalaFromCashRegister <= BALANCE_EPS) return false;
    return vzyalaFromCashRegister > round2(cashBaseBeforeVzyala) + BALANCE_EPS;
  }, [vzyalaFromCashRegister, cashBaseBeforeVzyala]);

  useEffect(() => {
    setWithholdingTakeById((prev) => {
      let changed = false;
      const next = { ...prev };
      const ids = new Set(reportWithholdingRows.map((w) => w.id));
      for (const w of reportWithholdingRows) {
        if (next[w.id]) continue;
        const loaded = loadedWithholdingDetails.find((x) => x.withholding_id === w.id);
        next[w.id] = loaded
          ? { selected: true, amount: String(loaded.amount) }
          : { selected: false, amount: String(w.maxAmount) };
        changed = true;
      }
      for (const id of Object.keys(next)) {
        const nid = Number(id);
        if (!ids.has(nid) && !next[nid]?.selected) {
          delete next[nid];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [reportWithholdingRows, loadedWithholdingDetails]);


  const dolgRowsSum = useMemo(() => {
    const amounts = dolgRows.map((r) => parseNum(r.amount)).filter((x): x is number => x != null);
    if (amounts.length === 0) return null;
    return amounts.reduce((a, b) => a + b, 0);
  }, [dolgRows]);

  const buildVzyalaPayload = (): {
    vzyala_details: {
      order_number: string;
      amount: number;
      taken_reason_id: number | null;
      taken_source_id: number | null;
      order_percent: number | null;
      report_month: string | null;
      warehouse_id: number | null;
      linked_debt_row_uid: string | null;
      linked_debt_report_id: number | null;
    }[];
    vzyala: number | null;
  } => {
    const details = vzyalaRows
      .map((r) => ({
        order_number: r.order_number.trim(),
        amount: parseNum(r.amount),
        taken_reason_id: defaultTakeDebtReasonId,
        taken_source_id: null,
        order_percent: null,
        report_month: null,
        warehouse_id: r.warehouse_id,
        linked_debt_row_uid: r.linked_debt_row_uid.trim() || null,
        linked_debt_report_id: r.linked_debt_report_id,
      }))
      .filter((r) => r.amount != null) as {
        order_number: string;
        amount: number;
        taken_reason_id: number | null;
        taken_source_id: number | null;
        order_percent: number | null;
        report_month: string | null;
        warehouse_id: number | null;
        linked_debt_row_uid: string | null;
        linked_debt_report_id: number | null;
      }[];

    if (details.length > 0) {
      return {
        vzyala_details: details,
        vzyala: details.reduce((s, d) => s + d.amount, 0),
      };
    }
    return { vzyala_details: [], vzyala: null };
  };

  const buildDolgPayload = (): {
    dolg_details: {
      order_number: string;
      amount: number;
      debt_reason_id: number | null;
      order_percent: number | null;
      report_month: string | null;
      warehouse_id: number | null;
    }[];
    dolg: number | null;
  } => {
    const details = dolgRows
      .map((r) => {
        const ui = getDebtRowVisibility(r.debt_reason_id);
        return {
          order_number: ui.showOrder ? r.order_number.trim() : "",
          amount: parseNum(r.amount),
          debt_reason_id: typeof r.debt_reason_id === "number" ? r.debt_reason_id : null,
          order_percent: ui.showOrderPercent ? parseNum(r.order_percent) ?? null : null,
          report_month:
            ui.dateFieldType === "month_list"
              ? normalizeReportMonth(r.report_month) || null
              : ui.dateFieldType === "date"
                ? normalizeReportDate(r.report_month) || null
                : null,
          warehouse_id: ui.showPoint && typeof r.warehouse_id === "number" ? r.warehouse_id : null,
        };
      })
      .filter(
        (r): r is {
          order_number: string;
          amount: number;
          debt_reason_id: number | null;
          order_percent: number | null;
          report_month: string | null;
          warehouse_id: number | null;
        } => r.amount != null
      );

    if (details.length > 0) {
      return {
        dolg_details: details,
        dolg: details.reduce((s, d) => s + d.amount, 0),
      };
    }
    return { dolg_details: [], dolg: null };
  };

  const buildExpensePayload = (): {
    has_expenses: boolean;
    expenses: { amount: number; expense_article_id: number; taken_source_id?: number | null }[];
  } => {
    if (!hasExpenses) return { has_expenses: false, expenses: [] };
    const expenses = expenseRows
      .map((r) => ({
        amount: parseNum(r.amount),
        expense_article_id: typeof r.expense_article_id === "number" ? r.expense_article_id : undefined,
        taken_source_id: typeof r.taken_source_id === "number" ? r.taken_source_id : null,
      }))
      .filter(
        (r): r is { amount: number; expense_article_id: number; taken_source_id: number | null } =>
          r.amount != null && r.expense_article_id != null
      );
    return { has_expenses: true, expenses };
  };

  const utroShouldNum = parseNum(utroShould);
  const utroActualNum = parseNum(utro);
  const utroMismatch = utroShouldNum != null && utroActualNum != null && utroShouldNum !== utroActualNum;

  const revenueNum = parseNum(revenue);
  const nalNum = parseNum(nal);
  const bnCardNum = parseNum(bnCardReconciliation);
  const revenueMismatch =
    revenueNum != null &&
    nalNum != null &&
    bnCardNum != null &&
    round2(revenueNum) !== round2(nalNum + bnCardNum);

  const buildReturnsPayload = () =>
    hasReturns
      ? returnDetails
          .map((rd) => ({
            date_check: rd.date_check || null,
            consultant_last_name: rd.consultant_last_name || null,
            return_reason: rd.return_reason || null,
            amount: parseNum(rd.amount),
          }))
          .filter(
            (rd) =>
              (rd.date_check ?? "").trim() !== "" ||
              (rd.consultant_last_name ?? "").trim() !== "" ||
              (rd.return_reason ?? "").trim() !== "" ||
              rd.amount != null
          )
      : [];

  
  const buildWithholdingPayload = () => {
    const details: { withholding_id: number; amount: number }[] = [];
    for (const w of reportWithholdingRows) {
      const pick = withholdingTakeById[w.id];
      if (!pick?.selected) continue;
      const amt = parseNum(pick.amount);
      if (amt == null || amt <= 0) continue;
      details.push({ withholding_id: w.id, amount: round2(amt) });
    }
    return details;
  };

  const validateWithholdingRows = (): string | null => {
    for (const w of reportWithholdingRows) {
      const pick = withholdingTakeById[w.id];
      if (!pick?.selected) continue;
      const label = (w.reason || w.note || `Удержание #${w.id}`).trim();
      const amt = parseNum(pick.amount);
      if (amt == null || amt <= 0) {
        return `Для «${label}» укажите сумму удержания больше нуля.`;
      }
      if (amt > w.maxAmount + 1e-4) {
        return `Для «${label}» можно отметить не больше ${w.maxAmount.toFixed(2)} ₽.`;
      }
    }
    return null;
  };

const validateTakeDebtRows = (): string | null => {
    for (const d of debtRowsForForm) {
      const pick = debtTakeByUid[d.debt_row_uid];
      if (!pick?.selected) continue;
      const label = debtCardTitle(d);
      const amt = parseNum(pick.amount);
      if (amt == null || amt <= 0) {
        return `Для «${label}» укажите сумму зачёта больше нуля.`;
      }
      if (amt > d.amount + 1e-4) {
        return `Для «${label}» можно зачесть не больше ${d.amount.toFixed(2)} ₽ (остаток).`;
      }
    }
    const total = vzyalaRowsSum ?? 0;
    if (total > BALANCE_EPS) {
      const fromCash = Math.max(0, round2(total - ccAvailableBeforeForm));
      const cashBefore = round2(cashBaseBeforeVzyala);
      if (fromCash > cashBefore + BALANCE_EPS) {
        return `Можно взять из кассы не больше ${fmtSalaryBalanceRub(cashBefore)} ₽. Уменьшите сумму или частично зачтите долг в другом отчёте.`;
      }
    }
    return null;
  };

  const handleSaveDraft = async () => {
    if (isEditMode) return;
    setSubmitError("");
    setSavingDraft(true);
    try {
      // Черновик сохраняем без проверок обязательных полей, долгов «Взято» и сверки безнала.
      const returnsDetailsPayload = buildReturnsPayload();
      // ВАЖНО: зачёт долгов ("Взято" с linked_debt_row_uid) фиксируем только при отправке отчёта,
      // иначе долги "закрываются" уже на этапе черновика.
      const vz: ReturnType<typeof buildVzyalaPayload> = { vzyala_details: [], vzyala: null };
      const dz = buildDolgPayload();
      const ve = buildExpensePayload();
      const whDetails = buildWithholdingPayload();

      await api.reports.create({
        is_draft: true,
        warehouse_id: pointId || undefined,
        comment: comment.trim() ? comment.trim() : null,
        utro: parseNum(utro),
        revenue: parseNum(revenue),
        nal: parseNum(nal),
        bn: parseNum(bn),
        ost: ostForPayload(),
        ost_fact: ostFactForPayload(),
        has_returns: hasReturns,
        return_bn: hasReturns ? parseNum(returnBn) : undefined,
        return_nal: hasReturns ? parseNum(returnNal) : undefined,
        returns_details: returnsDetailsPayload,
        bn_card_reconciliation: parseNum(bnCardReconciliation),
        bn_z_report: parseNum(bnZReport),
        has_encashment: hasEncashment,
        encashment_nal: hasEncashment ? parseNum(encashmentNal) : undefined,
        encashment_bn: hasEncashment ? parseNum(encashmentBn) : undefined,
        withholding_details: whDetails,
        extra_payments: hasExtraPayments
          ? extraPayments.map((p) => ({
              amount: parseNum(p.amount),
              order_number: p.order_number.trim(),
              consultant_last_name: (p.consultant_last_name || "").trim() || null,
            }))
          .filter((p) => p.amount != null) as { amount: number; order_number: string; consultant_last_name: string | null }[]
          : [],
        vyhod: parseNum(vyhod),
        percent: parseNum(percent),
        ...vz,
        ...dz,
        ...ve,
        z_report_urls: zReportFiles,
        card_reconciliation_urls: cardFiles,
      });
      navigate("/reports", { state: { draftSaved: true } });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Ошибка сохранения черновика");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitOk("");
    const bnCard = parseNum(bnCardReconciliation);
    const bnZ = parseNum(bnZReport);
    if (bnCard !== undefined && bnZ !== undefined && bnCard !== bnZ) {
      setSubmitError("Сверьте суммы: «Безнал сверка итогов» и «безнал в Z-отчёте» должны совпадать. Если не совпадают — звоните Кириллу или Артуру.");
      return;
    }
    if (revenueMismatch) {
      setSubmitError("Выручка должна равняться сумме полей «Наличные» и «Безнал сверка итогов».");
      return;
    }
    const takeDebtErr = validateTakeDebtRows();
    if (takeDebtErr) {
      setSubmitError(takeDebtErr);
      return;
    }
    const withholdingErr = validateWithholdingRows();
    if (withholdingErr) {
      setSubmitError(withholdingErr);
      return;
    }
    const returnsDetailsPayload = buildReturnsPayload();
    const vz = buildVzyalaPayload();
    const dz = buildDolgPayload();
    const ve = buildExpensePayload();
    const whDetails = buildWithholdingPayload();
    const hasDebtTakeInForm = vz.vzyala_details.some((d) => (d.linked_debt_row_uid ?? "").trim() !== "");

    if (!isEditMode && reportRequiredKeys.length > 0) {
      const extraPay =
        hasExtraPayments && extraPayments.length > 0
          ? extraPayments
              .map((p) => ({
                amount: parseNum(p.amount),
                order_number: p.order_number.trim(),
                consultant_last_name: (p.consultant_last_name || "").trim() || null,
              }))
              .filter((p): p is { amount: number; order_number: string; consultant_last_name: string | null } => p.amount != null)
          : [];
      const payload: ReportCreatePayloadLike = {
        warehouse_id: typeof pointId === "number" ? pointId : undefined,
        utro: parseNum(utro),
        revenue: parseNum(revenue),
        nal: parseNum(nal),
        bn: parseNum(bn),
        ost: ostForPayload(),
        ost_fact: ostFactForPayload(),
        has_returns: hasReturns,
        return_bn: hasReturns ? parseNum(returnBn) : undefined,
        return_nal: hasReturns ? parseNum(returnNal) : undefined,
        returns_details: returnsDetailsPayload,
        bn_card_reconciliation: parseNum(bnCardReconciliation),
        bn_z_report: parseNum(bnZReport),
        has_encashment: hasEncashment,
        encashment_nal: hasEncashment ? parseNum(encashmentNal) : undefined,
        encashment_bn: hasEncashment ? parseNum(encashmentBn) : undefined,
        extra_payments: extraPay,
        vyhod: parseNum(vyhod),
        percent: parseNum(percent),
        ...vz,
        ...dz,
        ...ve,
        z_report_urls: zReportFiles,
        card_reconciliation_urls: cardFiles,
      };
      const vErr = validateReportRequiredFieldsClient(payload, validationRequiredKeys);
      if (vErr) {
        setSubmitError(vErr);
        return;
      }
    }

    setLoading(true);
    try {
      if (isEditMode && editReportId) {
        if (editReportUserId == null || editReportUserId <= 0) {
          setSubmitError("Выберите отправителя отчёта (консультанта)");
          setLoading(false);
          return;
        }
        const dtIso =
          datetimeLocalToIso(editCreatedAtLocal) ??
          (editMeta?.submitted_at ? new Date(editMeta.submitted_at).toISOString() : (editMeta?.created_at ? new Date(editMeta.created_at).toISOString() : undefined));
        await api.reports.update(editReportId, {
          user_id: editReportUserId,
          warehouse_id: pointId || undefined,
          comment: comment.trim() ? comment.trim() : null,
          utro: parseNum(utro),
          revenue: parseNum(revenue),
          nal: parseNum(nal),
          bn: parseNum(bn),
          ost: ostForPayload(),
          ost_fact: ostFactForPayload(),
          has_returns: hasReturns,
          return_bn: hasReturns ? parseNum(returnBn) : undefined,
          return_nal: hasReturns ? parseNum(returnNal) : undefined,
          returns_details: returnsDetailsPayload,
          bn_card_reconciliation: parseNum(bnCardReconciliation),
          bn_z_report: parseNum(bnZReport),
          has_encashment: hasEncashment,
          encashment_nal: hasEncashment ? parseNum(encashmentNal) : undefined,
          encashment_bn: hasEncashment ? parseNum(encashmentBn) : undefined,
          withholding_details: whDetails,
          extra_payments: hasExtraPayments
            ? extraPayments
                .map((p) => ({
                  amount: parseNum(p.amount),
                  order_number: p.order_number.trim(),
                  consultant_last_name: (p.consultant_last_name || "").trim() || null,
                }))
                .filter((p) => p.amount != null) as { amount: number; order_number: string; consultant_last_name: string | null }[]
            : [],
          vyhod: parseNum(vyhod),
          percent: parseNum(percent),
          ...vz,
          ...dz,
          ...ve,
          z_report_urls: zReportFiles,
          card_reconciliation_urls: cardFiles,
          ...(dtIso ? { created_at: dtIso, submitted_at: dtIso } : {}),
        });
        const openedAsModal = Boolean((location.state as any)?.backgroundLocation);
        if (openedAsModal) {
          setSubmitOk("Изменения сохранены");
          return;
        }
        navigate("/reports", { replace: true, state: { reportUpdated: true } });
        return;
      }

      await api.reports.create({
        warehouse_id: pointId || undefined,
        comment: comment.trim() ? comment.trim() : null,
        utro: parseNum(utro),
        revenue: parseNum(revenue),
        nal: parseNum(nal),
        bn: parseNum(bn),
        ost: ostForPayload(),
        ost_fact: ostFactForPayload(),
        has_returns: hasReturns,
        return_bn: hasReturns ? parseNum(returnBn) : undefined,
        return_nal: hasReturns ? parseNum(returnNal) : undefined,
        returns_details: returnsDetailsPayload,
        bn_card_reconciliation: parseNum(bnCardReconciliation),
        bn_z_report: parseNum(bnZReport),
        has_encashment: hasEncashment,
        encashment_nal: hasEncashment ? parseNum(encashmentNal) : undefined,
        encashment_bn: hasEncashment ? parseNum(encashmentBn) : undefined,
        withholding_details: whDetails,
        extra_payments: hasExtraPayments
          ? extraPayments
              .map((p) => ({
                amount: parseNum(p.amount),
                order_number: p.order_number.trim(),
                consultant_last_name: (p.consultant_last_name || "").trim() || null,
              }))
              .filter((p) => p.amount != null) as { amount: number; order_number: string; consultant_last_name: string | null }[]
          : [],
        vyhod: parseNum(vyhod),
        percent: parseNum(percent),
        ...vz,
        ...dz,
        ...ve,
        z_report_urls: zReportFiles,
        card_reconciliation_urls: cardFiles,
      });
      navigate(hasDebtTakeInForm ? "/reports/debts-summary" : "/reports", {
        replace: true,
        state: hasDebtTakeInForm ? { reportSubmitted: true, tab: "taken" as const } : { reportSubmitted: true },
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Ошибка отправки");
    } finally {
      setLoading(false);
    }
  };

  if (me === null) {
    return (
      <div className="w-full max-w-none px-3 sm:px-0 animate-slide-in flex items-center justify-center py-12" style={{ color: "var(--text-tertiary)" }}>
        Загрузка…
      </div>
    );
  }

  if (isEditMode) {
    if (!me.is_admin) return null;
    if (editLoading) {
      return (
        <div className="w-full max-w-none px-3 sm:px-0 animate-slide-in flex items-center justify-center py-12" style={{ color: "var(--text-tertiary)" }}>
          Загрузка отчёта…
        </div>
      );
    }
    if (editLoadError) {
      return (
        <div className="w-full max-w-none px-3 sm:px-0 animate-slide-in space-y-4">
          <Link to="/reports" className="text-sm font-medium hover:underline" style={{ color: "var(--accent)" }}>
            ← К отчётам
          </Link>
          <div className="p-4 rounded-xl text-sm" style={{ backgroundColor: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}>
            {editLoadError}
          </div>
        </div>
      );
    }
  }

  if (!isEditMode && !isConsultant) {
    return null;
  }

  return (
    <div className="w-full max-w-none px-3 sm:px-0 animate-slide-in">
      <nav className="flex items-center gap-2 text-sm mb-4 px-0 sm:px-0" style={{ color: "var(--text-tertiary)" }}>
        <Link to="/reports" className="hover:underline" style={{ color: "var(--text-secondary)" }}>
          Отчёты
        </Link>
        <span>/</span>
        <span style={{ color: "var(--text-primary)" }}>{isEditMode ? "Редактирование" : "Новый отчёт"}</span>
      </nav>
      <h1 className={`text-2xl font-bold ${isEditMode && editMeta ? "mb-2" : "mb-6"}`} style={{ color: "var(--text-primary)" }}>
        {isEditMode ? "Редактирование отчёта" : "Новый отчёт"}
      </h1>
      {isEditMode && editMeta && (
        <div className="space-y-3 mb-6">
          <label className="block max-w-md">
            <span className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Отправитель отчёта (консультант)
            </span>
            <ConsultantSelect
              valueUserId={editReportUserId}
              options={consultantAuthorOptions}
              allowClear={false}
              disabled={consultantAuthorOptions.length === 0}
              onChange={(nextUserId, nextLastName) => {
                setEditReportUserId(nextUserId);
                setEditMeta((m) =>
                  m && nextUserId != null ? { ...m, user_username: nextLastName.trim() || m.user_username } : m
                );
              }}
            />
            <span className="block text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>
              У кого числится отчёт в списке и в аналитике; доступно только администратору
            </span>
          </label>
          <label className="block max-w-md">
            <span className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Дата и время отчёта
            </span>
            <input
              type="datetime-local"
              value={editCreatedAtLocal}
              onChange={(e) => setEditCreatedAtLocal(e.target.value)}
              className="w-full rounded-xl border px-3 py-2.5 text-sm"
              style={{ ...inputStyle, color: "var(--text-primary)" }}
            />
            <span className="block text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>
              Учитывается в списке отчётов и фильтрах по дате
            </span>
          </label>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-none rounded-xl sm:rounded-2xl p-3 sm:p-6 space-y-6 min-w-0"
        style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
      >
        {isEditMode && me.is_admin && (
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Обязательные поля при отправке отчёта
                </h3>
                {!reportRequiredSettingsOpen && (
                  <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                    Сейчас обязательных полей: {reportRequiredAdminSelection.length}. Нажмите «Изменить», чтобы открыть список.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setReportRequiredSettingsOpen((v) => !v)}
                className="text-sm font-medium px-3 py-1.5 rounded-xl shrink-0"
                style={{
                  color: "var(--accent)",
                  background: "var(--accent-light)",
                  border: "1px solid var(--border)",
                }}
              >
                {reportRequiredSettingsOpen ? "Свернуть" : "Изменить"}
              </button>
            </div>
            {reportRequiredSettingsOpen && (
              <>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Консультант не сможет отправить отчёт (не черновик), пока не заполнены отмеченные пункты. Черновики без этих полей сохраняются.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {REPORT_REQUIRED_FIELD_OPTIONS.map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-start gap-2 text-sm cursor-pointer rounded-lg px-2 py-1.5 hover:opacity-90"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={reportRequiredAdminSelection.includes(key)}
                        onChange={() =>
                          setReportRequiredAdminSelection((prev) =>
                            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
                          )
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={reportRequiredSaving}
                  onClick={handleSaveReportRequiredFields}
                  className="text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {reportRequiredSaving ? "Сохранение…" : "Сохранить список обязательных полей"}
                </button>
              </>
            )}
          </div>
        )}

        <div ref={pointRef} className="relative">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Точка{reqMark("warehouse_id")}
          </label>
          <div
            className="rounded-xl border min-h-[44px] flex items-center px-3 cursor-pointer"
            style={{ ...inputStyle, borderColor: pointOpen ? "var(--accent)" : "var(--border)" }}
            onClick={() => { if (!pointOpen) setPointSearch(selectedWarehouse?.name ?? ""); setPointOpen((v) => !v); }}
          >
            <input
              type="text"
              value={pointOpen ? pointSearch : (selectedWarehouse?.name ?? "")}
              onChange={(e) => { setPointSearch(e.target.value); setPointOpen(true); }}
              onFocus={() => setPointOpen(true)}
              placeholder="Выберите или введите для поиска"
              className="flex-1 bg-transparent outline-none min-w-0"
              style={{ color: "var(--text-primary)" }}
            />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: pointOpen ? "rotate(180deg)" : "none", color: "var(--text-tertiary)" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          {pointOpen && (
            <div className="absolute top-full left-0 right-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-xl border shadow-lg" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
              {filteredWarehouses.length === 0 ? (
                <div className="px-4 py-3 text-sm" style={{ color: "var(--text-tertiary)" }}>Нет складов</div>
              ) : (
                filteredWarehouses.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className="w-full text-left px-4 py-3 text-sm hover:bg-opacity-80 transition-colors"
                    style={{ color: "var(--text-primary)", background: pointId === w.id ? "var(--accent-light)" : "transparent" }}
                    onClick={() => { setPointId(w.id); setPointSearch(w.name); setPointOpen(false); }}
                  >
                    {w.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Утро</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>Должно быть</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={utroShould}
                  readOnly
                  className="rounded-xl border w-full px-3 py-2 text-sm"
                  style={{ ...inputStyle, background: "var(--bg-secondary)" }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>
                  Фактическое значение на утро{reqMark("utro")}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={utro}
                  onChange={(e) => setUtro(e.target.value)}
                  className="rounded-xl border w-full px-3 py-2 text-sm"
                  style={{ ...inputStyle, borderColor: utroMismatch ? "var(--error)" : "var(--border)" }}
                />
              </div>
            </div>

            {utroMismatch && (
              <div
                className="flex items-start gap-2 p-3 rounded-xl text-sm mt-3"
                style={{ backgroundColor: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}
              >
                <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Фактическое значение на утро не совпадает с «должно быть».</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Выручка{reqMark("revenue")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              className="rounded-xl border w-full px-3 py-2"
              style={{ ...inputStyle, borderColor: revenueMismatch ? "var(--error)" : "var(--border)" }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Наличные{reqMark("nal")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={nal}
              onChange={(e) => setNal(e.target.value)}
              className="rounded-xl border w-full px-3 py-2"
              style={{ ...inputStyle, borderColor: revenueMismatch ? "var(--error)" : "var(--border)" }}
            />
          </div>
        </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Безнал сверка итогов{reqMark("bn_card_reconciliation")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={bnCardReconciliation}
              onChange={(e) => setBnCardReconciliation(e.target.value)}
              className="rounded-xl border w-full px-3 py-2"
              style={{ ...inputStyle, borderColor: revenueMismatch ? "var(--error)" : "var(--border)" }}
              placeholder="Сумма"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Безнал Z-отчёт{reqMark("bn_z_report")}
            </label>
            <input type="text" inputMode="decimal" value={bnZReport} onChange={(e) => setBnZReport(e.target.value)} className="rounded-xl border w-full px-3 py-2" style={inputStyle} placeholder="Сумма" />
          </div>
        </div>
        {revenueMismatch && (
          <div
            className="flex items-start gap-2 p-3 rounded-xl text-sm"
            style={{ backgroundColor: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}
          >
            <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>
              Выручка должна равняться сумме «Наличные» и «Безнал сверка итогов»
              {revenueNum != null && nalNum != null && bnCardNum != null
                ? ` (${fmtSalaryBalanceRub(nalNum)} + ${fmtSalaryBalanceRub(bnCardNum)} = ${fmtSalaryBalanceRub(round2(nalNum + bnCardNum))}, выручка ${fmtSalaryBalanceRub(revenueNum)})`
                : ""}
              .
            </span>
          </div>
        )}
        {(() => {
          const a = parseNum(bnCardReconciliation);
          const b = parseNum(bnZReport);
          const bothFilled = a !== undefined && b !== undefined;
          const notEqual = bothFilled && a !== b;
          return notEqual ? (
            <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ backgroundColor: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}>
              <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Сверьте суммы: «Безнал сверка итогов» и «безнал в Z-отчёте» должны совпадать. Если не совпадают — звоните Кириллу или Артуру.</span>
            </div>
          ) : null;
        })()}

        <div
          className="rounded-xl p-4 transition-colors duration-200"
          style={{
            background: hasEncashment ? "var(--accent-light)" : "var(--bg-secondary)",
            border: `1px solid ${hasEncashment ? "var(--accent)" : "var(--border)"}`,
          }}
        >
          <button
            type="button"
            role="checkbox"
            aria-checked={hasEncashment}
            onClick={() => setHasEncashment((v) => !v)}
            className="w-full flex items-center justify-between gap-4 text-left rounded-lg py-2.5 px-1 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)]"
            style={{ color: "var(--text-primary)" }}
          >
            <span className="text-sm font-medium">
              Была инкассация?
              {(showReq("encashment_nal") || showReq("encashment_bn")) && (
                <span style={{ color: "var(--error)" }}> *</span>
              )}
            </span>
            <span
              className="relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ease-out"
              style={{ backgroundColor: hasEncashment ? "var(--accent)" : "var(--border)" }}
            >
              <span
                className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200 ease-out"
                style={{ left: hasEncashment ? "26px" : "2px", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}
              />
            </span>
          </button>
          {hasEncashment && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                  Сумма инкассации (нал){reqMark("encashment_nal")}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={encashmentNal}
                  onChange={(e) => setEncashmentNal(e.target.value)}
                  className="rounded-xl border w-full px-3 py-2"
                  style={inputStyle}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                  Сумма инкассации (безнал){reqMark("encashment_bn")}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={encashmentBn}
                  onChange={(e) => setEncashmentBn(e.target.value)}
                  className="rounded-xl border w-full px-3 py-2"
                  style={inputStyle}
                  placeholder="0"
                />
              </div>
            </div>
          )}
        </div>

        {!REPORT_FORM_HIDDEN_FIELD_KEYS.has("extra_payments") && (
        <div className="rounded-xl p-4 transition-colors duration-200" style={{ background: hasExtraPayments ? "var(--accent-light)" : "var(--bg-secondary)", border: `1px solid ${hasExtraPayments ? "var(--accent)" : "var(--border)"}` }}>
          <button
            type="button"
            role="checkbox"
            aria-checked={hasExtraPayments}
            onClick={() => setHasExtraPayments((v) => !v)}
            className="w-full flex items-center justify-between gap-4 text-left rounded-lg py-2.5 px-1 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)]"
            style={{ color: "var(--text-primary)" }}
          >
            <span className="text-sm font-medium">
              Были доплаты?{reqMark("extra_payments")}
            </span>
            <span className="relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ease-out" style={{ backgroundColor: hasExtraPayments ? "var(--accent)" : "var(--border)" }}>
              <span className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200 ease-out" style={{ left: hasExtraPayments ? "26px" : "2px", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }} />
            </span>
          </button>
          {hasExtraPayments && (
            <div className="mt-4 pt-4 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setExtraPayments((prev) => [...prev, { amount: "", order_number: "", consultant_user_id: null, consultant_last_name: "" }])
                  }
                  className="text-sm font-medium px-3 py-1.5 rounded-lg"
                  style={{ color: "var(--accent)", background: "var(--accent-light)" }}
                >
                  + Добавить доплату
                </button>
              </div>
              {extraPayments.map((p, i) => (
                <div key={i} className="flex flex-wrap items-end gap-3 p-3 rounded-xl" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>Сумма</label>
                    <input type="text" inputMode="decimal" value={p.amount} onChange={(e) => setExtraPayments((prev) => prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className="rounded-xl border w-full px-3 py-2 text-sm" style={inputStyle} placeholder="0" />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>Номер заказа</label>
                    <input type="text" value={p.order_number} onChange={(e) => setExtraPayments((prev) => prev.map((x, j) => (j === i ? { ...x, order_number: e.target.value } : x)))} className="rounded-xl border w-full px-3 py-2 text-sm" style={inputStyle} placeholder="№ заказа" />
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>Консультант</label>
                    <ConsultantSelect
                      valueUserId={p.consultant_user_id}
                      options={consultants}
                      disabled={consultants.length === 0}
                      onChange={(nextUserId, nextLastName) => {
                        setExtraPayments((prev) =>
                          prev.map((x, j) =>
                            j === i
                              ? { ...x, consultant_user_id: nextUserId, consultant_last_name: nextLastName }
                              : x
                          )
                        );
                      }}
                    />
                  </div>
                  <button type="button" onClick={() => setExtraPayments((prev) => prev.filter((_, j) => j !== i))} className="text-sm px-2 py-1.5 rounded-lg" style={{ color: "var(--error)" }}>Удалить</button>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        <div className="rounded-xl p-4 transition-colors duration-200" style={{ background: hasReturns ? "var(--accent-light)" : "var(--bg-secondary)", border: `1px solid ${hasReturns ? "var(--accent)" : "var(--border)"}` }}>
          <button
            type="button"
            role="checkbox"
            aria-checked={hasReturns}
            onClick={() => setHasReturns((v) => !v)}
            className="w-full flex items-center justify-between gap-4 text-left rounded-lg py-2.5 px-1 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)]"
            style={{ color: "var(--text-primary)" }}
          >
            <span className="text-sm font-medium">
              Были возвраты?
              {(showReq("return_bn") || showReq("return_nal") || showReq("returns_details")) && (
                <span style={{ color: "var(--error)" }}> *</span>
              )}
            </span>
            <span className="relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ease-out" style={{ backgroundColor: hasReturns ? "var(--accent)" : "var(--border)" }}>
              <span className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200 ease-out" style={{ left: hasReturns ? "26px" : "2px", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }} />
            </span>
          </button>
          {hasReturns && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                  Сумма возвратов по безналу (Z-отчет){reqMark("return_bn")}
                </label>
                <input type="text" inputMode="decimal" value={returnBn} onChange={(e) => setReturnBn(e.target.value)} className="rounded-xl border w-full px-3 py-2" style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                  Сумма возвратов по налу (Z-отчет){reqMark("return_nal")}
                </label>
                <input type="text" inputMode="decimal" value={returnNal} onChange={(e) => setReturnNal(e.target.value)} className="rounded-xl border w-full px-3 py-2" style={inputStyle} />
              </div>

              <div className="col-span-1 sm:col-span-2">
                <div className="mt-1 mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                  <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                    Возвраты (может быть несколько){reqMark("returns_details")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReturnDetails((prev) => [...prev, { date_check: "", consultant_last_name: "", consultant_user_id: null, return_reason: "", amount: "" }])}
                    className="w-full sm:w-auto text-sm font-medium px-3 py-2 rounded-lg text-center"
                    style={{ color: "var(--accent)", background: "var(--accent-light)" }}
                  >
                    + Добавить возврат
                  </button>
                </div>

                <div className="space-y-3">
                  {returnDetails.map((rd, i) => (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] items-end gap-3 p-3 rounded-xl min-w-0" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                      <div className="w-full min-w-0 overflow-hidden">
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>
                          Дата чека, по которому возврат
                        </label>
                        <div className="w-full min-w-0 overflow-hidden">
                          <input
                            type="date"
                            value={rd.date_check}
                            onChange={(e) => setReturnDetails((prev) => prev.map((x, j) => (j === i ? { ...x, date_check: e.target.value } : x)))}
                            className="return-date-input block rounded-xl border w-full min-w-0 px-3 py-2 text-sm"
                            style={{ ...inputStyle, minWidth: 0, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
                          />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>
                          Сумма
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={rd.amount}
                          onChange={(e) => setReturnDetails((prev) => prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                          className="rounded-xl border w-full min-w-0 px-3 py-2 text-sm"
                          style={inputStyle}
                          placeholder="0"
                        />
                      </div>
                      <div className="min-w-0">
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>
                          ФИО консультанта
                        </label>
                        <ConsultantSelect
                          valueUserId={rd.consultant_user_id}
                          options={consultants}
                          disabled={consultants.length === 0}
                          onChange={(nextUserId, nextLastName) => {
                            setReturnDetails((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, consultant_user_id: nextUserId, consultant_last_name: nextLastName } : x))
                            );
                          }}
                        />
                      </div>
                      <div className="min-w-0">
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>
                          Причина возврата
                        </label>
                        <input
                          type="text"
                          value={rd.return_reason}
                          onChange={(e) => setReturnDetails((prev) => prev.map((x, j) => (j === i ? { ...x, return_reason: e.target.value } : x)))}
                          className="rounded-xl border w-full min-w-0 px-3 py-2 text-sm"
                          style={inputStyle}
                          placeholder="Укажите причину"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setReturnDetails((prev) => prev.filter((_, j) => j !== i))}
                        disabled={returnDetails.length <= 1}
                        className="w-full md:col-span-2 lg:col-span-1 lg:w-auto text-sm px-2 py-2 rounded-lg text-center whitespace-nowrap"
                        style={{
                          color: "var(--error)",
                          opacity: returnDetails.length <= 1 ? 0.6 : 1,
                          cursor: returnDetails.length <= 1 ? "not-allowed" : "pointer",
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl p-4 space-y-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <h4 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Зарплата</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {!REPORT_FORM_HIDDEN_FIELD_KEYS.has("vyhod") && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Выход{reqMark("vyhod")}
              </label>
              <input type="text" inputMode="decimal" value={vyhod} onChange={(e) => setVyhod(e.target.value)} className="rounded-xl border w-full px-3 py-2" style={inputStyle} placeholder="0" />
            </div>
            )}
            {!REPORT_FORM_HIDDEN_FIELD_KEYS.has("percent") && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Процент{reqMark("percent")}
              </label>
              <input type="text" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} className="rounded-xl border w-full px-3 py-2" style={inputStyle} placeholder="0" />
            </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Взято{reqMark("vzyala")}
              </label>
              <div className="rounded-xl border px-3 py-2 space-y-2" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                <div className="text-sm tabular-nums font-medium" style={{ color: "var(--text-primary)" }}>
                  Сумма рассчитывается из строк · Итого: {vzyalaRowsSum != null ? vzyalaRowsSum : "—"}
                </div>
              </div>
            </div>
            {!REPORT_FORM_HIDDEN_FIELD_KEYS.has("dolg") && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Долг{reqMark("dolg")}
              </label>
              <div className="rounded-xl border px-3 py-2 space-y-2" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                <div className="text-sm tabular-nums font-medium" style={{ color: "var(--text-primary)" }}>
                  Сумма рассчитывается из строк · Итого: {dolgRowsSum != null ? dolgRowsSum : "—"}
                </div>
              </div>
            </div>
            )}
          </div>

          {salaryBalanceUserId != null && salaryBalanceUserId > 0 ? (
            <div
              className="rounded-xl p-4 space-y-2 border"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
            >
              <span className="text-sm font-semibold block" style={{ color: "var(--text-primary)" }}>
                Баланс
              </span>
              {salaryBalanceLoading && salaryBalance == null ? (
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Загрузка…
                </p>
              ) : (
                <div className="text-sm tabular-nums space-y-2">
                  {salaryBalancePreview != null ? (
                    <>
                      {salaryBalancePreview.rawBalance < -BALANCE_EPS &&
                      salaryBalancePreview.displayBalance <= BALANCE_EPS ? (
                        <div className="space-y-2">
                          {salaryBalancePreview.issued > BALANCE_EPS ? (
                            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                              Выдано из центральной кассы: {fmtSalaryBalanceRub(salaryBalancePreview.issued)} ₽
                            </div>
                          ) : null}
                          <div className="pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                            <div className="text-xs mb-0.5" style={{ color: "var(--text-tertiary)" }}>
                              Баланс
                            </div>
                            <div className="font-semibold text-2xl" style={{ color: "var(--error)" }}>
                              −{fmtSalaryBalanceRub(Math.abs(salaryBalancePreview.rawBalance))} ₽
                            </div>
                            <p className="text-[11px] mt-1 leading-snug" style={{ color: "var(--text-tertiary)" }}>
                              Минус из-за удержания
                              {salaryBalancePreview.withholdings > BALANCE_EPS
                                ? ` (−${fmtSalaryBalanceRub(salaryBalancePreview.withholdings)} ₽)`
                                : ""}
                              . При «Взято» эта сумма вычитается из забора из кассы.
                            </p>
                          </div>
                          {salaryBalancePreview.cashToTake > BALANCE_EPS ? (
                            <div className="pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                              <div className="text-xs mb-0.5 font-semibold" style={{ color: "var(--text-secondary)" }}>
                                Можно взять за вычетом удержания
                              </div>
                              <div className="font-semibold text-2xl" style={{ color: "var(--accent)" }}>
                                {fmtSalaryBalanceRub(salaryBalancePreview.cashToTake)} ₽
                              </div>
                            </div>
                          ) : salaryBalancePreview.pending > BALANCE_EPS ? (
                            <p className="text-[11px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
                              Текущее «Взято» ({fmtSalaryBalanceRub(salaryBalancePreview.pending)} ₽) покрыто
                              удержанием — из кассы брать не нужно (0 ₽).
                            </p>
                          ) : null}
                        </div>
                      ) : salaryBalancePreview.cashToTake > BALANCE_EPS ? (
                        <div className="space-y-2">
                          <div className="pt-1">
                            <div className="text-xs mb-0.5" style={{ color: "var(--text-tertiary)" }}>
                              Баланс
                            </div>
                            <div className="font-semibold text-2xl" style={{ color: "var(--text-primary)" }}>
                              {fmtSalaryBalanceRub(
                                salaryBalancePreview.pending > BALANCE_EPS
                                  ? salaryBalancePreview.displayAfterIssued
                                  : salaryBalancePreview.displayBalance
                              )}{" "}
                              ₽
                            </div>
                          </div>
                          {salaryBalancePreview.pending > BALANCE_EPS ||
                          salaryBalancePreview.afterIssued > BALANCE_EPS ? (
                            <>
                              <div className="flex justify-between gap-3 items-baseline">
                                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                  Выдано из центральной кассы
                                </span>
                                <span
                                  className="text-base font-medium tabular-nums line-through decoration-1"
                                  style={{ color: "var(--text-tertiary)" }}
                                >
                                  {fmtSalaryBalanceRub(salaryBalancePreview.issued)} ₽
                                </span>
                              </div>
                            </>
                          ) : null}
                          <div className="pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                            <div className="text-xs mb-0.5 font-semibold" style={{ color: "var(--text-secondary)" }}>
                              Можно взять из кассы точки
                            </div>
                            <div className="font-semibold text-2xl" style={{ color: "var(--accent)" }}>
                              {fmtSalaryBalanceRub(salaryBalancePreview.cashToTake)} ₽
                            </div>
                            <p
                              className="text-[11px] mt-1 leading-snug"
                              style={{
                                color: vzyalaExceedsCashOst ? "var(--error)" : "var(--text-tertiary)",
                              }}
                            >
                              Выплаты из ЦК закончились — эту сумму берите наличными из кассы точки.
                              {vzyalaExceedsCashOst
                                ? ` В кассе по расчёту только ${fmtSalaryBalanceRub(round2(computedCashOst))} ₽ — уменьшите «Взято».`
                                : ` Остаток в кассе: ${fmtSalaryBalanceRub(round2(computedCashOst))} ₽.`}
                            </p>
                          </div>
                        </div>
                      ) : salaryBalancePreview.displayBalance > BALANCE_EPS ||
                        salaryBalancePreview.displayAfterIssued > BALANCE_EPS ||
                        salaryBalancePreview.pending > BALANCE_EPS ? (
                        <>
                          {salaryBalancePreview.pending > BALANCE_EPS ? (
                            <>
                              <div className="flex justify-between gap-3 items-baseline">
                                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                  Выдано из центральной кассы
                                </span>
                                <span
                                  className="text-base font-medium tabular-nums line-through decoration-1"
                                  style={{ color: "var(--text-tertiary)" }}
                                >
                                  {fmtSalaryBalanceRub(salaryBalancePreview.issued)} ₽
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                              Выдано из центральной кассы
                            </div>
                          )}
                          <div className="pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                            <div className="text-xs mb-0.5" style={{ color: "var(--text-tertiary)" }}>
                              {salaryBalancePreview.pending > BALANCE_EPS ? "Остаток (баланс)" : "Баланс"}
                            </div>
                            <div className="font-semibold text-2xl" style={{ color: "var(--text-primary)" }}>
                              {fmtSalaryBalanceRub(
                                salaryBalancePreview.pending > BALANCE_EPS
                                  ? salaryBalancePreview.displayAfterIssued
                                  : salaryBalancePreview.displayBalance
                              )}{" "}
                              ₽
                            </div>
                          </div>
                        </>
                      ) : salaryBalancePreview.issued > BALANCE_EPS ||
                        salaryBalancePreview.withholdings > BALANCE_EPS ? null : (
                        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                          Выплат из центральной кассы пока нет.
                        </p>
                      )}

                    </>
                  ) : null}
                </div>
              )}
              {isEditMode && vzyalaBaselinePending > BALANCE_EPS ? (
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                  В этом отчёте уже записано «Взято» на {fmtSalaryBalanceRub(vzyalaBaselinePending)} ₽ (при
                  отправке). В балансе выше учтены только новые изменения; старые отчёты до выплаты из ЦК пул не
                  уменьшают.
                </p>
              ) : null}
              {salaryBalancePreview != null &&
              (salaryBalancePreview.displayBalance > BALANCE_EPS ||
                salaryBalancePreview.displayAfterIssued > BALANCE_EPS ||
                salaryBalancePreview.pending > BALANCE_EPS ||
                salaryBalancePreview.cashToTake > BALANCE_EPS) ? (
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                  Сумма выплат из ЦК уменьшается при зачёте долга в блоке «Взято» ниже (по отчётам после даты
                  выплаты).
                </p>
              ) : null}
            </div>
          ) : null}

          {vzyalaDetailMode && (
            <div
              className="rounded-xl p-4 space-y-3 transition-colors duration-200"
              style={{ background: "var(--accent-light)", border: "1px solid var(--accent)" }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Забор долгов в «Взято»
                </div>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Включите переключатель у нужного долга и при необходимости укажите сумму вручную. Можно выбрать несколько
                  долгов; частичный зачёт уменьшает только остаток по этой строке.
                </p>
              </div>
              {availableDebtLoading ? (
                <p className="text-sm py-4 text-center" style={{ color: "var(--text-tertiary)" }}>
                  Загрузка доступных долгов…
                </p>
              ) : debtRowsForForm.length === 0 ? (
                <p className="text-sm py-4 text-center rounded-xl border border-dashed" style={{ color: "var(--text-tertiary)", borderColor: "var(--border)" }}>
                  Нет открытых долгов для зачёта в этом отчёте.
                </p>
              ) : (
                <div className="space-y-3">
                  {debtRowsForForm.map((d) => {
                    const maxAmt = d.amount;
                    const pick = debtTakeByUid[d.debt_row_uid] ?? { selected: false, amount: String(maxAmt) };
                    const unpaidRemaining = debtUnpaidRemaining(maxAmt, pick);
                    const savedInThisReportOnly =
                      isEditMode &&
                      pick.selected &&
                      !availableDebtRows.some((r) => r.debt_row_uid === d.debt_row_uid);
                    return (
                      <div
                        key={d.debt_row_uid}
                        className="rounded-xl p-3 sm:p-4 space-y-3 border transition-colors"
                        style={{
                          background: "var(--bg-primary)",
                          borderColor: pick.selected ? "var(--accent)" : "var(--border)",
                          boxShadow: pick.selected ? "0 0 0 1px var(--accent)" : undefined,
                        }}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="w-full min-w-0 flex-1">
                            <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                              {debtCardTitle(d)}
                              {savedInThisReportOnly ? (
                                <span
                                  className="ml-2 text-[11px] font-normal px-1.5 py-0.5 rounded-md"
                                  style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}
                                >
                                  уже в этом отчёте
                                </span>
                              ) : null}
                            </div>
                            <div
                              className="text-xs mt-1.5 flex flex-col gap-1 w-full sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-0.5"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              <span className="w-full sm:w-auto tabular-nums">
                                {pick.selected
                                  ? `Непогашено ${fmtSalaryBalanceRub(unpaidRemaining)} ₽`
                                  : `Остаток ${fmtSalaryBalanceRub(maxAmt)} ₽`}
                              </span>
                              {isEditMode && pick.selected && maxAmt > unpaidRemaining + BALANCE_EPS ? (
                                <span className="w-full sm:w-auto text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                                  (в этом отчёте можно изменить зачёт до {fmtSalaryBalanceRub(maxAmt)} ₽)
                                </span>
                              ) : null}
                              <span className="hidden sm:inline" aria-hidden>
                                ·
                              </span>
                              <span className="w-full sm:w-auto break-words">
                                {d.warehouse_name ?? "Без точки"}
                              </span>
                              <span className="hidden sm:inline" aria-hidden>
                                ·
                              </span>
                              <span className="w-full sm:w-auto tabular-nums">
                                {formatDebtListDate(d.report_month)}
                              </span>
                            </div>
                            {(d.admin_note ?? "").trim() ? (
                              <div
                                className="text-xs mt-2 whitespace-pre-wrap break-words leading-relaxed"
                                style={{ color: "var(--text-tertiary)" }}
                                title={(d.admin_note ?? "").trim()}
                              >
                                {(d.admin_note ?? "").trim()}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex items-center justify-between gap-2 w-full sm:w-auto shrink-0 select-none sm:justify-end">
                            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                              Забрать
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={pick.selected}
                              aria-label={`Забрать долг: ${debtCardTitle(d)}`}
                              onClick={() => {
                                const on = !pick.selected;
                                setDebtTakeByUid((prev) => {
                                  const prevAmt = parseAmountLoose(prev[d.debt_row_uid]?.amount ?? "");
                                  const takeAmt =
                                    on && prevAmt != null && prevAmt > 0
                                      ? Math.min(prevAmt, maxAmt)
                                      : maxAmt;
                                  return {
                                    ...prev,
                                    [d.debt_row_uid]: {
                                      selected: on,
                                      amount: on
                                        ? String(takeAmt)
                                        : prev[d.debt_row_uid]?.amount ?? String(maxAmt),
                                    },
                                  };
                                });
                              }}
                              className="relative inline-flex h-8 w-[3.25rem] shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-[var(--bg-primary)]"
                              style={{
                                background: pick.selected ? "var(--accent)" : "var(--bg-secondary)",
                                border: "1px solid var(--border)",
                              }}
                            >
                              <span
                                className="inline-block h-[1.35rem] w-[1.35rem] rounded-full bg-white shadow-md transition-transform duration-200 ease-out"
                                style={{
                                  transform: pick.selected ? "translateX(1.35rem)" : "translateX(0.2rem)",
                                }}
                              />
                            </button>
                          </div>
                        </div>
                        {pick.selected ? (
                          <div className="flex flex-wrap items-end gap-3 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                            <div className="min-w-0 flex-1">
                              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                                Сумма зачёта (макс. {fmtSalaryBalanceRub(maxAmt)} ₽
                                {pick.selected && unpaidRemaining <= BALANCE_EPS ? ", долг будет погашен" : ""})
                              </label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={pick.amount}
                                onChange={(e) =>
                                  setDebtTakeByUid((prev) => ({
                                    ...prev,
                                    [d.debt_row_uid]: { selected: true, amount: e.target.value },
                                  }))
                                }
                                className="rounded-xl border w-full sm:max-w-[200px] px-3 py-2 text-sm tabular-nums"
                                style={inputStyle}
                                placeholder="0"
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-col gap-2 pt-2">
                <span className="text-sm font-semibold tabular-nums text-right" style={{ color: "var(--text-primary)" }}>
                  Итого «Взято»: {vzyalaRowsSum != null ? fmtSalaryBalanceRub(vzyalaRowsSum) : "—"} ₽
                </span>
                {vzyalaFromCashRegister > BALANCE_EPS ? (
                  <div
                    className="rounded-xl border px-3 py-3 space-y-1.5 text-right"
                    style={{
                      borderColor: vzyalaExceedsCashOst ? "var(--error)" : "var(--accent)",
                      background: vzyalaExceedsCashOst ? "var(--error-light)" : "var(--accent-light)",
                    }}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                      Можно взять из кассы точки
                    </div>
                    <div
                      className="text-2xl font-bold tabular-nums leading-none"
                      style={{ color: vzyalaExceedsCashOst ? "var(--error)" : "var(--accent)" }}
                    >
                      {fmtSalaryBalanceRub(vzyalaFromCashRegister)} ₽
                    </div>
                    <p className="text-xs leading-snug" style={{ color: "var(--text-secondary)" }}>
                      Выплаты из ЦК закончились — эту сумму берите наличными из кассы точки.
                    </p>
                    <p
                      className="text-xs tabular-nums font-medium"
                      style={{ color: vzyalaExceedsCashOst ? "var(--error)" : "var(--text-tertiary)" }}
                    >
                      Остаток наличных в кассе после забора: {fmtSalaryBalanceRub(round2(computedCashOst))} ₽
                    </p>
                  </div>
                ) : null}
                {vzyalaExceedsCashOst ? (
                  <span className="text-xs text-right leading-snug font-medium" style={{ color: "var(--error)" }}>
                    Нельзя взять из кассы больше, чем остаток наличных. Уменьшите сумму зачёта или частично заберите
                    долг в другом отчёте.
                  </span>
                ) : null}
              </div>
            </div>
          )}

          {reportWithholdingRows.length > 0 && (
            <div
              className="rounded-xl p-4 space-y-3 transition-colors duration-200"
              style={{ background: "var(--accent-light)", border: "1px solid var(--accent)" }}
            >
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Удержания
              </div>
              <p className="text-xs leading-snug" style={{ color: "var(--text-tertiary)" }}>
                Отметьте, что с вас удержали. Сумма увеличит наличные в кассе точки. При полном погашении удержание
                закроется.
              </p>
              <div className="space-y-2">
                {reportWithholdingRows.map((w) => {
                  const pick = withholdingTakeById[w.id] ?? {
                    selected: false,
                    amount: String(w.maxAmount),
                  };
                  const maxAmt = w.maxAmount;
                  const takeAmt = parseNum(pick.amount) ?? 0;
                  const unpaidRemaining = round2(maxAmt - (pick.selected ? takeAmt : 0));
                  const title = (w.reason || w.note || `Удержание #${w.id}`).trim();
                  return (
                    <div
                      key={w.id}
                      className="rounded-xl border p-3 space-y-2"
                      style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                            {title}
                          </div>
                          <div className="text-xs mt-1 tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                            Остаток: {fmtSalaryBalanceRub(maxAmt)} ₽
                            {w.warehouse_name ? ` · ${w.warehouse_name}` : ""}
                            {w.report_month ? ` · ${w.report_month}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 w-full sm:w-auto shrink-0 select-none sm:justify-end">
                          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                            Удержано
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={pick.selected}
                            aria-label={`Отметить удержание: ${title}`}
                            onClick={() => {
                              const on = !pick.selected;
                              setWithholdingTakeById((prev) => {
                                const prevAmt = parseAmountLoose(prev[w.id]?.amount ?? "");
                                const nextAmt =
                                  on && prevAmt != null && prevAmt > 0 ? Math.min(prevAmt, maxAmt) : maxAmt;
                                return {
                                  ...prev,
                                  [w.id]: {
                                    selected: on,
                                    amount: on ? String(nextAmt) : prev[w.id]?.amount ?? String(maxAmt),
                                  },
                                };
                              });
                            }}
                            className="relative inline-flex h-8 w-[3.25rem] shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-[var(--bg-primary)]"
                            style={{
                              background: pick.selected ? "var(--accent)" : "var(--bg-secondary)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <span
                              className="inline-block h-[1.35rem] w-[1.35rem] rounded-full bg-white shadow-md transition-transform duration-200 ease-out"
                              style={{
                                transform: pick.selected ? "translateX(1.35rem)" : "translateX(0.2rem)",
                              }}
                            />
                          </button>
                        </div>
                      </div>
                      {pick.selected ? (
                        <div className="flex flex-wrap items-end gap-3 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                          <div className="min-w-0 flex-1">
                            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                              Сумма (макс. {fmtSalaryBalanceRub(maxAmt)} ₽
                              {unpaidRemaining <= BALANCE_EPS ? ", будет закрыто" : ""})
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={pick.amount}
                              onChange={(e) =>
                                setWithholdingTakeById((prev) => ({
                                  ...prev,
                                  [w.id]: { selected: true, amount: e.target.value },
                                }))
                              }
                              className="rounded-xl border w-full sm:max-w-[200px] px-3 py-2 text-sm tabular-nums"
                              style={inputStyle}
                              placeholder="0"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="text-sm font-semibold tabular-nums text-right" style={{ color: "var(--text-primary)" }}>
                Итого удержано: {withholdingAppliedSum > BALANCE_EPS ? fmtSalaryBalanceRub(withholdingAppliedSum) : "—"} ₽
                {withholdingAppliedSum > BALANCE_EPS ? (
                  <span className="block text-xs font-normal mt-1" style={{ color: "var(--text-tertiary)" }}>
                    +{fmtSalaryBalanceRub(withholdingAppliedSum)} ₽ к наличным в кассе
                  </span>
                ) : null}
              </div>
            </div>
          )}

          {dolgDetailMode && !REPORT_FORM_HIDDEN_FIELD_KEYS.has("dolg") && (
            <div
              className="rounded-xl p-4 space-y-3 transition-colors duration-200"
              style={{ background: "var(--accent-light)", border: "1px solid var(--accent)" }}
            >
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Блок «Долг»
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setDolgRows((prev) => [...prev, { order_number: "", amount: "", debt_reason_id: "", order_percent: "", report_month: defaultReportMonth, warehouse_id: "" }])
                  }
                  className="text-sm font-medium px-3 py-1.5 rounded-lg"
                  style={{ color: "var(--accent)", background: "var(--bg-primary)" }}
                >
                  + Ещё строка
                </button>
              </div>
              {dolgRows.map((row, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-3 p-3 rounded-xl"
                  style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
                >
                  {(() => {
                    const ui = getDebtRowVisibility(row.debt_reason_id);
                    const reasonSelected = typeof row.debt_reason_id === "number";
                    return (
                      <>
                  <div className="flex-[1.3] min-w-[180px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>За что долг</label>
                    <select
                      value={row.debt_reason_id === "" ? "" : String(row.debt_reason_id)}
                      onChange={(e) => {
                        const v = e.target.value;
                        const nextReasonId = v === "" ? "" : Number.parseInt(v, 10);
                        const nextReasonName =
                          typeof nextReasonId === "number"
                            ? debtReasonOptions.find((tr) => tr.id === nextReasonId)?.name
                            : "";
                        const nextUi = rowVisibilityByReasonName(nextReasonName);
                        setDolgRows((prev) =>
                          prev.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  debt_reason_id: nextReasonId,
                                  report_month:
                                    nextUi.dateFieldType === "month_list"
                                      ? normalizeReportMonth(x.report_month) || defaultReportMonth
                                      : nextUi.dateFieldType === "date"
                                        ? normalizeReportDate(x.report_month) || defaultReportDate
                                        : "",
                                }
                              : x
                          )
                        );
                      }}
                      className="rounded-xl border w-full px-3 py-2 text-sm"
                      style={{ ...inputStyle, appearance: "auto" }}
                    >
                      <option value="">Выберите из справочника</option>
                      {debtReasonOptions.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {ui.showOrder && <div className="flex-1 min-w-[120px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>Заказ</label>
                    <input
                      type="text"
                      value={row.order_number}
                      onChange={(e) =>
                        setDolgRows((prev) => prev.map((x, j) => (j === i ? { ...x, order_number: e.target.value } : x)))
                      }
                      className="rounded-xl border w-full px-3 py-2 text-sm"
                      style={inputStyle}
                      placeholder="№ заказа"
                    />
                  </div>}
                  {reasonSelected && <div className="flex-1 min-w-[100px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>{ui.showOrder ? "Долг с заказа" : "Сумма"}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(e) =>
                        setDolgRows((prev) => prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                      }
                      className="rounded-xl border w-full px-3 py-2 text-sm tabular-nums"
                      style={inputStyle}
                      placeholder="0"
                    />
                  </div>}
                  {ui.showOrderPercent && <div className="flex-1 min-w-[120px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>Процент от заказа</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.order_percent}
                      onChange={(e) =>
                        setDolgRows((prev) => prev.map((x, j) => (j === i ? { ...x, order_percent: e.target.value } : x)))
                      }
                      className="rounded-xl border w-full px-3 py-2 text-sm tabular-nums"
                      style={inputStyle}
                      placeholder="%"
                    />
                  </div>}
                  {ui.dateFieldType !== "none" && <div className="flex-1 min-w-[140px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>
                      {ui.dateFieldType === "month_list" ? "Дата (месяц)" : "Дата"}
                    </label>
                    {ui.dateFieldType === "month_list" ? (
                      <select
                        value={normalizeReportMonth(row.report_month)}
                        onChange={(e) =>
                          setDolgRows((prev) => prev.map((x, j) => (j === i ? { ...x, report_month: e.target.value } : x)))
                        }
                        className="rounded-xl border w-full min-w-0 max-w-full px-3 py-2 text-sm"
                        style={{ ...inputStyle, appearance: "auto" }}
                      >
                        <option value="">Выберите месяц</option>
                        {reportMonthOptions.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="date"
                        value={normalizeReportDate(row.report_month)}
                        onChange={(e) =>
                          setDolgRows((prev) => prev.map((x, j) => (j === i ? { ...x, report_month: e.target.value } : x)))
                        }
                        className="rounded-xl border w-full min-w-0 max-w-full px-3 py-2 text-sm"
                        style={inputStyle}
                      />
                    )}
                  </div>}
                  {ui.showPoint && <div className="flex-[2] min-w-[200px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>Точка</label>
                    <select
                      value={row.warehouse_id === "" ? "" : String(row.warehouse_id)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDolgRows((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, warehouse_id: v === "" ? "" : Number.parseInt(v, 10) } : x
                          )
                        );
                      }}
                      className="rounded-xl border w-full px-3 py-2 text-sm"
                      style={{ ...inputStyle, appearance: "auto" }}
                    >
                      <option value="">Выберите точку</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>}
                  <button
                    type="button"
                    onClick={() => setDolgRows((prev) => prev.filter((_, j) => j !== i))}
                    className="text-sm px-2 py-1.5 rounded-lg shrink-0"
                    style={{ color: "var(--error)" }}
                  >
                    Удалить
                  </button>
                      </>
                    );
                  })()}
                </div>
              ))}
              <div className="flex justify-end pt-1">
                <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  Итого: {dolgRowsSum != null ? dolgRowsSum : "—"}
                </span>
              </div>
            </div>
          )}
        </div>

        <div
          className="rounded-xl p-4 transition-colors duration-200"
          style={{
            background: hasExpenses ? "var(--accent-light)" : "var(--bg-secondary)",
            border: `1px solid ${hasExpenses ? "var(--accent)" : "var(--border)"}`,
          }}
        >
          <button
            type="button"
            role="checkbox"
            aria-checked={hasExpenses}
            onClick={() => {
              setHasExpenses((v) => {
                if (v) {
                  setExpenseRows([{ amount: "", expense_article_id: "", taken_source_id: "" }]);
                  return false;
                }
                setExpenseRows((rows) =>
                  rows.length === 0 ? [{ amount: "", expense_article_id: "", taken_source_id: "" }] : rows
                );
                return true;
              });
            }}
            className="w-full flex items-center justify-between gap-4 text-left rounded-lg py-2.5 px-1 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)]"
            style={{ color: "var(--text-primary)" }}
          >
            <span className="text-sm font-medium">
              Расходы{reqMark("expenses")}
            </span>
            <span className="relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ease-out" style={{ backgroundColor: hasExpenses ? "var(--accent)" : "var(--border)" }}>
              <span className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200 ease-out" style={{ left: hasExpenses ? "26px" : "2px", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }} />
            </span>
          </button>
          {hasExpenses && (
            <div className="mt-4 pt-4 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Статьи расходов — в{" "}
                <Link to="/settings/references/expense-articles" className="underline font-medium" style={{ color: "var(--accent)" }}>
                  Справочники → Статьи расходов
                </Link>
                . «Откуда взято» — в{" "}
                <Link to="/settings/references/taken-sources" className="underline font-medium" style={{ color: "var(--accent)" }}>
                  Справочники → Откуда взято
                </Link>
                .
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setExpenseRows((prev) => [...prev, { amount: "", expense_article_id: "", taken_source_id: "" }])
                  }
                  className="text-sm font-medium px-3 py-1.5 rounded-lg"
                  style={{ color: "var(--accent)", background: "var(--bg-primary)" }}
                >
                  + Ещё строка
                </button>
              </div>
              {expenseRows.map((row, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-3 p-3 rounded-xl"
                  style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
                >
                  <div className="flex-1 min-w-[100px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>Сумма</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(e) =>
                        setExpenseRows((prev) => prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                      }
                      className="rounded-xl border w-full px-3 py-2 text-sm tabular-nums"
                      style={inputStyle}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-[2] min-w-[200px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>Статья расходов</label>
                    <select
                      value={row.expense_article_id === "" ? "" : String(row.expense_article_id)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setExpenseRows((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, expense_article_id: v === "" ? "" : Number.parseInt(v, 10) } : x
                          )
                        );
                      }}
                      className="rounded-xl border w-full px-3 py-2 text-sm"
                      style={{ ...inputStyle, appearance: "auto" }}
                    >
                      <option value="">Выберите статью</option>
                      {expenseArticleOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-[2] min-w-[200px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>
                      Откуда взято
                    </label>
                    <select
                      value={row.taken_source_id === "" ? "" : String(row.taken_source_id)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setExpenseRows((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, taken_source_id: v === "" ? "" : Number.parseInt(v, 10) } : x
                          )
                        );
                      }}
                      className="rounded-xl border w-full px-3 py-2 text-sm"
                      style={{ ...inputStyle, appearance: "auto" }}
                    >
                      <option value="">Выберите из справочника</option>
                      {takenSourceOptions.map((ts) => (
                        <option key={ts.id} value={ts.id}>
                          {ts.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpenseRows((prev) => prev.filter((_, j) => j !== i))}
                    className="text-sm px-2 py-1.5 rounded-lg shrink-0"
                    style={{ color: "var(--error)" }}
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Остаток наличных (расчёт){reqMark("ost")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              readOnly
              value={numToStr(ostForPayload())}
              className="rounded-xl border w-full px-3 py-2"
              style={{ ...inputStyle, background: "var(--bg-secondary)", cursor: "default" }}
              title="Считается автоматически"
            />
            <p className="mt-1.5 text-xs leading-snug" style={{ color: "var(--text-tertiary)" }}>
              Утро + наличные − возвраты наличными − инкассация (только нал) − расходы с источником «Наличными из кассы» −
              забор из кассы в «Взято» (сверх выплат из ЦК).
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Остаток наличных, факт
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={ostFact}
              onChange={(e) => setOstFact(e.target.value)}
              className="rounded-xl border w-full px-3 py-2"
              style={inputStyle}
              placeholder="Фактический остаток в кассе"
            />
            <p className="mt-1.5 text-xs leading-snug" style={{ color: "var(--text-tertiary)" }}>
              На следующую смену в «Утро» и «Утро должно» подставляется это значение; если поле пустое — используется расчётный остаток слева.
            </p>
          </div>
        </div>

        <div className="rounded-xl p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Z-отчёт (файлов может быть несколько){reqMark("z_report_urls")}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input ref={zReportInputRef} type="file" multiple accept=".pdf,.heic,.heif,image/*" onChange={handleZReportAdd} className="hidden" />
            <button
              type="button"
              onClick={() => zReportInputRef.current?.click()}
              disabled={zReportUploading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              {zReportUploading ? "Загрузка…" : "+ Загрузить файл(ы)"}
            </button>
            {zReportFiles.length > 0 && (
              <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                Загружено: {zReportFiles.length} {zReportFiles.length === 1 ? "файл" : zReportFiles.length < 5 ? "файла" : "файлов"}
              </span>
            )}
          </div>
          {zReportFiles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {zReportFiles.map((url, i) => (
                <FileThumbnail key={`z-${i}-${url}`} url={url} onRemove={() => removeZReport(i)} />
              ))}
            </div>
          )}
          {uploadError && (
            <p className="mt-2 text-sm" style={{ color: "var(--error)" }}>{uploadError}</p>
          )}
        </div>

        <div className="rounded-xl p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Сверка итогов по картам (файлов может быть несколько){reqMark("card_reconciliation_urls")}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input ref={cardInputRef} type="file" multiple accept=".pdf,.heic,.heif,image/*" onChange={handleCardAdd} className="hidden" />
            <button
              type="button"
              onClick={() => cardInputRef.current?.click()}
              disabled={cardUploading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              {cardUploading ? "Загрузка…" : "+ Загрузить файл(ы)"}
            </button>
            {cardFiles.length > 0 && (
              <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                Загружено: {cardFiles.length} {cardFiles.length === 1 ? "файл" : cardFiles.length < 5 ? "файла" : "файлов"}
              </span>
            )}
          </div>
          {cardFiles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {cardFiles.map((url, i) => (
                <FileThumbnail key={`c-${i}-${url}`} url={url} onRemove={() => removeCard(i)} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Комментарий
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="rounded-xl border w-full px-3 py-2 text-sm"
            style={inputStyle}
            placeholder="Любой комментарий к отчёту…"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          {!isEditMode && (
            <button
              type="button"
              disabled={loading || savingDraft}
              onClick={handleSaveDraft}
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold disabled:opacity-50"
              style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              title="Сохранить черновик без проверки обязательных полей"
            >
              {savingDraft ? "Сохранение…" : "Сохранить черновик"}
            </button>
          )}
          {isEditMode && me?.is_admin !== true ? (
            <div
              className="w-full sm:w-auto px-4 py-3 rounded-xl text-sm font-semibold text-center"
              style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)", border: "1px solid var(--border)" }}
            >
              Режим просмотра (без прав редактирования)
            </div>
          ) : (
            <button
              type="submit"
              disabled={loading || savingDraft || !pointId}
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {loading ? (isEditMode ? "Сохранение…" : "Отправка…") : isEditMode ? "Сохранить изменения" : "Отправить отчёт"}
            </button>
          )}
        </div>
      </form>

      {submitOk ? (
        <div className="mb-4 p-3 rounded-xl" style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)", color: "var(--text-primary)" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">{submitOk}</div>
            <button
              type="button"
              className="px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              onClick={() => setSubmitOk("")}
            >
              Ок
            </button>
          </div>
        </div>
      ) : null}

      {submitError ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setSubmitError("")}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl p-5 shadow-xl"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--error)" }}
            onClick={(ev) => ev.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="report-submit-error-title"
            aria-describedby="report-submit-error-desc"
          >
            <h2 id="report-submit-error-title" className="text-lg font-semibold mb-3" style={{ color: "var(--error)" }}>
              Не удалось отправить
            </h2>
            <p id="report-submit-error-desc" className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
              {submitError}
            </p>
            <div className="flex justify-end mt-5">
              <button
                type="button"
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "var(--accent)" }}
                onClick={() => setSubmitError("")}
                autoFocus
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
