import { useEffect, useMemo, useRef, useState } from "react";
import { api, type UserItem, type WarehouseItem, type WorkScheduleDraftItem, type WorkScheduleMyConfirmation } from "../api";
import { useAuth } from "../contexts/AuthContext";
import {
  applyWeeksToLocalStorage,
  buildMoscowWeekDays,
  copyWeekScheduleToWeek,
  gatherWeeksFromLocalStorage,
  getWeekOverridesFromStorage,
  mondayOfWeekContaining,
} from "../utils/workScheduleStorage";

type Mode = "consultant" | "admin";

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/\s+/g, " ")
    .trim();

/** Несколько консультантов в одной ячейке (один день + точка) — строки через перенос. */
function parseCellConsultants(raw: string): string[] {
  if (!raw || raw === "—") return [];
  return raw
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s && s !== "—");
}

function formatCellConsultants(names: string[]): string {
  const cleaned = names.map((n) => n.trim()).filter((n) => n && n !== "—");
  return cleaned.length === 0 ? "—" : cleaned.join("\n");
}

/** Как подпись под логином в /settings/users: «имя фамилия»; если пусто — логин. */
function fioLikeSettingsUsers(u: { first_name?: string | null; last_name?: string | null; username?: string | null }) {
  const s = `${(u.first_name || "").trim()} ${(u.last_name || "").trim()}`.trim();
  return s || (u.username || "").trim();
}

const displayNameFromUser = (u: { first_name?: string | null; last_name?: string | null; username?: string | null }) => {
  const first = (u.first_name || "").trim();
  const last = (u.last_name || "").trim();
  if (last || first) {
    const initial = first ? ` ${first[0]}.` : "";
    return `${last}${initial}`.trim();
  }
  return (u.username || "").trim();
};

