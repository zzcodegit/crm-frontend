import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useNavigate, useMatch } from "react-router-dom";
import { api } from "../api";
import type { AvailableDebtRow, RefItem, ReportItem } from "../api";

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
import { inputStyle, uploadReportFile, FileThumbnail } from "./reportsShared";
import {
  REPORT_REQUIRED_FIELD_OPTIONS,
  validateReportRequiredFieldsClient,
  type ReportCreatePayloadLike,
} from "../reportRequiredValidation";

type ConsultantOption = { id: number; last_name: string };
const TAKE_DEBT_REASON_VIRTUAL_ID = -999001;
const TAKE_DEBT_REASON_LABEL = "Забрать долг";

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
  const editMatch = useMatch("/reports/:id/edit");
  const editReportId = editMatch?.params.id ? Number.parseInt(editMatch.params.id, 10) : NaN;
  const isEditMode = Number.isFinite(editReportId);

  const [me, setMe] = useState<{ id?: number; is_consultant?: boolean; is_admin?: boolean } | null>(null);
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
  const [vzyalaRows, setVzyalaRows] = useState<
    {
      order_number: string;
      amount: string;
      taken_reason_id: number | "";
      taken_source_id: number | "";
      order_percent: string;
      report_month: string;
      warehouse_id: number | "";
      linked_debt_row_uid: string;
      linked_debt_report_id: number | null;
    }[]
  >([]);
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
  const [availableDebtRows, setAvailableDebtRows] = useState<AvailableDebtRow[]>([]);
  const [availableDebtLoading, setAvailableDebtLoading] = useState(false);
  const [editReportUserId, setEditReportUserId] = useState<number | null>(null);
  const [hasExpenses, setHasExpenses] = useState(false);
  const [expenseRows, setExpenseRows] = useState<{ amount: string; expense_article_id: number | "" }[]>([
    { amount: "", expense_article_id: "" },
  ]);
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
  /** Актуальное «утро» для колбэка после getWarehouseLastOst (нельзя завязать эффект на utro — на мобильном каждый ввод перезапускал запрос и затирал поле) */
  const utroRef = useRef("");
  const numToStr = (v: number | null | undefined) => (v == null ? "" : String(v));
  utroRef.current = utro;

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
  const showReq = (key: string) => effectiveRequiredKeys.includes(key);
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
    if (me !== null && isEditMode && !me.is_admin) {
      navigate("/reports", { replace: true });
    }
  }, [me, isEditMode, navigate]);

  useEffect(() => {
    if (me === null) return;

    const applyLoadedReport = (draft: ReportItem, mapped: { id: number; last_name: string; first_name?: string | null; patronymic?: string | null }[]) => {
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
      if (vz.length > 0) {
        setVzyalaRows(
          vz.map((row) => ({
            order_number: (row.order_number ?? "").trim(),
            amount: row.amount != null ? String(row.amount) : "",
            taken_reason_id: row.taken_reason_id != null ? row.taken_reason_id : "",
            taken_source_id: row.taken_source_id != null ? row.taken_source_id : "",
            order_percent: row.order_percent != null ? String(row.order_percent) : "",
            report_month: (row.report_month ?? "").trim(),
            warehouse_id: row.warehouse_id != null && row.warehouse_id !== undefined ? row.warehouse_id : "",
            linked_debt_row_uid: (row.linked_debt_row_uid ?? "").trim(),
            linked_debt_report_id: row.linked_debt_report_id != null ? Number(row.linked_debt_report_id) : null,
          }))
        );
      } else {
        const amount = numToStr(draft.vzyala);
        setVzyalaRows(
          amount
            ? [{ order_number: "", amount, taken_reason_id: "", taken_source_id: "", order_percent: "", report_month: defaultReportMonth, warehouse_id: "", linked_debt_row_uid: "", linked_debt_report_id: null }]
            : []
        );
      }
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
      const ex = (draft.expenses ?? []) as { amount?: number; expense_article_id?: number }[];
      if (ex.length > 0) {
        setExpenseRows(
          ex.map((row) => ({
            amount: row.amount != null ? String(row.amount) : "",
            expense_article_id: typeof row.expense_article_id === "number" ? row.expense_article_id : "",
          }))
        );
      } else {
        setExpenseRows([{ amount: "", expense_article_id: "" }]);
      }
      setZReportFiles((draft.z_report_urls ?? []) as string[]);
      setCardFiles((draft.card_reconciliation_urls ?? []) as string[]);

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
          const draft = await api.reports.getDraft().catch((e) => {
            if (e instanceof Error && e.message === "DRAFT_NOT_FOUND") return null;
            return null;
          });

          draftLoadedRef.current = true;
          lastDraftUserIdRef.current = curUserId;
          if (draft) {
            applyLoadedReport(draft, mapped);
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
        if (applyingDraftRef.current) return;
        // В режиме редактирования «факт утро» только из загруженного отчёта, не подменяем last-ost (иначе затирается сохранённое значение).
        if (isEditMode) return;
        // Автоподстановка факта только если поле пустое или черновик ещё не подставляли.
        // utro читаем из ref: зависимость от utro в массиве deps вызывала повторный запрос на каждый
        // символ и ответ API затирал ввод (на мобильном заметнее из‑за задержки клавиатуры).
        if (!draftLoadedRef.current || utroRef.current.trim() === "") setUtro(ostStr);
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

  const filteredWarehouses = pointSearch.trim()
    ? warehouses.filter((w) => w.name.toLowerCase().includes(pointSearch.toLowerCase()))
    : warehouses;
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
    for (let i = 0; i < files.length; i++) {
      try {
        const url = await uploadReportFile(files[i]);
        setZReportFiles((prev) => [...prev, url]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ошибка загрузки файла";
        setUploadError(msg);
      }
    }
    setZReportUploading(false);
  };

  const handleCardAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const fileList = input.files;
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    input.value = "";
    setUploadError("");
    setCardUploading(true);
    for (let i = 0; i < files.length; i++) {
      try {
        const url = await uploadReportFile(files[i]);
        setCardFiles((prev) => [...prev, url]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ошибка загрузки файла";
        setUploadError(msg);
      }
    }
    setCardUploading(false);
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

  const getTakenRowVisibility = (reasonId: number | "") =>
    rowVisibilityByReasonName(
      (takenReasonOptions.find((x) => x.id === reasonId) ?? takenReasonOptionsForUi.find((x) => x.id === reasonId))?.name
    );
  const getDebtRowVisibility = (reasonId: number | "") =>
    rowVisibilityByReasonName(debtReasonOptions.find((x) => x.id === reasonId)?.name);
  const takenReasonOptionsForUi = useMemo(() => {
    const hasTakeDebt = takenReasonOptions.some((x) => {
      const n = (x.name ?? "").trim().toLowerCase();
      return n.includes("заб") && n.includes("долг");
    });
    if (hasTakeDebt) return takenReasonOptions;
    return [...takenReasonOptions, { id: TAKE_DEBT_REASON_VIRTUAL_ID, name: TAKE_DEBT_REASON_LABEL }];
  }, [takenReasonOptions]);
  const isTakeDebtReasonId = (reasonId: number | ""): boolean => {
    if (typeof reasonId !== "number") return false;
    const n = (takenReasonOptionsForUi.find((x) => x.id === reasonId)?.name ?? "").trim().toLowerCase();
    return n.includes("заб") && n.includes("долг");
  };

  const round2 = (n: number) => Math.round(n * 100) / 100;

  /** Остаток наличных: утро + наличные − возвраты наличными − инкассация наличными − расходы − «Взято» из кассы (справочник «Откуда взято» с подстрокой «из кассы» в названии). */
  const computedCashOst = useMemo(() => {
    const u = parseNum(utro) ?? 0;
    const n = parseNum(nal) ?? 0;
    const ret = hasReturns ? parseNum(returnNal) ?? 0 : 0;
    const enc = hasEncashment ? parseNum(encashmentNal) ?? 0 : 0;
    const expSum = hasExpenses ? expenseRows.reduce((s, r) => s + (parseNum(r.amount) ?? 0), 0) : 0;
    const vzCash = vzyalaRows.reduce((s, r) => {
      if (typeof r.taken_source_id !== "number") return s;
      const name = (takenSourceOptions.find((x) => x.id === r.taken_source_id)?.name ?? "").trim();
      if (!name || !/из\s*кассы/i.test(name)) return s;
      return s + (parseNum(r.amount) ?? 0);
    }, 0);
    return u + n - ret - enc - expSum - vzCash;
  }, [utro, nal, hasReturns, returnNal, hasEncashment, encashmentNal, hasExpenses, expenseRows, vzyalaRows, takenSourceOptions]);

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

  const vzyalaRowsSum = useMemo(() => {
    const amounts = vzyalaRows.map((r) => parseNum(r.amount)).filter((x): x is number => x != null);
    if (amounts.length === 0) return null;
    return amounts.reduce((a, b) => a + b, 0);
  }, [vzyalaRows]);

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
      .map((r) => {
        const ui = getTakenRowVisibility(r.taken_reason_id);
        return {
          order_number: ui.showOrder ? r.order_number.trim() : "",
          amount: parseNum(r.amount),
          taken_reason_id: typeof r.taken_reason_id === "number" ? r.taken_reason_id : null,
          taken_source_id: typeof r.taken_source_id === "number" ? r.taken_source_id : null,
          order_percent: ui.showOrderPercent ? parseNum(r.order_percent) ?? null : null,
          report_month:
            ui.dateFieldType === "month_list"
              ? normalizeReportMonth(r.report_month) || null
              : ui.dateFieldType === "date"
                ? normalizeReportDate(r.report_month) || null
                : null,
          warehouse_id: ui.showPoint && typeof r.warehouse_id === "number" ? r.warehouse_id : null,
          linked_debt_row_uid: r.linked_debt_row_uid.trim() || null,
          linked_debt_report_id: r.linked_debt_report_id,
        };
      })
      .filter(
        (r): r is {
          order_number: string;
          amount: number;
          taken_reason_id: number | null;
          taken_source_id: number | null;
          order_percent: number | null;
          report_month: string | null;
          warehouse_id: number | null;
          linked_debt_row_uid: string | null;
          linked_debt_report_id: number | null;
        } => r.amount != null
      );

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
    expenses: { amount: number; expense_article_id: number }[];
  } => {
    if (!hasExpenses) return { has_expenses: false, expenses: [] };
    const expenses = expenseRows
      .map((r) => ({
        amount: parseNum(r.amount),
        expense_article_id: typeof r.expense_article_id === "number" ? r.expense_article_id : undefined,
      }))
      .filter(
        (r): r is { amount: number; expense_article_id: number } =>
          r.amount != null && r.expense_article_id != null
      );
    return { has_expenses: true, expenses };
  };

  const utroShouldNum = parseNum(utroShould);
  const utroActualNum = parseNum(utro);
  const utroMismatch = utroShouldNum != null && utroActualNum != null && utroShouldNum !== utroActualNum;

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

  const validateTakeDebtRows = (): string | null => {
    for (let i = 0; i < vzyalaRows.length; i += 1) {
      const row = vzyalaRows[i]!;
      if (!isTakeDebtReasonId(row.taken_reason_id)) continue;
      if (!row.linked_debt_row_uid.trim()) {
        return `В строке «Взято» #${i + 1} выберите долг из предыдущих периодов.`;
      }
      const uid = row.linked_debt_row_uid.trim();
      const amt = parseNum(row.amount);
      if (amt == null || amt <= 0) {
        return `В строке «Взято» #${i + 1} укажите сумму зачёта долга (больше нуля).`;
      }
      const debt = availableDebtRows.find((d) => d.debt_row_uid === uid);
      if (debt != null && amt > debt.amount + 1e-4) {
        return `В строке «Взято» #${i + 1} по этому долгу сейчас можно зачесть не больше ${debt.amount.toFixed(2)} (остаток).`;
      }
    }
    return null;
  };

  const handleSaveDraft = async () => {
    if (isEditMode) return;
    setSubmitError("");
    setSavingDraft(true);
    try {
      const takeDebtErr = validateTakeDebtRows();
      if (takeDebtErr) {
        setSubmitError(takeDebtErr);
        return;
      }
      const returnsDetailsPayload = buildReturnsPayload();
      const vz = buildVzyalaPayload();
      const dz = buildDolgPayload();
      const ve = buildExpensePayload();

      await api.reports.create({
        is_draft: true,
        warehouse_id: pointId || undefined,
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
    const bnCard = parseNum(bnCardReconciliation);
    const bnZ = parseNum(bnZReport);
    if (bnCard !== undefined && bnZ !== undefined && bnCard !== bnZ) {
      setSubmitError("Сверьте суммы: «Безнал сверка итогов» и «безнал в Z-отчёте» должны совпадать. Если не совпадают — звоните Кириллу или Артуру.");
      return;
    }
    const takeDebtErr = validateTakeDebtRows();
    if (takeDebtErr) {
      setSubmitError(takeDebtErr);
      return;
    }
    const returnsDetailsPayload = buildReturnsPayload();
    const vz = buildVzyalaPayload();
    const dz = buildDolgPayload();
    const ve = buildExpensePayload();

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
      const vErr = validateReportRequiredFieldsClient(payload, reportRequiredKeys);
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
        navigate("/reports", { state: { reportUpdated: true } });
        return;
      }

      await api.reports.create({
        warehouse_id: pointId || undefined,
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
      navigate("/reports", { state: { reportSubmitted: true } });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Ошибка отправки");
    } finally {
      setLoading(false);
    }
  };

  if (me === null) {
    return (
      <div className="w-full px-4 sm:px-6 animate-slide-in flex items-center justify-center py-12" style={{ color: "var(--text-tertiary)" }}>
        Загрузка…
      </div>
    );
  }

  if (isEditMode) {
    if (!me.is_admin) return null;
    if (editLoading) {
      return (
        <div className="w-full px-4 sm:px-6 animate-slide-in flex items-center justify-center py-12" style={{ color: "var(--text-tertiary)" }}>
          Загрузка отчёта…
        </div>
      );
    }
    if (editLoadError) {
      return (
        <div className="w-full px-4 sm:px-6 animate-slide-in space-y-4">
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
    <div className="w-full px-4 sm:px-6 animate-slide-in">
      <nav className="flex items-center gap-2 text-sm mb-4" style={{ color: "var(--text-tertiary)" }}>
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

      <form onSubmit={handleSubmit} className="rounded-2xl p-4 sm:p-6 space-y-6" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        {submitError && (
          <div className="p-4 rounded-xl text-sm" style={{ backgroundColor: "var(--error-light)", color: "var(--error)", border: "1px solid var(--error)" }}>
            {submitError}
          </div>
        )}

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
            <input type="text" inputMode="decimal" value={revenue} onChange={(e) => setRevenue(e.target.value)} className="rounded-xl border w-full px-3 py-2" style={inputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Наличные{reqMark("nal")}
            </label>
            <input type="text" inputMode="decimal" value={nal} onChange={(e) => setNal(e.target.value)} className="rounded-xl border w-full px-3 py-2" style={inputStyle} />
          </div>
        </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Безнал сверка итогов{reqMark("bn_card_reconciliation")}
            </label>
            <input type="text" inputMode="decimal" value={bnCardReconciliation} onChange={(e) => setBnCardReconciliation(e.target.value)} className="rounded-xl border w-full px-3 py-2" style={inputStyle} placeholder="Сумма" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Безнал Z-отчёт{reqMark("bn_z_report")}
            </label>
            <input type="text" inputMode="decimal" value={bnZReport} onChange={(e) => setBnZReport(e.target.value)} className="rounded-xl border w-full px-3 py-2" style={inputStyle} placeholder="Сумма" />
          </div>
        </div>
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
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Выход{reqMark("vyhod")}
              </label>
              <input type="text" inputMode="decimal" value={vyhod} onChange={(e) => setVyhod(e.target.value)} className="rounded-xl border w-full px-3 py-2" style={inputStyle} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Процент{reqMark("percent")}
              </label>
              <input type="text" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} className="rounded-xl border w-full px-3 py-2" style={inputStyle} placeholder="0" />
            </div>
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
          </div>

          {vzyalaDetailMode && (
            <div
              className="rounded-xl p-4 space-y-3 transition-colors duration-200"
              style={{ background: "var(--accent-light)", border: "1px solid var(--accent)" }}
            >
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Блок «Взято»
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setVzyalaRows((prev) => [...prev, { order_number: "", amount: "", taken_reason_id: "", taken_source_id: "", order_percent: "", report_month: defaultReportMonth, warehouse_id: "", linked_debt_row_uid: "", linked_debt_report_id: null }])
                  }
                  className="text-sm font-medium px-3 py-1.5 rounded-lg"
                  style={{ color: "var(--accent)", background: "var(--bg-primary)" }}
                >
                  + Ещё строка
                </button>
              </div>
              {vzyalaRows.map((row, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-3 p-3 rounded-xl"
                  style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
                >
                  {(() => {
                    const ui = getTakenRowVisibility(row.taken_reason_id);
                    const reasonSelected = typeof row.taken_reason_id === "number";
                    const takeDebtReasonSelected = isTakeDebtReasonId(row.taken_reason_id);
                    const selectedDebtUids = new Set(
                      vzyalaRows
                        .map((r, idx) => (idx === i ? "" : (r.linked_debt_row_uid ?? "").trim()))
                        .filter(Boolean)
                    );
                    const debtOptions = availableDebtRows.filter(
                      (d) => !selectedDebtUids.has(d.debt_row_uid) || d.debt_row_uid === row.linked_debt_row_uid
                    );
                    return (
                      <>
                  <div className="flex-[1.3] min-w-[180px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>За что взято</label>
                    <select
                      value={row.taken_reason_id === "" ? "" : String(row.taken_reason_id)}
                      onChange={(e) => {
                        const v = e.target.value;
                        const nextReasonId = v === "" ? "" : Number.parseInt(v, 10);
                        const nextReasonName =
                          typeof nextReasonId === "number"
                            ? takenReasonOptionsForUi.find((tr) => tr.id === nextReasonId)?.name
                            : "";
                        const nextUi = rowVisibilityByReasonName(nextReasonName);
                        const nextIsTakeDebt =
                          (nextReasonName ?? "").trim().toLowerCase().includes("забрать") &&
                          (nextReasonName ?? "").trim().toLowerCase().includes("долг");
                        setVzyalaRows((prev) =>
                          prev.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  taken_reason_id: nextReasonId,
                                  report_month:
                                    nextUi.dateFieldType === "month_list"
                                      ? normalizeReportMonth(x.report_month) || defaultReportMonth
                                      : nextUi.dateFieldType === "date"
                                        ? normalizeReportDate(x.report_month) || defaultReportDate
                                        : "",
                                  linked_debt_row_uid: nextIsTakeDebt ? x.linked_debt_row_uid : "",
                                  linked_debt_report_id: nextIsTakeDebt ? x.linked_debt_report_id : null,
                                }
                              : x
                          )
                        );
                      }}
                      className="rounded-xl border w-full px-3 py-2 text-sm"
                      style={{ ...inputStyle, appearance: "auto" }}
                    >
                      <option value="">Выберите из справочника</option>
                      {takenReasonOptionsForUi.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {reasonSelected && <div className="flex-[1.3] min-w-[180px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>Откуда взято</label>
                    <select
                      value={row.taken_source_id === "" ? "" : String(row.taken_source_id)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setVzyalaRows((prev) =>
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
                  </div>}
                  {reasonSelected && takeDebtReasonSelected && <div className="flex-[2] min-w-[240px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>Забрать долг из периода</label>
                    <select
                      value={row.linked_debt_row_uid}
                      onChange={(e) => {
                        const uid = e.target.value;
                        const selected = debtOptions.find((d) => d.debt_row_uid === uid);
                        setVzyalaRows((prev) =>
                          prev.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  linked_debt_row_uid: uid,
                                  linked_debt_report_id: selected?.report_id ?? null,
                                  amount: selected ? String(selected.amount) : "",
                                  order_number: selected?.order_number ?? x.order_number,
                                  warehouse_id:
                                    typeof selected?.warehouse_id === "number" ? selected.warehouse_id : x.warehouse_id,
                                  report_month: selected?.report_month ?? x.report_month,
                                }
                              : x
                          )
                        );
                      }}
                      className="rounded-xl border w-full px-3 py-2 text-sm"
                      style={{ ...inputStyle, appearance: "auto" }}
                    >
                      <option value="">{availableDebtLoading ? "Загрузка..." : "Выберите долг"}</option>
                      {debtOptions.map((d) => (
                        <option key={d.debt_row_uid} value={d.debt_row_uid}>
                          {`#${d.report_id} · остаток ${d.amount} · ${d.warehouse_name ?? "Без точки"} · ${d.report_month ?? "без даты"}`}
                        </option>
                      ))}
                    </select>
                  </div>}
                  {ui.showOrder && <div className="flex-1 min-w-[120px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>Заказ</label>
                    <input
                      type="text"
                      value={row.order_number}
                      onChange={(e) =>
                        setVzyalaRows((prev) => prev.map((x, j) => (j === i ? { ...x, order_number: e.target.value } : x)))
                      }
                      className="rounded-xl border w-full px-3 py-2 text-sm"
                      style={inputStyle}
                      placeholder="№ заказа"
                    />
                  </div>}
                  {reasonSelected && <div className="flex-1 min-w-[100px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>{ui.showOrder ? "Взято с заказа" : "Сумма"}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(e) =>
                        setVzyalaRows((prev) => prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                      }
                      className="rounded-xl border w-full px-3 py-2 text-sm tabular-nums"
                      style={inputStyle}
                      placeholder="0"
                    />
                    {takeDebtReasonSelected && (
                      <span className="block text-[11px] mt-1 leading-snug" style={{ color: "var(--text-tertiary)" }}>
                        Можно меньше остатка — частичное погашение; незачтённая сумма останется в списке долгов.
                      </span>
                    )}
                  </div>}
                  {ui.showOrderPercent && <div className="flex-1 min-w-[120px]">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>Процент от заказа</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.order_percent}
                      onChange={(e) =>
                        setVzyalaRows((prev) => prev.map((x, j) => (j === i ? { ...x, order_percent: e.target.value } : x)))
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
                          setVzyalaRows((prev) => prev.map((x, j) => (j === i ? { ...x, report_month: e.target.value } : x)))
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
                          setVzyalaRows((prev) => prev.map((x, j) => (j === i ? { ...x, report_month: e.target.value } : x)))
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
                        setVzyalaRows((prev) =>
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
                    onClick={() => setVzyalaRows((prev) => prev.filter((_, j) => j !== i))}
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
                  Итого: {vzyalaRowsSum != null ? vzyalaRowsSum : "—"}
                </span>
              </div>
            </div>
          )}
          {dolgDetailMode && (
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
                  setExpenseRows([{ amount: "", expense_article_id: "" }]);
                  return false;
                }
                setExpenseRows((rows) =>
                  rows.length === 0 ? [{ amount: "", expense_article_id: "" }] : rows
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
                Статьи расходов задаются в{" "}
                <Link to="/settings/references/expense-articles" className="underline font-medium" style={{ color: "var(--accent)" }}>
                  Справочники → Статьи расходов
                </Link>
                .
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setExpenseRows((prev) => [...prev, { amount: "", expense_article_id: "" }])}
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
              Утро + наличные − возвраты наличными − инкассация наличными − расходы − суммы строк «Взято», где в «Откуда взято» выбран пункт с названием «из кассы».
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

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          {!isEditMode && (
            <button
              type="button"
              disabled={loading || savingDraft || !pointId}
              onClick={handleSaveDraft}
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold disabled:opacity-50"
              style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              {savingDraft ? "Сохранение…" : "Сохранить"}
            </button>
          )}
          <button type="submit" disabled={loading || savingDraft || !pointId} className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
            {loading ? (isEditMode ? "Сохранение…" : "Отправка…") : isEditMode ? "Сохранить изменения" : "Отправить отчёт"}
          </button>
        </div>
      </form>
    </div>
  );
}