export default function WorkScheduleBoard({
  mode,
  reloadKey = 0,
  initialWeekMonday = null,
  onPublishedChange,
}: {
  mode: Mode;
  /** Увеличьте после загрузки черновика в localStorage, чтобы перечитать текущую неделю */
  reloadKey?: number;
  /** Понедельник YYYY-MM-DD из URL — открыть эту неделю в редакторе */
  initialWeekMonday?: string | null;
  /** После успешной публикации (список опубликованных недель на странице управления) */
  onPublishedChange?: () => void;
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [consultants, setConsultants] = useState<string[]>([]);
  const [baseDate, setBaseDate] = useState(new Date());
  /** null — до первой загрузки списка; "" — пользователь очистил поле сотрудника. */
  const [selectedConsultant, setSelectedConsultant] = useState<string | null>(null);
  const [consultantSearchText, setConsultantSearchText] = useState("");
  const [consultantDropdownOpen, setConsultantDropdownOpen] = useState(false);
  const consultantPickerRef = useRef<HTMLDivElement | null>(null);
  /** Точка для верхнего блока «график на неделю» (админ). null — ещё не инициализировали; "" — пользователь очистил поле. */
  const [summaryPoint, setSummaryPoint] = useState<string | null>(null);
  const [pointSearchText, setPointSearchText] = useState("");
  const [pointDropdownOpen, setPointDropdownOpen] = useState(false);
  const pointPickerRef = useRef<HTMLDivElement | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [publishedWeeks, setPublishedWeeks] = useState<Record<string, Record<string, string>>>({});
  const [draftReloadToken, setDraftReloadToken] = useState(0);
  const [drafts, setDrafts] = useState<WorkScheduleDraftItem[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState<number | "">("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminMessage, setAdminMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [myConfirmation, setMyConfirmation] = useState<WorkScheduleMyConfirmation | null>(null);
  const [myConfLoading, setMyConfLoading] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmErr, setConfirmErr] = useState("");
  const [copyFromWeekDate, setCopyFromWeekDate] = useState("");
  const [addSecondMode, setAddSecondMode] = useState(false);

  useEffect(() => {
    if (!initialWeekMonday || !/^\d{4}-\d{2}-\d{2}$/.test(initialWeekMonday.trim())) return;
    const d = new Date(initialWeekMonday.trim() + "T12:00:00Z");
    if (Number.isNaN(d.getTime())) return;
    setBaseDate(d);
  }, [initialWeekMonday]);

  useEffect(() => {
    if (mode !== "consultant") return;
    let cancelled = false;
    api.workSchedule
      .getPublished()
      .then((data) => {
        if (!cancelled) setPublishedWeeks(data.weeks ?? {});
      })
      .catch(() => {
        if (!cancelled) setPublishedWeeks({});
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "admin") return;
    let cancelled = false;
    setDraftsLoading(true);
    api.workSchedule
      .listDrafts()
      .then((list) => {
        if (!cancelled) setDrafts(list);
      })
      .catch(() => {
        if (!cancelled) setDrafts([]);
      })
      .finally(() => {
        if (!cancelled) setDraftsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    const loadPromise =
      mode === "admin"
        ? Promise.allSettled([api.ref.warehouses.list(), api.getUsers()])
        : Promise.allSettled([api.ref.warehouses.list(), api.reports.consultants()]);

    loadPromise
      .then((results) => {
        if (!mounted) return;
        const [warehousesResult, secondResult] = results;

        const loadedWarehouses = warehousesResult.status === "fulfilled" ? warehousesResult.value : [];
        setWarehouses(loadedWarehouses);

        let merged: string[] = [];

        if (mode === "admin") {
          const users = secondResult.status === "fulfilled" ? (secondResult.value as UserItem[]) : [];
          const byUsers = users.map((u) => fioLikeSettingsUsers(u)).map((x) => x.trim()).filter(Boolean);
          merged = [...new Set(byUsers)].sort((a, b) => a.localeCompare(b, "ru"));
        } else {
          const byReports =
            secondResult.status === "fulfilled"
              ? secondResult.value
                  .map((x) => (x.last_name || "").trim())
                  .filter(Boolean)
              : [];
          merged = [...new Set(byReports)].sort((a, b) => a.localeCompare(b, "ru"));
        }

        setConsultants(merged);
        setSelectedConsultant((prev) => {
          if (prev === "") return "";
          if (prev && merged.includes(prev)) return prev;
          return merged.length > 0 ? merged[0] : prev;
        });
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [mode]);

  const weekDays = useMemo(() => buildMoscowWeekDays(baseDate), [baseDate]);
  const weekStartKey = weekDays[0]?.key ?? "";

  useEffect(() => {
    if (mode !== "consultant" || !weekStartKey || !user?.is_consultant) {
      setMyConfirmation(null);
      return;
    }
    let cancelled = false;
    setMyConfLoading(true);
    setConfirmErr("");
    api.workSchedule
      .getMyConfirmation(weekStartKey)
      .then((d) => {
        if (!cancelled) setMyConfirmation(d);
      })
      .catch(() => {
        if (!cancelled) setMyConfirmation(null);
      })
      .finally(() => {
        if (!cancelled) setMyConfLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, weekStartKey, user?.is_consultant]);

  const points = useMemo(() => {
    return warehouses.map((w) => w.name).filter(Boolean);
  }, [warehouses]);

  const filteredPointsForPicker = useMemo(() => {
    const q = normalizeText(pointSearchText);
    if (!q) return points;
    return points.filter((p) => normalizeText(p).includes(q));
  }, [points, pointSearchText]);

  const filteredConsultantsForPicker = useMemo(() => {
    const q = normalizeText(consultantSearchText);
    if (!q) return consultants;
    return consultants.filter((c) => normalizeText(c).includes(q));
  }, [consultants, consultantSearchText]);

  useEffect(() => {
    if (mode !== "admin" || points.length === 0) return;
    setSummaryPoint((prev) => {
      if (prev === "") return "";
      if (prev && points.includes(prev)) return prev;
      return points[0];
    });
  }, [mode, points]);

  useEffect(() => {
    if (mode !== "admin") return;
    if (summaryPoint === "") {
      setPointSearchText("");
      return;
    }
    if (summaryPoint && points.includes(summaryPoint)) {
      setPointSearchText(summaryPoint);
    }
  }, [mode, summaryPoint, points]);

  useEffect(() => {
    if (mode !== "admin") return;
    if (selectedConsultant === "") {
      setConsultantSearchText("");
      return;
    }
    if (selectedConsultant && consultants.includes(selectedConsultant)) {
      setConsultantSearchText(selectedConsultant);
    }
  }, [mode, selectedConsultant, consultants]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = pointPickerRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setPointDropdownOpen(false);
      if (mode === "admin" && summaryPoint) setPointSearchText(summaryPoint);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [mode, summaryPoint]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = consultantPickerRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setConsultantDropdownOpen(false);
      if (mode === "admin" && selectedConsultant && consultants.includes(selectedConsultant)) {
        setConsultantSearchText(selectedConsultant);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [mode, selectedConsultant, consultants]);

  /** На главной показываем только опубликованные ячейки, без демо-сетки. */
  const emptyShiftByPointAndDay = useMemo(() => {
    const map = new Map<string, string>();
    points.forEach((point) => {
      weekDays.forEach((day) => {
        map.set(`${point}|${day.key}`, "—");
      });
    });
    return map;
  }, [points, weekDays]);

  useEffect(() => {
    if (mode !== "admin" || !weekStartKey) return;
    try {
      const raw = localStorage.getItem(`work_schedule_overrides_${weekStartKey}`);
      if (!raw) {
        setOverrides({});
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, string>;
      setOverrides(parsed && typeof parsed === "object" ? parsed : {});
    } catch {
      setOverrides({});
    }
  }, [mode, weekStartKey, reloadKey, draftReloadToken]);

  useEffect(() => {
    if (mode !== "consultant" || !weekStartKey) return;
    const w = publishedWeeks[weekStartKey];
    setOverrides(w && typeof w === "object" ? { ...w } : {});
  }, [mode, weekStartKey, publishedWeeks]);

  useEffect(() => {
    if (mode !== "admin" || !weekStartKey) return;
    try {
      localStorage.setItem(`work_schedule_overrides_${weekStartKey}`, JSON.stringify(overrides));
    } catch {
      // ignore localStorage errors
    }
  }, [mode, overrides, weekStartKey]);

  /** База — пустые ячейки; админ: localStorage по неделе, консультант: опубликованный график. */
  const effectiveShiftByPointAndDay = useMemo(() => {
    const map = new Map(emptyShiftByPointAndDay);
    Object.entries(overrides).forEach(([key, value]) => {
      map.set(key, value);
    });
    return map;
  }, [overrides, emptyShiftByPointAndDay]);

  const currentUserDisplay = useMemo(() => {
    const fromProfile = displayNameFromUser(user ?? {});
    if (fromProfile) return fromProfile;
    return (user?.username || "").trim();
  }, [user]);

  const activeConsultant = useMemo(() => {
    if (mode === "admin") {
      if (selectedConsultant === "") return "";
      if (selectedConsultant && consultants.includes(selectedConsultant)) return selectedConsultant;
      return consultants[0] || "";
    }
    // Консультант на главной определяется по текущему пользователю.
    // В опубликованном графике в ячейках обычно хранится строка из админского списка (например «Елена Конькова»),
    // поэтому используем ФИО из профиля, а не список фамилий из отчётов.
    const fio = fioLikeSettingsUsers(user ?? {});
    if (fio) return fio;
    return currentUserDisplay;
  }, [consultants, currentUserDisplay, mode, selectedConsultant, user]);

  const matchesCurrentConsultant = useMemo(() => {
    if (mode !== "consultant") return (cellValue: string) => cellValue === activeConsultant;
    const profile = (user ?? {}) as unknown as {
      first_name?: string | null;
      last_name?: string | null;
      username?: string | null;
    };
    const meFio = fioLikeSettingsUsers(profile);
    const meLast = (profile.last_name || "").trim();
    const meUser = (profile.username || "").trim();
    const candidatesRaw = [activeConsultant, meFio, currentUserDisplay, meUser, meLast].map((x) => (x || "").trim()).filter(Boolean);
    const candidates = [...new Set(candidatesRaw.map((x) => normalizeText(x)))].filter(Boolean);
    const lastNorm = meLast ? normalizeText(meLast) : "";
    return (cellValue: string) => {
      const segments = parseCellConsultants(cellValue);
      const toCheck =
        segments.length > 0 ? segments : cellValue && cellValue !== "—" ? [cellValue.trim()] : [];
      for (const part of toCheck) {
        const v = normalizeText(part);
        if (!v) continue;
        if (candidates.includes(v)) return true;
        if (lastNorm && v.includes(lastNorm)) return true;
      }
      return false;
    };
  }, [activeConsultant, currentUserDisplay, mode, user]);

  const consultantWeek = useMemo(() => {
    if (!activeConsultant) return [];
    return weekDays.map((day) => {
      const atPoint =
        points.find((p) => matchesCurrentConsultant(effectiveShiftByPointAndDay.get(`${p}|${day.key}`) ?? "")) ?? "Выходной";
      return { day: day.label, point: atPoint };
    });
  }, [activeConsultant, effectiveShiftByPointAndDay, matchesCurrentConsultant, points, weekDays]);

  /** Неделя по выбранной точке: в каждом дне — консультант на этой точке */
  const pointWeek = useMemo(() => {
    if (!summaryPoint) return [];
    return weekDays.map((day) => ({
      dayKey: day.key,
      day: day.label,
      consultant: effectiveShiftByPointAndDay.get(`${summaryPoint}|${day.key}`) ?? "—",
    }));
  }, [summaryPoint, weekDays, effectiveShiftByPointAndDay]);

  const worksAtMultiplePoints = useMemo(
    () => new Set(consultantWeek.filter((x) => x.point !== "Выходной").map((x) => x.point)).size > 1,
    [consultantWeek]
  );

  const mergeWeeksForServer = () => {
    const weeks = gatherWeeksFromLocalStorage();
    if (weekStartKey) {
      weeks[weekStartKey] = { ...(weeks[weekStartKey] ?? {}), ...overrides };
    }
    return weeks;
  };

  const currentWeekForServer = () => {
    if (!weekStartKey) return {};
    return { [weekStartKey]: { ...overrides } };
  };

  const handleImportPublished = async () => {
    setAdminMessage(null);
    setAdminBusy(true);
    try {
      const data = await api.workSchedule.getPublished();
      applyWeeksToLocalStorage(data.weeks ?? {});
      setDraftReloadToken((k) => k + 1);
      setAdminMessage({ type: "ok", text: "Опубликованный график загружен в редактор." });
    } catch (e) {
      setAdminMessage({ type: "err", text: e instanceof Error ? e.message : "Не удалось загрузить" });
    } finally {
      setAdminBusy(false);
    }
  };

  const handlePublishCurrentWeek = async () => {
    if (!weekStartKey) return;
    const ok = window.confirm(
      "Опубликовать текущую открытую неделю? Её увидят сотрудники на главной странице."
    );
    if (!ok) return;
    setAdminMessage(null);
    setAdminBusy(true);
    try {
      await api.workSchedule.publish({ weeks: currentWeekForServer() });
      setAdminMessage({ type: "ok", text: "График опубликован." });
      onPublishedChange?.();
    } catch (e) {
      setAdminMessage({ type: "err", text: e instanceof Error ? e.message : "Ошибка публикации" });
    } finally {
      setAdminBusy(false);
    }
  };

  const handlePublishAllLocalWeeks = async () => {
    const ok = window.confirm(
      "Опубликовать ВСЕ недели, которые сохранены в этом браузере? Это может быть много недель."
    );
    if (!ok) return;
    setAdminMessage(null);
    setAdminBusy(true);
    try {
      const weeks = mergeWeeksForServer();
      await api.workSchedule.publish({ weeks });
      setAdminMessage({ type: "ok", text: "График опубликован (все недели из браузера)." });
      onPublishedChange?.();
    } catch (e) {
      setAdminMessage({ type: "err", text: e instanceof Error ? e.message : "Ошибка публикации" });
    } finally {
      setAdminBusy(false);
    }
  };

  const handleLoadDraft = async (id: number) => {
    setAdminMessage(null);
    setAdminBusy(true);
    try {
      const d = await api.workSchedule.getDraft(id);
      const pl = d.payload as { weeks?: Record<string, Record<string, string>> } | null;
      const weeks = pl?.weeks ?? {};
      applyWeeksToLocalStorage(weeks);
      setSelectedDraftId(id);
      setDraftReloadToken((k) => k + 1);
      setAdminMessage({ type: "ok", text: `Черновик «${d.name}» открыт.` });
    } catch (e) {
      setAdminMessage({ type: "err", text: e instanceof Error ? e.message : "Не удалось открыть черновик" });
    } finally {
      setAdminBusy(false);
    }
  };

  const handleSaveDraft = async () => {
    const defaultName =
      selectedDraftId && typeof selectedDraftId === "number"
        ? drafts.find((x) => x.id === selectedDraftId)?.name ?? "Черновик"
        : "Черновик";
    const name = window.prompt("Название черновика", defaultName);
    if (name === null) return;
    const trimmed = name.trim() || "Черновик";
    setAdminMessage(null);
    setAdminBusy(true);
    try {
      const weeks = mergeWeeksForServer();
      if (selectedDraftId && typeof selectedDraftId === "number") {
        await api.workSchedule.updateDraft(selectedDraftId, { name: trimmed, payload: { weeks } });
        setAdminMessage({ type: "ok", text: "Черновик сохранён." });
      } else {
        const created = await api.workSchedule.createDraft({ name: trimmed, payload: { weeks } });
        setSelectedDraftId(created.id);
        setAdminMessage({ type: "ok", text: "Черновик создан." });
      }
      setDrafts(await api.workSchedule.listDrafts());
    } catch (e) {
      setAdminMessage({ type: "err", text: e instanceof Error ? e.message : "Ошибка сохранения" });
    } finally {
      setAdminBusy(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!selectedDraftId || typeof selectedDraftId !== "number") {
      setAdminMessage({ type: "err", text: "Выберите черновик в списке." });
      return;
    }
    if (!window.confirm("Удалить этот черновик?")) return;
    setAdminMessage(null);
    setAdminBusy(true);
    try {
      await api.workSchedule.deleteDraft(selectedDraftId);
      setSelectedDraftId("");
      setDrafts(await api.workSchedule.listDrafts());
      setAdminMessage({ type: "ok", text: "Черновик удалён." });
    } catch (e) {
      setAdminMessage({ type: "err", text: e instanceof Error ? e.message : "Не удалось удалить" });
    } finally {
      setAdminBusy(false);
    }
  };

  const handleConfirmSchedule = async () => {
    if (!weekStartKey || !user?.is_consultant) return;
    setConfirmErr("");
    setConfirmBusy(true);
    try {
      const r = await api.workSchedule.confirmSchedule(weekStartKey);
      setMyConfirmation(r);
    } catch (e) {
      setConfirmErr(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleCopyFromPreviousWeek = () => {
    if (!weekStartKey) return;
    const d = new Date(weekStartKey + "T12:00:00");
    d.setDate(d.getDate() - 7);
    const prevMonday = d.toISOString().slice(0, 10);
    const existing = getWeekOverridesFromStorage(prevMonday);
    if (Object.keys(existing).length === 0) {
      window.alert(
        "В этом браузере нет сохранённого графика за прошлую неделю. Сначала откройте и заполните прошлую неделю."
      );
      return;
    }
    if (!window.confirm("Заменить график текущей недели копией с прошлой недели?")) return;
    const mapped = copyWeekScheduleToWeek(prevMonday, weekStartKey);
    setOverrides(mapped);
    setDraftReloadToken((k) => k + 1);
  };

  const handleCopyToNextWeek = () => {
    if (!weekStartKey) return;
    const d = new Date(weekStartKey + "T12:00:00");
    d.setDate(d.getDate() + 7);
    const nextMonday = d.toISOString().slice(0, 10);
    const merged = { ...getWeekOverridesFromStorage(weekStartKey), ...overrides };
    if (Object.keys(merged).length === 0) {
      window.alert("Текущая неделя пуста — нечего копировать.");
      return;
    }
    copyWeekScheduleToWeek(weekStartKey, nextMonday, merged);
    window.alert(
      `График скопирован на неделю с ${new Date(nextMonday + "T12:00:00").toLocaleDateString("ru-RU")}. Нажмите «Следующая неделя», чтобы открыть и при необходимости изменить.`
    );
  };

  const handleCopyFromSelectedWeek = () => {
    if (!weekStartKey || !copyFromWeekDate) {
      window.alert("Выберите дату недели-источника.");
      return;
    }
    const sourceMonday = mondayOfWeekContaining(copyFromWeekDate);
    if (sourceMonday === weekStartKey) {
      window.alert("Выберите другую неделю — источник совпадает с текущей.");
      return;
    }
    const existing = getWeekOverridesFromStorage(sourceMonday);
    if (Object.keys(existing).length === 0) {
      window.alert("Нет сохранённого графика за выбранную неделю в этом браузере.");
      return;
    }
    if (
      !window.confirm(
        `Подставить в текущую неделю график с недели ${new Date(sourceMonday + "T12:00:00").toLocaleDateString("ru-RU")} (пн.)?`
      )
    )
      return;
    const mapped = copyWeekScheduleToWeek(sourceMonday, weekStartKey);
    setOverrides(mapped);
    setDraftReloadToken((k) => k + 1);
  };

  if (loading) {
    return <div style={{ color: "var(--text-secondary)" }}>Загрузка графика...</div>;
  }

  /**
   * Назначить сотрудника в ячейку (замена). Один консультант не может быть в двух точках в один день —
   * с других точек в этот день он снимается.
   */
  const assignConsultantToCellWithUniqueRule = (next: Record<string, string>, point: string, dayKey: string, consultant: string) => {
    const targetKey = `${point}|${dayKey}`;
    if (consultant === "—") {
      next[targetKey] = "—";
      return;
    }
    for (const p of points) {
      const k = `${p}|${dayKey}`;
      if (k === targetKey) continue;
      const list = parseCellConsultants(next[k] ?? "—");
      const filtered = list.filter((n) => n !== consultant);
      next[k] = formatCellConsultants(filtered);
    }
    next[targetKey] = consultant;
  };

  /**
   * Добавить второго сотрудника в ячейку (по отдельному режиму). Правило уникальности по дню сохраняется.
   */
  const addSecondConsultantToCellWithUniqueRule = (next: Record<string, string>, point: string, dayKey: string, consultant: string) => {
    const targetKey = `${point}|${dayKey}`;
    if (consultant === "—") {
      next[targetKey] = "—";
      return;
    }
    for (const p of points) {
      const k = `${p}|${dayKey}`;
      if (k === targetKey) continue;
      const list = parseCellConsultants(next[k] ?? "—");
      const filtered = list.filter((n) => n !== consultant);
      next[k] = formatCellConsultants(filtered);
    }
    const targetList = parseCellConsultants(next[targetKey] ?? "—");
    if (!targetList.includes(consultant)) targetList.push(consultant);
    next[targetKey] = formatCellConsultants(targetList);
  };

  const clearWholeWeek = () => {
    if (mode !== "admin") return;
    const ok = window.confirm("Обнулить неделю? Все точки на все дни будут выставлены как выходной.");
    if (!ok) return;
    setOverrides(() => {
      const next: Record<string, string> = {};
      points.forEach((point) => {
        weekDays.forEach((day) => {
          next[`${point}|${day.key}`] = "—";
        });
      });
      return next;
    });
  };

  const onCellClick = (point: string, dayKey: string) => {
    if (mode !== "admin" || !activeConsultant) return;
    setOverrides((prev) => {
      const next = { ...prev };
      if (addSecondMode) {
        addSecondConsultantToCellWithUniqueRule(next, point, dayKey, activeConsultant);
      } else {
        assignConsultantToCellWithUniqueRule(next, point, dayKey, activeConsultant);
      }
      return next;
    });
  };

  const onCellRemoveClick = (point: string, dayKey: string) => {
    if (mode !== "admin") return;
    setOverrides((prev) => {
      const next = { ...prev };
      const key = `${point}|${dayKey}`;
      const current = next[key] ?? "—";
      const names = parseCellConsultants(current);
      if (names.length === 0) {
        next[key] = "—";
        return next;
      }
      if (activeConsultant && names.includes(activeConsultant)) {
        next[key] = formatCellConsultants(names.filter((n) => n !== activeConsultant));
        return next;
      }
      next[key] = "—";
      return next;
    });
  };

  const consultantNoPublishedWeek =
    mode === "consultant" && Boolean(weekStartKey) && publishedWeeks[weekStartKey] === undefined;

  /** Админ: на этой неделе нет ни одной назначенной смены (только «—»). */
  const adminScheduleEmpty =
    mode === "admin" &&
    Boolean(weekStartKey) &&
    [...effectiveShiftByPointAndDay.values()].every((v) => !v || v === "—");

  return (
    <div
      className="p-4 sm:p-6 rounded-lg min-w-0"
      style={{
        backgroundColor: "var(--bg-primary)",
        border: `1px solid ${worksAtMultiplePoints ? "var(--accent)" : "var(--border)"}`,
      }}
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            График работы (точки и консультанты из справочников)
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              График на неделю
            </div>
            {mode === "admin" && (
              <button
                type="button"
                onClick={clearWholeWeek}
                className="px-3 py-2 rounded-lg text-sm font-semibold shrink-0"
                style={{ background: "#de350b", border: "1px solid #de350b", color: "#fff" }}
              >
                Обнулить неделю
              </button>
            )}
          </div>
        </div>
        {worksAtMultiplePoints && (
          <span className="px-3 py-1 rounded-full text-xs font-semibold w-fit" style={{ backgroundColor: "var(--accent-light)", color: "var(--accent)" }}>
            Работа на разных точках
          </span>
        )}
      </div>

      {mode === "admin" && (
        <div className="mb-4 p-4 rounded-xl border space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Черновики и публикация
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Правки по неделям хранятся в браузере. Кнопка «Опубликовать» записывает их на сервер — такой график виден на главной. Сначала можно подгрузить текущий опубликованный вариант или открыть черновик.
          </p>
          {adminMessage && (
            <p
              className="text-sm rounded-lg px-3 py-2"
              style={{
                background: adminMessage.type === "ok" ? "var(--accent-light, #dbeafe)" : "var(--error-light,#fee2e2)",
                color: adminMessage.type === "ok" ? "var(--accent)" : "var(--error,#b91c1c)",
              }}
            >
              {adminMessage.text}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={adminBusy}
              onClick={handleImportPublished}
              className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            >
              Подгрузить опубликованный
            </button>
            <button
              type="button"
              disabled={adminBusy}
              onClick={handlePublishCurrentWeek}
              className="px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--accent)", border: "1px solid var(--accent)", color: "#fff" }}
            >
              Опубликовать неделю
            </button>
            <button
              type="button"
              disabled={adminBusy}
              onClick={handlePublishAllLocalWeeks}
              className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              title="Опубликовать все недели, которые сохранены в этом браузере (localStorage)"
            >
              Опубликовать всё (из браузера)
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Черновик
              </label>
              <select
                value={selectedDraftId === "" ? "" : String(selectedDraftId)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    setSelectedDraftId("");
                    return;
                  }
                  void handleLoadDraft(Number(v));
                }}
                disabled={adminBusy || draftsLoading}
                className="min-w-[200px] px-3 py-2 rounded-lg text-sm border disabled:opacity-50"
                style={{ background: "var(--bg-primary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                <option value="">{draftsLoading ? "Загрузка…" : "Выберите черновик…"}</option>
                {drafts.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={adminBusy}
              onClick={() => void handleSaveDraft()}
              className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            >
              Сохранить черновик
            </button>
            <button
              type="button"
              disabled={adminBusy}
              onClick={() => void handleDeleteDraft()}
              className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" }}
            >
              Удалить черновик
            </button>
          </div>
        </div>
      )}

      {mode === "admin" && points.length > 0 && (
        <div ref={pointPickerRef} className="relative mb-4 w-full max-w-lg">
          <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
            Точка для просмотра графика
          </label>
          <div className="relative">
            <input
              type="text"
              value={pointSearchText}
              onChange={(e) => {
                setPointSearchText(e.target.value);
                setPointDropdownOpen(true);
              }}
              onFocus={() => {
                setPointDropdownOpen(true);
              }}
              placeholder="Поиск по названию точки…"
              className="w-full min-w-0 pl-3 pr-10 py-2 rounded-lg text-sm outline-none truncate"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              title={pointSearchText || undefined}
              autoComplete="off"
            />
            {(pointSearchText.trim() !== "" || (summaryPoint != null && summaryPoint !== "")) && (
              <button
                type="button"
                aria-label="Очистить поле точки"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-lg leading-none hover:opacity-80"
                style={{ color: "var(--text-tertiary)" }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSummaryPoint("");
                  setPointSearchText("");
                  setPointDropdownOpen(true);
                }}
              >
                ×
              </button>
            )}
          </div>
          {pointDropdownOpen && filteredPointsForPicker.length > 0 && (
            <ul
              className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-auto rounded-lg border py-1 shadow-lg"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
              role="listbox"
            >
              {filteredPointsForPicker.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:opacity-90"
                    style={{ background: "transparent", color: "var(--text-primary)" }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSummaryPoint(p);
                      setPointSearchText(p);
                      setPointDropdownOpen(false);
                    }}
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pointDropdownOpen && filteredPointsForPicker.length === 0 && pointSearchText.trim() !== "" && (
            <div
              className="absolute z-30 left-0 right-0 mt-1 rounded-lg border px-3 py-2 text-sm"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border)", color: "var(--text-tertiary)" }}
            >
              Ничего не найдено
            </div>
          )}
        </div>
      )}

      <div className="mb-4 grid gap-2 md:grid-cols-3">
        {mode === "admin" && (
          <div ref={consultantPickerRef} className="relative min-w-0">
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
              Сотрудник для назначения
            </label>
            <div className="relative">
              <input
                type="text"
                value={consultantSearchText}
                onChange={(e) => {
                  setConsultantSearchText(e.target.value);
                  setConsultantDropdownOpen(true);
                }}
                onFocus={() => setConsultantDropdownOpen(true)}
                placeholder="Поиск по ФИО…"
                className="w-full min-w-0 pl-3 pr-10 py-2 rounded-lg text-sm outline-none truncate"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                title={consultantSearchText || undefined}
                autoComplete="off"
                aria-label="Поиск и выбор сотрудника"
              />
              {(consultantSearchText.trim() !== "" || (selectedConsultant != null && selectedConsultant !== "")) && (
                <button
                  type="button"
                  aria-label="Очистить поле сотрудника"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-lg leading-none hover:opacity-80"
                  style={{ color: "var(--text-tertiary)" }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedConsultant("");
                    setConsultantSearchText("");
                    setConsultantDropdownOpen(true);
                  }}
                >
                  ×
                </button>
              )}
            </div>
            {consultantDropdownOpen && filteredConsultantsForPicker.length > 0 && (
              <ul
                className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-auto rounded-lg border py-1 shadow-lg"
                style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
                role="listbox"
              >
                {filteredConsultantsForPicker.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:opacity-90"
                      style={{ background: "transparent", color: "var(--text-primary)" }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedConsultant(name);
                        setConsultantSearchText(name);
                        setConsultantDropdownOpen(false);
                      }}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {consultantDropdownOpen && filteredConsultantsForPicker.length === 0 && consultantSearchText.trim() !== "" && (
              <div
                className="absolute z-30 left-0 right-0 mt-1 rounded-lg border px-3 py-2 text-sm"
                style={{ background: "var(--bg-primary)", borderColor: "var(--border)", color: "var(--text-tertiary)" }}
              >
                Ничего не найдено
              </div>
            )}
          </div>
        )}
        {mode === "admin" && (
          <button
            type="button"
            onClick={() => setAddSecondMode((v) => !v)}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{
              background: addSecondMode ? "var(--accent-light)" : "var(--bg-secondary)",
              border: `1px solid ${addSecondMode ? "var(--accent)" : "var(--border)"}`,
              color: addSecondMode ? "var(--accent)" : "var(--text-primary)",
            }}
            title="Если включено — клик по ячейке добавляет выбранного сотрудника вторым. Если выключено — заменяет сотрудника."
          >
            {addSecondMode ? "Режим: добавить 2-го продавца (вкл.)" : "Режим: заменить сотрудника"}
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            setBaseDate((d) => {
              const next = new Date(d);
              next.setUTCDate(next.getUTCDate() - 7);
              return next;
            })
          }
          className="px-3 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        >
          ← Предыдущая неделя
        </button>
        <button
          type="button"
          onClick={() =>
            setBaseDate((d) => {
              const next = new Date(d);
              next.setUTCDate(next.getUTCDate() + 7);
              return next;
            })
          }
          className="px-3 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        >
          Следующая неделя →
        </button>
      </div>

      {consultantNoPublishedWeek && (
        <div
          className="mb-4 text-sm rounded-lg px-3 py-2"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          На эту неделю график ещё не публиковали. Переключите неделю кнопками выше.
        </div>
      )}

      {mode === "admin" && weekStartKey && adminScheduleEmpty && (
        <div
          className="mb-4 text-sm rounded-lg px-3 py-2 leading-relaxed"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
            График на эту неделю пустой.
          </span>{" "}
          Данные не подставляются с сервера автоматически: смены хранятся в этом браузере по неделям. Заполните таблицу вручную, нажмите «Подгрузить опубликованный» или откройте черновик, либо скопируйте неделю с другой даты.
        </div>
      )}

      {mode === "admin" && weekStartKey && (
        <div
          className="mb-4 p-4 rounded-xl border"
          style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
        >
          <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Копирование недели
          </div>
          <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Данные хранятся в браузере. Копируется заполненный график: смены сдвигаются на нужную неделю по датам. Удобно перенести типовую неделю на следующую или взять за основу прошлую.
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              type="button"
              onClick={handleCopyFromPreviousWeek}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            >
              Скопировать с прошлой недели
            </button>
            <button
              type="button"
              onClick={handleCopyToNextWeek}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            >
              Скопировать на следующую неделю
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Скопировать с другой недели (любой день)
              </label>
              <input
                type="date"
                value={copyFromWeekDate}
                onChange={(e) => setCopyFromWeekDate(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ background: "var(--bg-primary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              />
            </div>
            <button
              type="button"
              onClick={handleCopyFromSelectedWeek}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent)", border: "1px solid var(--accent)", color: "#fff" }}
            >
              Скопировать в текущую неделю
            </button>
          </div>
        </div>
      )}

      {mode === "consultant" && user?.is_consultant && weekStartKey && !consultantNoPublishedWeek && (
        <div
          className="mb-4 p-4 rounded-xl border"
          style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
        >
          <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Ознакомление с графиком
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
            Неделя{" "}
            {weekDays.length > 0
              ? `${new Date(weekDays[0].key + "T12:00:00").toLocaleDateString("ru-RU")} — ${new Date(
                  weekDays[weekDays.length - 1].key + "T12:00:00"
                ).toLocaleDateString("ru-RU")}`
              : ""}
            . Подтвердите, что просмотрели опубликованный график на эту неделю.
          </p>
          {myConfLoading ? (
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Проверка…
            </div>
          ) : myConfirmation?.confirmed && myConfirmation.confirmed_at ? (
            <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
              Вы подтвердили график на эту неделю{" "}
              {new Date(myConfirmation.confirmed_at).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          ) : (
            <>
              {confirmErr && (
                <p className="text-sm mb-2" style={{ color: "var(--error,#b91c1c)" }}>
                  {confirmErr}
                </p>
              )}
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => void handleConfirmSchedule()}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: "var(--accent)", border: "1px solid var(--accent)", color: "#fff" }}
              >
                {confirmBusy ? "Отправка…" : "Подтверждаю"}
              </button>
            </>
          )}
        </div>
      )}

      {mode === "admin" && (
        <div className="mb-4 text-[11px] rounded-lg px-1" style={{ color: "var(--text-tertiary)" }}>
          Обычный клик по ячейке: заменить сотрудника в день/точке. Для добавления второго включите кнопку «Режим: добавить 2-го продавца». Один сотрудник в день не может быть сразу на двух точках.
        </div>
      )}

      {!consultantNoPublishedWeek && (
      <>
      <div className="mb-4 p-3 rounded-lg min-w-0 overflow-hidden" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        <div className="text-xs mb-2 font-medium min-w-0 break-words" style={{ color: "var(--text-secondary)" }}>
          {mode === "admin" ? `График точки: ${summaryPoint || "—"}` : "Мой график"}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7 min-w-0">
          {mode === "admin"
            ? pointWeek.map((x) => {
                const person = x.consultant;
                const names = parseCellConsultants(person === "—" ? "" : person);
                const highlight = Boolean(activeConsultant) && names.includes(activeConsultant);
                return (
                  <button
                    key={x.dayKey}
                    type="button"
                    onClick={() => summaryPoint && onCellClick(summaryPoint, x.dayKey)}
                    className="p-2 rounded border text-xs text-left w-full min-w-0 transition-opacity hover:opacity-95"
                    style={{
                      borderColor: highlight ? "var(--accent)" : "var(--border)",
                      background: highlight ? "var(--accent-light)" : "var(--bg-primary)",
                    }}
                  >
                    <div className="min-w-0" style={{ color: "var(--text-secondary)" }}>
                      {x.day}
                    </div>
                    <div
                      className="font-semibold min-w-0 break-words whitespace-pre-wrap"
                      style={{ color: highlight ? "var(--accent)" : "var(--text-primary)" }}
                    >
                      {person}
                    </div>
                  </button>
                );
              })
            : consultantWeek.map((x) => (
                <div key={x.day} className="p-2 rounded border text-xs" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                  <div style={{ color: "var(--text-secondary)" }}>{x.day}</div>
                  <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {x.point}
                  </div>
                </div>
              ))}
        </div>
      </div>

      {points.length === 0 ? (
        <div className="rounded-lg p-4 text-sm" style={{ border: "1px solid var(--border)", backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
          Нет точек в справочнике складов. Добавьте точки в разделе «Справочники → Склады».
        </div>
      ) : (
        <div
          className="min-w-0 w-full overflow-x-auto overflow-y-auto rounded-lg overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]"
          style={{ border: "1px solid var(--border)" }}
        >
          <table
            className="min-w-[720px] sm:min-w-[860px] md:min-w-[980px] w-full text-xs"
            style={{ backgroundColor: "var(--bg-primary)", tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: "min(38vw, 10rem)" }} />
              {weekDays.map((d) => (
                <col key={d.key} />
              ))}
            </colgroup>
            <thead style={{ backgroundColor: "var(--bg-secondary)" }}>
              <tr>
                <th
                  className="text-left px-3 py-2 max-md:relative md:sticky md:left-0 z-20 truncate md:border-r shadow-[2px_0_8px_-4px_rgba(0,0,0,0.12)]"
                  style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}
                >
                  Точка
                </th>
                {weekDays.map((d) => (
                  <th key={d.key} className="text-left px-2 sm:px-3 py-2 min-w-0" style={{ color: "var(--text-secondary)" }}>
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point} style={{ borderTop: "1px solid var(--border)" }}>
                  <td
                    className="px-3 py-2 max-md:relative md:sticky md:left-0 z-10 align-top font-medium truncate md:border-r"
                    style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}
                    title={point}
                  >
                    {point}
                  </td>
                  {weekDays.map((d) => {
                    const person = effectiveShiftByPointAndDay.get(`${point}|${d.key}`) ?? "—";
                    const names = parseCellConsultants(person === "—" ? "" : person);
                    const highlight =
                      mode === "admin"
                        ? Boolean(activeConsultant) && names.includes(activeConsultant)
                        : matchesCurrentConsultant(person);
                    return (
                      <td
                        key={`${point}-${d.key}`}
                        className={`px-3 py-2 align-top whitespace-pre-wrap break-words relative ${mode === "admin" ? "cursor-pointer" : ""}`}
                        onClick={() => onCellClick(point, d.key)}
                        style={{
                          color: highlight ? "var(--accent)" : "var(--text-primary)",
                          backgroundColor: highlight ? "var(--accent-light)" : "transparent",
                          fontWeight: highlight ? 700 : 400,
                        }}
                      >
                        {mode === "admin" && person !== "—" && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCellRemoveClick(point, d.key);
                            }}
                            className="absolute right-1 top-1 w-5 h-5 rounded text-xs leading-none"
                            style={{
                              background: "var(--bg-primary)",
                              border: "1px solid var(--border)",
                              color: "var(--text-tertiary)",
                            }}
                            title={
                              activeConsultant && names.includes(activeConsultant)
                                ? `Снять сотрудника «${activeConsultant}»`
                                : "Очистить ячейку"
                            }
                            aria-label={
                              activeConsultant && names.includes(activeConsultant)
                                ? `Снять сотрудника ${activeConsultant}`
                                : "Очистить ячейку"
                            }
                          >
                            ×
                          </button>
                        )}
                        {person}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}
    </div>
  );
}
