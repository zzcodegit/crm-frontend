import { useEffect, useMemo, useState, useRef } from "react";
import { api, type DriveBreadcrumbItem, type DriveFolderPickerItem, type DriveItem, type GroupItem, type UserItem } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

type ShareState = {
  item: DriveItem | null;
  userIds: number[];
  groupIds: number[];
};

type NewFolderState = {
  open: boolean;
  name: string;
  userIds: number[];
  groupIds: number[];
};

type DriveContextMenuState = { item: DriveItem; x: number; y: number };

type DriveSortKey = "name" | "created_at" | "size_bytes";
type DriveSortDir = "asc" | "desc";

function formatDriveBytes(n: number | null | undefined): string {
  if (n == null || n < 0) return "";
  if (n < 1024) return `${n} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function SvgFolder({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6.75A2.25 2.25 0 0 1 6.25 4.5h3.38a2.25 2.25 0 0 1 1.59.66l1.06 1.06a.75.75 0 0 0 .53.22H17.75A2.25 2.25 0 0 1 20 8.69v9.06A2.25 2.25 0 0 1 17.75 20H6.25A2.25 2.25 0 0 1 4 17.75V6.75Z"
        fill="currentColor"
        opacity="0.15"
      />
      <path
        d="M4 6.75A2.25 2.25 0 0 1 6.25 4.5h3.38c.21 0 .41.084.56.234l1.06 1.056a.75.75 0 0 0 .53.22H17.75A2.25 2.25 0 0 1 20 8.76v9.99A2.25 2.25 0 0 1 17.75 21H6.25A2.25 2.25 0 0 1 4 18.75V6.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function SvgImage({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="5" width="14" height="14" rx="2.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="10" r="1.25" fill="currentColor" />
      <path d="M6 17l3.5-3.5a1 1 0 0 1 1.36-.08L14 15l2.65-2.65a1 1 0 0 1 1.42 0L19 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SvgFileBadge({
  className,
  label,
}: {
  className?: string;
  label: string;
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8.25 3.75h5.586a1.5 1.5 0 0 1 1.06.44l3.374 3.373a1.5 1.5 0 0 1 .44 1.061V18a2.25 2.25 0 0 1-2.25 2.25H8.25A2.25 2.25 0 0 1 6 18V6a2.25 2.25 0 0 1 2.25-2.25Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M13.5 4.5V8.25A.75.75 0 0 0 14.25 9h3.75" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="7.1" y="14.2" width="9.8" height="4.1" rx="1.2" fill="currentColor" opacity="0.14" />
      <text
        x="12"
        y="17.25"
        textAnchor="middle"
        fontSize="2.9"
        fontWeight="800"
        fill="currentColor"
        style={{ letterSpacing: 0.6 }}
      >
        {label.toUpperCase().slice(0, 4)}
      </text>
    </svg>
  );
}

function SvgUpload({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15V3m0 0 4 4m-4-4L8 7" />
      <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

function SvgSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" strokeLinejoin="round" />
    </svg>
  );
}

function SvgGrid({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
      <rect x="4" y="4" width="7" height="7" rx="1.25" />
      <rect x="13" y="4" width="7" height="7" rx="1.25" />
      <rect x="4" y="13" width="7" height="7" rx="1.25" />
      <rect x="13" y="13" width="7" height="7" rx="1.25" />
    </svg>
  );
}

function SvgList({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" aria-hidden>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="5" cy="6" r="1.25" fill="currentColor" />
      <circle cx="5" cy="12" r="1.25" fill="currentColor" />
      <circle cx="5" cy="18" r="1.25" fill="currentColor" />
    </svg>
  );
}

function SvgTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function SvgSort({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 6h10" />
      <path d="M10 12h7" />
      <path d="M10 18h4" />
      <path d="M4 7l2-2 2 2" />
      <path d="M6 5v14" />
    </svg>
  );
}

function folderSubtreeIds(folders: DriveFolderPickerItem[], rootId: number): Set<number> {
  const byParent = new Map<number | null, number[]>();
  for (const f of folders) {
    const p = f.parent_id ?? null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(f.id);
  }
  const out = new Set<number>([rootId]);
  const stack = [...(byParent.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of byParent.get(id) ?? []) stack.push(c);
  }
  return out;
}

export default function Drive() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<DriveItem[]>([]);
  const [parentId, setParentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [share, setShare] = useState<ShareState | null>(null);
  const [newFolder, setNewFolder] = useState<NewFolderState>({ open: false, name: "", userIds: [], groupIds: [] });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [showTrash, setShowTrash] = useState(false);
  const [contextMenu, setContextMenu] = useState<DriveContextMenuState | null>(null);
  const [renameState, setRenameState] = useState<{ item: DriveItem; name: string } | null>(null);
  const [folderIconState, setFolderIconState] = useState<{ item: DriveItem } | null>(null);
  const [publicLinkState, setPublicLinkState] = useState<{ item: DriveItem; enabled: boolean; token: string | null } | null>(null);
  const [moveState, setMoveState] = useState<{ item: DriveItem; browseParentId: number | null } | null>(null);
  const [bulkMoveState, setBulkMoveState] = useState<{ ids: number[]; folderIds: number[]; browseParentId: number | null } | null>(null);
  const [allFolders, setAllFolders] = useState<DriveFolderPickerItem[]>([]);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const skipNextClickRef = useRef(false);
  const dragDepthRef = useRef(0);
  const [dropHighlight, setDropHighlight] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [sortKey, setSortKey] = useState<DriveSortKey>("name");
  const [sortDir, setSortDir] = useState<DriveSortDir>("asc");
  const [breadcrumbs, setBreadcrumbs] = useState<DriveBreadcrumbItem[]>([]);

  const load = () => {
    setLoading(true);
    setError("");
    api.drive
      .list(showTrash ? null : parentId, search.trim() || undefined, showTrash)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки диска"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId, showTrash]);

  useEffect(() => {
    api.getUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
    api.getGroups()
      .then(setGroups)
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [parentId, showTrash, search, viewMode]);

  useEffect(() => {
    if (showTrash) {
      setBreadcrumbs([]);
      return;
    }
    api.drive
      .path(parentId)
      .then(setBreadcrumbs)
      .catch(() => setBreadcrumbs([]));
  }, [parentId, showTrash]);

  const folders = items.filter((i) => i.is_folder);
  const files = items.filter((i) => !i.is_folder);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return { folders, files };
    const q = search.toLocaleLowerCase();
    const match = (i: DriveItem) => i.name.toLocaleLowerCase().includes(q);
    return {
      folders: folders.filter(match),
      files: files.filter(match),
    };
  }, [folders, files, search]);

  const sortedItems = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const cmpName = (a: DriveItem, b: DriveItem) => a.name.localeCompare(b.name, "ru");
    const cmpDate = (a: DriveItem, b: DriveItem) => {
      const at = new Date(a.created_at).getTime() || 0;
      const bt = new Date(b.created_at).getTime() || 0;
      return at - bt;
    };
    const cmpSize = (a: DriveItem, b: DriveItem) => (Number(a.size_bytes ?? 0) - Number(b.size_bytes ?? 0));

    const cmpBase =
      sortKey === "created_at" ? cmpDate : sortKey === "size_bytes" ? cmpSize : cmpName;

    const sortArr = (arr: DriveItem[]) =>
      [...arr].sort((a, b) => {
        const c = cmpBase(a, b);
        if (c !== 0) return c * dir;
        return cmpName(a, b) * dir;
      });

    return {
      folders: sortArr(filteredItems.folders),
      files: sortArr(filteredItems.files),
    };
  }, [filteredItems.folders, filteredItems.files, sortKey, sortDir]);

  const openShare = (item: DriveItem) => {
    setShare({
      item,
      userIds: item.shared_user_ids ?? [],
      groupIds: item.shared_group_ids ?? [],
    });
  };

  const applyShare = async () => {
    if (!share?.item) return;
    try {
      await api.drive.update(share.item.id, {
        shared_user_ids: share.userIds,
        shared_group_ids: share.groupIds,
      });
      setShare(null);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось обновить доступ");
    }
  };

  const openNewFolder = () => {
    setNewFolder({ open: true, name: "", userIds: [], groupIds: [] });
  };

  const createFolder = async () => {
    if (!newFolder.name.trim()) {
      alert("Введите название папки");
      return;
    }
    try {
      await api.drive.create({
        parent_id: parentId,
        is_folder: true,
        name: newFolder.name.trim(),
        shared_user_ids: newFolder.userIds,
        shared_group_ids: newFolder.groupIds,
      });
      setNewFolder({ open: false, name: "", userIds: [], groupIds: [] });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось создать папку");
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    await handleFilesUpload(files);
    e.target.value = "";
  };

  const handleFilesUpload = async (files: FileList | File[]) => {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Нет токена авторизации. Войдите заново.");
      return;
    }
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = (files as FileList)[i] ?? (files as File[])[i];
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload/file", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Ошибка загрузки");
        }
        const data = await res.json();
        await api.drive.create({
          parent_id: parentId,
          is_folder: false,
          name: file.name,
          file_url: data.url,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
      }
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка загрузки файла");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDropHighlight(false);
    const files = e.dataTransfer.files;
    if (!files?.length) return;
    await handleFilesUpload(files);
  };

  const deleteItem = async (id: number, name: string) => {
    const msg = showTrash
      ? `ОК — удалить «${name}» навсегда из корзины?`
      : `Переместить «${name}» в корзину?`;
    if (!window.confirm(msg)) return;
    try {
      if (showTrash) {
        await api.drive.purge(id);
      } else {
        await api.drive.delete(id);
      }
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось удалить");
    }
  };

  const canManage = (item: DriveItem) => user && item.owner_user_id === user.id;
  const canDeleteItem = (item: DriveItem) => user && (item.owner_user_id === user.id || !!user.is_admin);

  const isSelected = (id: number) => selectedIds.has(id);
  const selectedCount = selectedIds.size;
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const ownerLabel = (item: DriveItem): string => {
    const u = users.find((x) => x.id === item.owner_user_id);
    if (!u) return `ID ${item.owner_user_id}`;
    const fio = [u.last_name, u.first_name].filter(Boolean).join(" ").trim();
    return fio ? fio : u.username;
  };

  const formatCreatedAt = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("[data-drive-context-menu]")) return;
      setContextMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [contextMenu]);

  const openItem = (item: DriveItem) => {
    if (item.is_folder) {
      setParentId(item.id);
    } else if (item.file_url && item.mime_type?.startsWith("image/")) {
      setPreviewImage(item.file_url);
    } else {
      navigate(`/drive/view/${item.id}`);
    }
  };

  const openContextMenu = (item: DriveItem, clientX: number, clientY: number) => {
    const pad = 8;
    const mw = 220;
    const mh = 280;
    const x = Math.max(pad, Math.min(clientX, window.innerWidth - mw - pad));
    const y = Math.max(pad, Math.min(clientY, window.innerHeight - mh - pad));
    setContextMenu({ item, x, y });
  };

  const onRowContextMenu = (e: React.MouseEvent, item: DriveItem) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(item, e.clientX, e.clientY);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  };

  const onRowTouchStart = (e: React.TouchEvent, item: DriveItem) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    longPressStartRef.current = { x: t.clientX, y: t.clientY };
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      skipNextClickRef.current = true;
      openContextMenu(item, t.clientX, t.clientY);
    }, 550);
  };

  const onRowTouchMove = (e: React.TouchEvent) => {
    const start = longPressStartRef.current;
    if (!start || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - start.x) > 14 || Math.abs(t.clientY - start.y) > 14) {
      clearLongPressTimer();
    }
  };

  const onRowTouchEnd = () => {
    clearLongPressTimer();
  };

  const restoreItem = async (id: number) => {
    try {
      await api.drive.restore(id);
      setContextMenu(null);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось восстановить");
    }
  };

  const copyItem = async (item: DriveItem) => {
    try {
      await api.drive.copy(item.id, {});
      setContextMenu(null);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось скопировать");
    }
  };

  const applyRename = async () => {
    if (!renameState?.name.trim()) {
      alert("Введите название");
      return;
    }
    try {
      await api.drive.update(renameState.item.id, { name: renameState.name.trim() });
      setRenameState(null);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось переименовать");
    }
  };

  const openMoveModal = async (item: DriveItem) => {
    setContextMenu(null);
    try {
      const list = await api.drive.folders();
      setAllFolders(list);
      setMoveState({ item, browseParentId: null });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось загрузить папки");
    }
  };

  const applyFolderIcon = async (itemId: number, icon: string | null) => {
    try {
      await api.drive.update(itemId, { folder_icon: icon });
      setFolderIconState(null);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось обновить иконку");
    }
  };

  const openPublicLinkModal = async (item: DriveItem) => {
    try {
      const fresh = await api.drive.get(item.id);
      setPublicLinkState({ item: fresh, enabled: Boolean(fresh.public_enabled), token: fresh.public_token ?? null });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось загрузить файл");
    }
  };

  const setPublicEnabled = async (item: DriveItem, enabled: boolean) => {
    try {
      const updated = await api.drive.update(item.id, { public_enabled: enabled });
      setPublicLinkState({ item: updated, enabled: Boolean(updated.public_enabled), token: updated.public_token ?? null });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось обновить ссылку");
    }
  };

  const uploadFolderIcon = async (file: File) => {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Нет токена авторизации. Войдите заново.");
      return null;
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/file", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Ошибка загрузки");
    }
    const data = await res.json();
    return String(data.url || "");
  };

  const presetFolderIcons = [
    { key: "preset:blue", label: "Синяя", bg: "linear-gradient(135deg, #1d4ed8, #60a5fa)", glyph: "★" },
    { key: "preset:teal", label: "Бирюза", bg: "linear-gradient(135deg, #0f766e, #22d3ee)", glyph: "⟡" },
    { key: "preset:purple", label: "Фиолет", bg: "linear-gradient(135deg, #6d28d9, #a78bfa)", glyph: "✦" },
    { key: "preset:amber", label: "Янтарь", bg: "linear-gradient(135deg, #b45309, #f59e0b)", glyph: "⚡" },
    { key: "preset:graphite", label: "Графит", bg: "linear-gradient(135deg, #0f172a, #64748b)", glyph: "●" },
    { key: "preset:rose", label: "Роза", bg: "linear-gradient(135deg, #be123c, #fb7185)", glyph: "✿" },
    { key: "preset:lime", label: "Лайм", bg: "linear-gradient(135deg, #3f6212, #84cc16)", glyph: "❖" },
    { key: "preset:indigo", label: "Индиго", bg: "linear-gradient(135deg, #312e81, #818cf8)", glyph: "⌁" },
    { key: "preset:sky", label: "Небо", bg: "linear-gradient(135deg, #0369a1, #38bdf8)", glyph: "☁" },
    { key: "preset:mint", label: "Мята", bg: "linear-gradient(135deg, #0f766e, #34d399)", glyph: "✶" },
    { key: "preset:orange", label: "Апельсин", bg: "linear-gradient(135deg, #c2410c, #fb923c)", glyph: "◈" },
    { key: "preset:gold", label: "Золото", bg: "linear-gradient(135deg, #a16207, #facc15)", glyph: "✹" },
    { key: "preset:violet", label: "Виола", bg: "linear-gradient(135deg, #5b21b6, #c4b5fd)", glyph: "❋" },
    { key: "preset:cyan", label: "Циан", bg: "linear-gradient(135deg, #0e7490, #22d3ee)", glyph: "◌" },
    { key: "preset:emerald", label: "Изумруд", bg: "linear-gradient(135deg, #065f46, #34d399)", glyph: "◆" },
    { key: "preset:slate", label: "Сланец", bg: "linear-gradient(135deg, #0f172a, #94a3b8)", glyph: "▣" },
    { key: "preset:coffee", label: "Кофе", bg: "linear-gradient(135deg, #3f2d20, #c08457)", glyph: "☕" },
    { key: "preset:plasma", label: "Плазма", bg: "linear-gradient(135deg, #0ea5e9, #a855f7)", glyph: "◎" },
    { key: "preset:mono", label: "Моно", bg: "linear-gradient(135deg, #111827, #6b7280)", glyph: "◍" },
    { key: "preset:sakura", label: "Сакура", bg: "linear-gradient(135deg, #db2777, #fbcfe8)", glyph: "❀" },
  ] as const;

  const folderIconView = (item: DriveItem, size: number) => {
    const v = (item.folder_icon ?? "").trim();
    if (!v) return null;
    if (v.startsWith("preset:")) {
      const p = presetFolderIcons.find((x) => x.key === v);
      if (!p) return null;
      const fontSize = Math.max(14, Math.round(size * 0.42));
      return (
        <div
          className="flex items-center justify-center rounded-2xl text-white"
          style={{ width: size, height: size, background: p.bg, border: "1px solid rgba(255,255,255,0.25)" }}
          title={p.label}
        >
          <span style={{ fontSize, textShadow: "0 10px 22px rgba(0,0,0,0.28)" }}>
            {p.glyph}
          </span>
        </div>
      );
    }
    return (
      <div
        className="overflow-hidden rounded-2xl"
        style={{ width: size, height: size, border: "1px solid var(--border-color)" }}
      >
        <img src={v} alt="" className="h-full w-full object-cover" loading="lazy" />
      </div>
    );
  };

  const openBulkMoveModal = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const folderIds = (items ?? []).filter((x) => ids.includes(x.id) && x.is_folder).map((x) => x.id);
    try {
      const list = await api.drive.folders();
      setAllFolders(list);
      setBulkMoveState({ ids, folderIds, browseParentId: null });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось загрузить папки");
    }
  };

  const applyMove = async (targetParentId: number | null) => {
    if (!moveState) return;
    try {
      await api.drive.update(moveState.item.id, { parent_id: targetParentId === null ? 0 : targetParentId });
      setMoveState(null);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось переместить");
    }
  };

  const applyBulkMove = async (targetParentId: number | null) => {
    if (!bulkMoveState) return;
    const ids = bulkMoveState.ids;
    if (ids.length === 0) return;
    try {
      const parent_id = targetParentId === null ? 0 : targetParentId;
      const results = await Promise.allSettled(ids.map((id) => api.drive.update(id, { parent_id })));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        alert(`Не удалось переместить ${failed} из ${ids.length}. Проверьте права и папку назначения.`);
      }
      setBulkMoveState(null);
      setSelectedIds(new Set());
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось переместить выбранное");
    }
  };

  const moveExcludedIds = useMemo(() => {
    if (!moveState?.item.is_folder) return new Set<number>();
    return folderSubtreeIds(allFolders, moveState.item.id);
  }, [moveState, allFolders]);

  const bulkMoveExcludedIds = useMemo(() => {
    if (!bulkMoveState || bulkMoveState.folderIds.length === 0) return new Set<number>();
    const out = new Set<number>();
    for (const fid of bulkMoveState.folderIds) {
      for (const x of folderSubtreeIds(allFolders, fid)) out.add(x);
    }
    return out;
  }, [bulkMoveState, allFolders]);

  const moveBreadcrumbs = useMemo(() => {
    if (!moveState) return [{ id: null as number | null, name: "Корень" }];
    const segments: { id: number; name: string }[] = [];
    let cur: number | null = moveState.browseParentId;
    while (cur != null) {
      const f = allFolders.find((x) => x.id === cur);
      if (!f) break;
      segments.push({ id: f.id, name: f.name });
      cur = f.parent_id ?? null;
    }
    segments.reverse();
    return [{ id: null, name: "Корень" }, ...segments];
  }, [moveState, allFolders]);

  const moveChildFolders = useMemo(() => {
    if (!moveState) return [];
    const bp = moveState.browseParentId;
    return allFolders
      .filter((f) => (bp === null ? f.parent_id == null : f.parent_id === bp))
      .filter((f) => !moveExcludedIds.has(f.id))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [moveState, allFolders, moveExcludedIds]);

  const bulkMoveBreadcrumbs = useMemo(() => {
    if (!bulkMoveState) return [{ id: null as number | null, name: "Корень" }];
    const segments: { id: number; name: string }[] = [];
    let cur: number | null = bulkMoveState.browseParentId;
    while (cur != null) {
      const f = allFolders.find((x) => x.id === cur);
      if (!f) break;
      segments.push({ id: f.id, name: f.name });
      cur = f.parent_id ?? null;
    }
    segments.reverse();
    return [{ id: null, name: "Корень" }, ...segments];
  }, [bulkMoveState, allFolders]);

  const bulkMoveChildFolders = useMemo(() => {
    if (!bulkMoveState) return [];
    const bp = bulkMoveState.browseParentId;
    return allFolders
      .filter((f) => (bp === null ? f.parent_id == null : f.parent_id === bp))
      .filter((f) => !bulkMoveExcludedIds.has(f.id))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [bulkMoveState, allFolders, bulkMoveExcludedIds]);

  const onBrowserDragEnter: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const types = [...e.dataTransfer.types];
    const hasFiles =
      types.includes("Files") ||
      types.includes("application/x-moz-file") ||
      types.some((t) => t.toLowerCase().includes("files"));
    if (!hasFiles) return;
    dragDepthRef.current += 1;
    setDropHighlight(true);
  };

  const onBrowserDragLeave: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setDropHighlight(false);
    }
  };

  const onPageDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    const types = [...e.dataTransfer.types];
    const hasFiles =
      types.includes("Files") ||
      types.includes("application/x-moz-file") ||
      types.some((t) => t.toLowerCase().includes("files"));
    if (!hasFiles) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onPageDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    const types = [...e.dataTransfer.types];
    const hasFiles =
      types.includes("Files") ||
      types.includes("application/x-moz-file") ||
      types.some((t) => t.toLowerCase().includes("files"));
    if (!hasFiles) return;
    await handleDrop(e);
  };

  const ctxBtnClass =
    "mx-1 w-[calc(100%-0.5rem)] text-left rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--bg-secondary)]";
  const ctxBtnStyle = { color: "var(--text-primary)" };

  const fileExt = (name: string): string => {
    const base = (name || "").trim();
    const dot = base.lastIndexOf(".");
    if (dot <= 0 || dot === base.length - 1) return "";
    return base.slice(dot + 1).toLowerCase();
  };

  const fileKind = (item: DriveItem): string => {
    const mime = (item.mime_type ?? "").toLowerCase();
    const ext = fileExt(item.name);
    if (mime === "application/pdf" || ext === "pdf") return "pdf";
    if (
      mime.includes("word") ||
      mime === "application/msword" ||
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ["doc", "docx", "rtf"].includes(ext)
    )
      return "doc";
    if (
      mime.includes("excel") ||
      mime === "application/vnd.ms-excel" ||
      mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      ["xls", "xlsx", "csv"].includes(ext)
    )
      return "xls";
    if (
      mime.includes("powerpoint") ||
      mime === "application/vnd.ms-powerpoint" ||
      mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      ["ppt", "pptx"].includes(ext)
    )
      return "ppt";
    if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext)) return "img";
    if (mime.startsWith("video/") || ["mp4", "mov", "mkv", "webm", "avi"].includes(ext)) return "video";
    if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) return "audio";
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "zip";
    if (mime.startsWith("text/") || ["txt", "md", "log"].includes(ext)) return "txt";
    return ext || "file";
  };

  const fileIconColor = (kind: string): string => {
    if (kind === "pdf") return "#e11d48";
    if (kind === "doc") return "#2563eb";
    if (kind === "xls") return "#16a34a";
    if (kind === "ppt") return "#f97316";
    if (kind === "zip") return "#a855f7";
    if (kind === "video") return "#0ea5e9";
    if (kind === "audio") return "#06b6d4";
    if (kind === "txt") return "var(--text-secondary)";
    if (kind === "img") return "var(--accent)";
    return "var(--text-secondary)";
  };

  const itemThumb = (item: DriveItem) => {
    if (item.is_folder) {
      const custom = folderIconView(item, 24);
      if (custom) return <>{custom}</>;
      return <SvgFolder className="h-6 w-6" />;
    }
    const kind = fileKind(item);
    if (kind === "img") return <SvgImage className="h-6 w-6" />;
    const label = kind === "file" ? "FILE" : kind;
    return <SvgFileBadge className="h-6 w-6" label={label} />;
  };

  const isImageItem = (item: DriveItem) =>
    Boolean(!item.is_folder && item.file_url && (item.mime_type ?? "").startsWith("image/"));

  return (
    <div
      className="max-w-6xl mx-auto animate-slide-in space-y-4 pb-10 px-3 sm:px-0 sm:space-y-5"
      onDragOver={onPageDragOver}
      onDrop={onPageDrop}
    >
      <div
        className="relative overflow-hidden rounded-3xl border px-4 py-6 sm:px-8 sm:py-8"
        style={{
          borderColor: "var(--border-color)",
          background: "linear-gradient(155deg, var(--bg-primary) 0%, var(--bg-secondary) 45%, color-mix(in srgb, var(--accent) 7%, var(--bg-primary)) 100%)",
          boxShadow: "var(--shadow-elevated)",
        }}
      >
        <div
          className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full opacity-[0.22] blur-3xl"
          style={{ background: "var(--accent)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full opacity-[0.14] blur-3xl"
          style={{ background: "var(--teal)" }}
        />
        <div className="relative flex flex-col gap-5 sm:gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div
              className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{
                borderColor: "var(--border-color)",
                color: "var(--text-secondary)",
                background: "color-mix(in srgb, var(--bg-primary) 70%, transparent)",
              }}
            >
              <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--success)" }} />
              Облако
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: "var(--text-primary)" }}>
              Общий диск
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Храните файлы, делитесь папками с коллегами и группами. Потяните файлы в область ниже или загрузите кнопкой.
            </p>
          </div>
          <div className="grid flex-shrink-0 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={openNewFolder}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:brightness-110 active:scale-[0.98] sm:w-auto"
              style={{
                background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)",
                boxShadow: "0 8px 24px color-mix(in srgb, var(--accent) 35%, transparent)",
              }}
            >
              <SvgFolder className="h-5 w-5 opacity-95" />
              Новая папка
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold transition-all hover:bg-[var(--bg-tertiary)] active:scale-[0.98] disabled:opacity-50 sm:w-auto"
              style={{
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
                background: "var(--bg-primary)",
              }}
              disabled={uploading}
            >
              <span style={{ color: "var(--accent)" }}>
                <SvgUpload className="h-5 w-5" />
              </span>
              {uploading ? "Загрузка…" : "Загрузить"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        </div>
      </div>

      <div
        className="flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:p-4"
        style={{
          borderColor: "var(--border-color)",
          background: "var(--bg-primary)",
          boxShadow: "0 1px 3px var(--shadow)",
        }}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          {!showTrash && (
            <>
              <button
                type="button"
                onClick={() => setParentId(null)}
                className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
                style={{
                  color: parentId == null ? "var(--accent)" : "var(--text-secondary)",
                  background: parentId == null ? "var(--accent-light)" : "transparent",
                }}
              >
                Корень
              </button>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                /
              </span>
            </>
          )}
          {showTrash ? (
            <span className="truncate font-medium" style={{ color: "var(--text-primary)" }}>
              Корзина
            </span>
          ) : (
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch]">
              <button
                type="button"
                onClick={() => setParentId(null)}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors"
                style={{
                  color: breadcrumbs.length === 0 ? "var(--accent)" : "var(--text-secondary)",
                  background: breadcrumbs.length === 0 ? "var(--accent-light)" : "transparent",
                }}
                title="Корень"
              >
                Корень
              </button>
              {breadcrumbs.map((b) => (
                <span key={b.id} className="flex min-w-0 items-center gap-1.5">
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>/</span>
                  <button
                    type="button"
                    onClick={() => setParentId(b.id)}
                    className="max-w-[180px] truncate rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors"
                    style={{
                      color: b.id === parentId ? "var(--accent)" : "var(--text-secondary)",
                      background: b.id === parentId ? "var(--accent-light)" : "transparent",
                    }}
                    title={b.name}
                  >
                    {b.name}
                  </button>
                </span>
              ))}
            </div>
          )}
          {!showTrash && !loading && !error && (
            <span
              className="hidden text-xs sm:inline"
              style={{ color: "var(--text-tertiary)" }}
              title="Папок / файлов в текущем виде"
            >
              · {filteredItems.folders.length} / {filteredItems.files.length}
            </span>
          )}
        </div>
        <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:w-auto sm:min-w-[220px]">
            <span
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--text-tertiary)" }}
            >
              <SvgSearch className="h-full w-full" />
            </span>
            <input
              type="search"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder={showTrash ? "Поиск в корзине…" : "Поиск…"}
              className="w-full rounded-xl py-2.5 pl-9 pr-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-none">
            <div
              className="inline-flex w-full items-center gap-2 rounded-xl border px-3 py-2 sm:w-auto sm:flex-none"
              style={{ borderColor: "var(--border-color)", background: "var(--bg-secondary)" }}
              title="Сортировка"
            >
              <span className="shrink-0" style={{ color: "var(--text-tertiary)" }}>
                <SvgSort className="h-4 w-4" />
              </span>
              <select
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(":");
                  setSortKey(k as DriveSortKey);
                  setSortDir(d as DriveSortDir);
                }}
                className="w-full bg-transparent text-xs font-semibold outline-none"
                style={{ color: "var(--text-primary)" }}
              >
                <option value="name:asc">Имя (А→Я)</option>
                <option value="name:desc">Имя (Я→А)</option>
                <option value="created_at:desc">Сначала новые</option>
                <option value="created_at:asc">Сначала старые</option>
                <option value="size_bytes:desc">Размер (убыв.)</option>
                <option value="size_bytes:asc">Размер (возр.)</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowTrash((v) => !v);
                if (!showTrash) {
                  setParentId(null);
                }
              }}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors sm:flex-none"
              style={{
                borderColor: showTrash ? "color-mix(in srgb, var(--error) 35%, var(--border-color))" : "var(--border-color)",
                background: showTrash ? "color-mix(in srgb, var(--error) 12%, var(--bg-primary))" : "var(--bg-secondary)",
                color: showTrash ? "var(--error)" : "var(--text-secondary)",
              }}
            >
              <SvgTrash className="h-4 w-4" />
              {showTrash ? "К диску" : "Корзина"}
            </button>
            <div
              className="flex items-center justify-center gap-0.5 rounded-xl border p-0.5"
              style={{ borderColor: "var(--border-color)", background: "var(--bg-secondary)" }}
            >
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className="rounded-lg p-2 transition-colors"
              style={{
                background: viewMode === "list" ? "var(--bg-primary)" : "transparent",
                color: viewMode === "list" ? "var(--accent)" : "var(--text-tertiary)",
                boxShadow: viewMode === "list" ? "0 1px 4px var(--shadow)" : "none",
              }}
              title="Список"
            >
              <SvgList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className="rounded-lg p-2 transition-colors"
              style={{
                background: viewMode === "grid" ? "var(--bg-primary)" : "transparent",
                color: viewMode === "grid" ? "var(--accent)" : "var(--text-tertiary)",
                boxShadow: viewMode === "grid" ? "0 1px 4px var(--shadow)" : "none",
              }}
              title="Плитка"
            >
              <SvgGrid className="h-4 w-4" />
            </button>
            </div>
          </div>
        </div>
      </div>

      {selectedCount > 0 && !showTrash && (
        <div
          className="flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--border-color)", background: "var(--bg-primary)", boxShadow: "0 1px 3px var(--shadow)" }}
        >
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Выбрано: {selectedCount}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openBulkMoveModal}
              className="rounded-2xl px-4 py-2 text-sm font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              Переместить…
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-2xl border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--border-color)", color: "var(--text-primary)", background: "var(--bg-secondary)" }}
            >
              Снять выделение
            </button>
          </div>
        </div>
      )}

      <div
        className="relative min-h-[280px] overflow-hidden rounded-2xl border transition-all duration-200"
        style={{
          borderColor: dropHighlight ? "var(--accent)" : "var(--border-color)",
          background: "var(--bg-primary)",
          boxShadow: dropHighlight
            ? "0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent), var(--shadow-elevated)"
            : "var(--shadow-elevated)",
        }}
        onDragEnter={onBrowserDragEnter}
        onDragLeave={onBrowserDragLeave}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={handleDrop}
      >
        {dropHighlight && (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[1px]"
            style={{ background: "color-mix(in srgb, var(--accent) 10%, var(--bg-primary))" }}
          >
            <div
              className="mx-4 flex max-w-sm flex-col items-center rounded-2xl border-2 border-dashed px-8 py-8 text-center"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              <SvgUpload className="mb-3 h-12 w-12 opacity-90" />
              <p className="text-base font-semibold">Отпустите файлы здесь</p>
              <p className="mt-1 text-xs opacity-80">Они появятся в текущей папке</p>
            </div>
          </div>
        )}
        {loading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-4 rounded-xl px-3 py-3"
                style={{ background: "var(--bg-secondary)" }}
              >
                <div className="h-11 w-11 rounded-xl" style={{ background: "var(--bg-tertiary)" }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 max-w-[200px] rounded-md" style={{ background: "var(--bg-tertiary)" }} />
                  <div className="h-2.5 w-2/3 max-w-xs rounded-md" style={{ background: "var(--bg-tertiary)" }} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <div
              className="rounded-2xl border px-4 py-3 text-sm font-medium"
              style={{
                borderColor: "color-mix(in srgb, var(--error) 40%, var(--border-color))",
                color: "var(--error)",
                background: "color-mix(in srgb, var(--error) 8%, var(--bg-secondary))",
              }}
            >
              {error}
            </div>
          </div>
        ) : filteredItems.folders.length === 0 && filteredItems.files.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{
                background: "linear-gradient(145deg, var(--accent-light), color-mix(in srgb, var(--accent) 12%, var(--bg-secondary)))",
                color: "var(--accent)",
              }}
            >
              <SvgUpload className="h-8 w-8" />
            </div>
            <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {showTrash ? "Корзина пуста" : "Папка пуста"}
            </p>
            <p className="mt-1 max-w-sm text-sm" style={{ color: "var(--text-secondary)" }}>
              {showTrash
                ? "Удалённые элементы появятся здесь."
                : "Загрузите файлы или создайте папку — или перетащите файлы в эту область."}
            </p>
            {!showTrash && (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                  style={{ background: "var(--accent)" }}
                >
                  Выбрать файлы
                </button>
                <button
                  type="button"
                  onClick={openNewFolder}
                  className="rounded-xl border px-4 py-2 text-sm font-semibold"
                  style={{ borderColor: "var(--border-color)", color: "var(--text-primary)" }}
                >
                  Создать папку
                </button>
              </div>
            )}
          </div>
        ) : viewMode === "list" ? (
          <div className="p-2 sm:p-3">
            {[...sortedItems.folders, ...sortedItems.files].map((item) => {
              const isFolder = item.is_folder;
              const sharedUsers = item.shared_user_ids?.length ?? 0;
              const sharedGroups = item.shared_group_ids?.length ?? 0;
              const shared = sharedUsers + sharedGroups > 0;
              const sizeStr = !isFolder ? formatDriveBytes(item.size_bytes) : "";
              return (
                <div
                  key={item.id}
                  className="group flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 transition-all duration-200 hover:-translate-y-[1px]"
                  style={{
                    background: "color-mix(in srgb, var(--bg-primary) 65%, var(--bg-secondary))",
                    border: "1px solid var(--border-color)",
                    boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
                    marginBottom: 10,
                  }}
                  onContextMenu={(e) => onRowContextMenu(e, item)}
                  onTouchStart={(e) => onRowTouchStart(e, item)}
                  onTouchMove={onRowTouchMove}
                  onTouchEnd={onRowTouchEnd}
                  onClick={() => {
                    if (skipNextClickRef.current) {
                      skipNextClickRef.current = false;
                      return;
                    }
                    if (selectedIds.size > 0) {
                      toggleSelect(item.id);
                      return;
                    }
                    openItem(item);
                  }}
                >
                  <button
                    type="button"
                    className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition-colors active:scale-95"
                    style={{
                      borderColor: "var(--border-color)",
                      background: isSelected(item.id) ? "var(--accent-light)" : "var(--bg-primary)",
                      color: isSelected(item.id) ? "var(--accent)" : "var(--text-tertiary)",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(item.id);
                    }}
                    title="Выделить"
                  >
                    {isSelected(item.id) ? "✓" : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (skipNextClickRef.current) {
                        skipNextClickRef.current = false;
                        return;
                      }
                      openItem(item);
                    }}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform active:scale-95"
                    style={{
                      background: isFolder
                        ? "linear-gradient(145deg, var(--accent-light), color-mix(in srgb, var(--accent) 14%, var(--bg-secondary)))"
                        : "linear-gradient(145deg, var(--bg-tertiary), var(--bg-secondary))",
                      color: isFolder ? "var(--accent)" : "var(--text-secondary)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    {isFolder && folderIconView(item, 40) ? (
                      folderIconView(item, 40)
                    ) : (
                      <span style={{ color: fileIconColor(fileKind(item)) }}>{itemThumb(item)}</span>
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="truncate text-[15px] font-semibold tracking-[-0.01em]"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {item.name}
                      </span>
                      {sizeStr ? (
                        <span className="hidden shrink-0 text-xs sm:inline" style={{ color: "var(--text-tertiary)" }}>
                          {sizeStr}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1 w-1 rounded-full" style={{ background: canManage(item) ? "var(--success)" : "var(--text-tertiary)" }} />
                        {canManage(item) ? "Ваше" : "Только чтение"}
                      </span>
                      <span className="hidden sm:inline" style={{ color: "var(--text-tertiary)" }}>
                        ·
                      </span>
                      <span style={{ color: shared ? "var(--accent)" : "var(--text-secondary)" }}>
                        {shared ? `Общий доступ (${sharedUsers + sharedGroups})` : "Приватно"}
                      </span>
                      <span className="hidden sm:inline" style={{ color: "var(--text-tertiary)" }}>
                        ·
                      </span>
                      <span className="hidden sm:inline" title={ownerLabel(item)} style={{ color: "var(--text-tertiary)" }}>
                        {ownerLabel(item)}
                      </span>
                      <span className="hidden sm:inline" style={{ color: "var(--text-tertiary)" }}>
                        ·
                      </span>
                      <span className="hidden sm:inline" style={{ color: "var(--text-tertiary)" }}>
                        {formatCreatedAt(item.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openShare(item);
                      }}
                      className="hidden sm:inline-flex rounded-xl border px-3 py-2 text-xs font-semibold transition-colors hover:bg-[var(--bg-tertiary)]"
                      style={{
                        borderColor: "var(--border-color)",
                        color: "var(--text-primary)",
                        background: "var(--bg-primary)",
                      }}
                    >
                      Доступ
                    </button>
                    {canDeleteItem(item) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteItem(item.id, item.name);
                        }}
                        className="hidden rounded-xl border px-3 py-2 text-xs font-semibold transition-colors sm:inline-flex"
                        style={{
                          borderColor: "color-mix(in srgb, var(--error) 45%, var(--border-color))",
                          color: "var(--error)",
                          background: "color-mix(in srgb, var(--error) 8%, var(--bg-primary))",
                        }}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...sortedItems.folders, ...sortedItems.files].map((item) => {
              const isFolder = item.is_folder;
              const sharedUsers = item.shared_user_ids?.length ?? 0;
              const sharedGroups = item.shared_group_ids?.length ?? 0;
              const shared = sharedUsers + sharedGroups > 0;
              const sizeStr = !isFolder ? formatDriveBytes(item.size_bytes) : "";
              const hasImage = isImageItem(item);
              return (
                <div
                  key={item.id}
                  className="group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl border transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    borderColor: "var(--border-color)",
                    background: "linear-gradient(165deg, color-mix(in srgb, var(--bg-primary) 75%, var(--bg-secondary)) 0%, var(--bg-primary) 100%)",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
                  }}
                  onContextMenu={(e) => onRowContextMenu(e, item)}
                  onTouchStart={(e) => onRowTouchStart(e, item)}
                  onTouchMove={onRowTouchMove}
                  onTouchEnd={onRowTouchEnd}
                  onClick={() => {
                    if (skipNextClickRef.current) {
                      skipNextClickRef.current = false;
                      return;
                    }
                    if (selectedIds.size > 0) {
                      toggleSelect(item.id);
                      return;
                    }
                    openItem(item);
                  }}
                >
                  <button
                    type="button"
                    className="absolute right-3 top-3 z-20 hidden sm:flex h-9 w-9 items-center justify-center rounded-2xl border text-sm font-bold"
                    style={{
                      borderColor: "var(--border-color)",
                      background: "color-mix(in srgb, var(--bg-primary) 78%, transparent)",
                      color: isSelected(item.id) ? "var(--accent)" : "var(--text-tertiary)",
                      backdropFilter: "blur(10px)",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(item.id);
                    }}
                    title="Выделить"
                  >
                    {isSelected(item.id) ? "✓" : ""}
                  </button>
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-1 opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ background: "linear-gradient(90deg, var(--accent), var(--teal))" }}
                  />
                  <div className="relative">
                    <div className="aspect-[16/11] w-full" style={{ background: "var(--bg-secondary)" }}>
                      {hasImage ? (
                        <img src={item.file_url ?? ""} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          {isFolder && folderIconView(item, 56) ? (
                            folderIconView(item, 56)
                          ) : (
                            <div
                              className="flex h-14 w-14 items-center justify-center rounded-3xl"
                              style={{
                                background: isFolder
                                  ? "linear-gradient(145deg, var(--accent-light), color-mix(in srgb, var(--accent) 16%, var(--bg-secondary)))"
                                  : "linear-gradient(145deg, var(--bg-tertiary), var(--bg-secondary))",
                                color: isFolder ? "var(--accent)" : "var(--text-secondary)",
                                border: "1px solid var(--border-color)",
                              }}
                            >
                              <span className="scale-125" style={{ color: fileIconColor(fileKind(item)) }}>
                                {itemThumb(item)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {shared && (
                      <div
                        className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
                        style={{
                          background: "color-mix(in srgb, var(--bg-primary) 72%, transparent)",
                          border: "1px solid var(--border-color)",
                          color: "var(--accent)",
                          backdropFilter: "blur(8px)",
                        }}
                      >
                        Общий · {sharedUsers + sharedGroups}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col gap-2 px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
                    <div className="min-w-0">
                      <div
                        className="line-clamp-2 text-[13px] sm:text-[15px] font-semibold leading-snug tracking-[-0.01em]"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {item.name}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {!isFolder && sizeStr ? <span>{sizeStr}</span> : null}
                        {!isFolder && sizeStr ? <span>·</span> : null}
                        <span>{canManage(item) ? "Ваше" : "Доступ"}</span>
                        <span>·</span>
                        <span>{formatCreatedAt(item.created_at)}</span>
                      </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openShare(item);
                        }}
                        className="flex-1 rounded-2xl border px-3 py-2 text-xs font-semibold transition-colors hover:bg-[var(--bg-tertiary)]"
                        style={{
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                          background: "var(--bg-primary)",
                        }}
                      >
                        Доступ
                      </button>
                      {canDeleteItem(item) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteItem(item.id, item.name);
                          }}
                          className="rounded-2xl border px-3 py-2 text-xs font-semibold"
                          style={{
                            borderColor: "color-mix(in srgb, var(--error) 45%, var(--border-color))",
                            color: "var(--error)",
                            background: "color-mix(in srgb, var(--error) 8%, var(--bg-primary))",
                          }}
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          data-drive-context-menu
          role="menu"
          className="fixed z-[100] min-w-[220px] overflow-hidden rounded-2xl border py-1.5 shadow-2xl"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: "var(--bg-primary)",
            borderColor: "var(--border-color)",
            boxShadow: "var(--shadow-elevated), 0 24px 48px rgba(0,0,0,0.12)",
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {showTrash ? (
            canDeleteItem(contextMenu.item) ? (
              <>
                {canManage(contextMenu.item) && (
                  <button
                    type="button"
                    className={ctxBtnClass}
                    style={ctxBtnStyle}
                    onClick={() => restoreItem(contextMenu.item.id)}
                  >
                    Восстановить
                  </button>
                )}
                <button
                  type="button"
                  className={ctxBtnClass}
                  style={{ color: "var(--error)" }}
                  onClick={() => {
                    setContextMenu(null);
                    deleteItem(contextMenu.item.id, contextMenu.item.name);
                  }}
                >
                  Удалить навсегда
                </button>
              </>
            ) : (
              <div className="px-3 py-2.5 text-sm" style={{ color: "var(--text-tertiary)" }}>
                Нет действий
              </div>
            )
          ) : (
            <>
              <button
                type="button"
                className={ctxBtnClass}
                style={ctxBtnStyle}
                onClick={() => {
                  setContextMenu(null);
                  openItem(contextMenu.item);
                }}
              >
                Открыть
              </button>
              <button type="button" className={ctxBtnClass} style={ctxBtnStyle} onClick={() => copyItem(contextMenu.item)}>
                Копировать
              </button>
              {canManage(contextMenu.item) && (
                <>
                  {!contextMenu.item.is_folder && (
                    <button
                      type="button"
                      className={ctxBtnClass}
                      style={ctxBtnStyle}
                      onClick={() => {
                        setContextMenu(null);
                        openPublicLinkModal(contextMenu.item);
                      }}
                    >
                      Публичная ссылка…
                    </button>
                  )}
                  {contextMenu.item.is_folder && (
                    <button
                      type="button"
                      className={ctxBtnClass}
                      style={ctxBtnStyle}
                      onClick={() => {
                        setContextMenu(null);
                        setFolderIconState({ item: contextMenu.item });
                      }}
                    >
                      Иконка папки…
                    </button>
                  )}
                  <button
                    type="button"
                    className={ctxBtnClass}
                    style={ctxBtnStyle}
                    onClick={() => {
                      setContextMenu(null);
                      setRenameState({ item: contextMenu.item, name: contextMenu.item.name });
                    }}
                  >
                    Переименовать…
                  </button>
                  <button
                    type="button"
                    className={ctxBtnClass}
                    style={ctxBtnStyle}
                    onClick={() => openMoveModal(contextMenu.item)}
                  >
                    Переместить в папку…
                  </button>
                </>
              )}
              <button
                type="button"
                className={ctxBtnClass}
                style={ctxBtnStyle}
                onClick={() => {
                  setContextMenu(null);
                  openShare(contextMenu.item);
                }}
              >
                Доступ…
              </button>
              {canDeleteItem(contextMenu.item) && (
                <button
                  type="button"
                  className={ctxBtnClass}
                  style={{ color: "var(--error)" }}
                  onClick={() => {
                    setContextMenu(null);
                    deleteItem(contextMenu.item.id, contextMenu.item.name);
                  }}
                >
                  В корзину
                </button>
              )}
            </>
          )}
        </div>
      )}

      {renameState && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setRenameState(null)}
          />
          <div
            className="relative z-[91] w-full max-w-md rounded-2xl p-5 space-y-4"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)" }}
          >
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Переименовать
            </div>
            <input
              type="text"
              value={renameState.name}
              onChange={(e) => setRenameState((s) => (s ? { ...s, name: e.target.value } : s))}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameState(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={applyRename}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: "var(--accent)" }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {folderIconState && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setFolderIconState(null)}
          />
          <div
            className="relative z-[91] w-full max-w-lg rounded-2xl p-5 space-y-4"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Иконка папки
                </div>
                <div className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                  «{folderIconState.item.name}»
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFolderIconState(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-lg shrink-0"
                style={{ border: "1px solid var(--border-color)", color: "var(--text-secondary)" }}
              >
                ×
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                Готовые
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {presetFolderIcons.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyFolderIcon(folderIconState.item.id, p.key)}
                    className="rounded-2xl border p-3 text-left transition-all hover:-translate-y-[1px]"
                    style={{ borderColor: "var(--border-color)", background: "var(--bg-secondary)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl text-white" style={{ width: 44, height: 44, background: p.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span className="text-[18px]" style={{ textShadow: "0 6px 18px rgba(0,0,0,0.25)" }}>
                          {p.glyph}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {p.label}
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                          preset
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                Своя картинка
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    const url = await uploadFolderIcon(f);
                    if (!url) return;
                    await applyFolderIcon(folderIconState.item.id, url);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Не удалось загрузить иконку");
                  }
                }}
                className="block w-full text-sm"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => applyFolderIcon(folderIconState.item.id, null)}
                  className="rounded-2xl border px-4 py-2 text-sm font-semibold"
                  style={{ borderColor: "var(--border-color)", color: "var(--text-primary)", background: "var(--bg-secondary)" }}
                >
                  Сбросить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {publicLinkState && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setPublicLinkState(null)}
          />
          <div
            className="relative z-[91] w-full max-w-lg rounded-2xl p-5 space-y-4"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Публичная ссылка
                </div>
                <div className="mt-1 text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                  «{publicLinkState.item.name}»
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPublicLinkState(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-lg shrink-0"
                style={{ border: "1px solid var(--border-color)", color: "var(--text-secondary)" }}
              >
                ×
              </button>
            </div>

            <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: "var(--border-color)", background: "var(--bg-secondary)" }}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Доступ по ссылке
                </div>
                <button
                  type="button"
                  onClick={() => setPublicEnabled(publicLinkState.item, !publicLinkState.enabled)}
                  className="rounded-2xl px-4 py-2 text-sm font-semibold text-white"
                  style={{ background: publicLinkState.enabled ? "var(--error)" : "var(--accent)" }}
                >
                  {publicLinkState.enabled ? "Выключить" : "Включить"}
                </button>
              </div>

              {publicLinkState.enabled && publicLinkState.token ? (
                <>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    Любой сможет открыть файл без входа. Авторизованных пользователей перенаправим в диск.
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      readOnly
                      value={`${window.location.origin}/drive/share/${publicLinkState.token}`}
                      className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                      style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const url = `${window.location.origin}/drive/share/${publicLinkState.token}`;
                        try {
                          await navigator.clipboard.writeText(url);
                          alert("Ссылка скопирована");
                        } catch {
                          window.prompt("Скопируйте ссылку", url);
                        }
                      }}
                      className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                      style={{ background: "var(--accent)" }}
                    >
                      Копировать
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Сейчас доступ выключен — без входа файл открыть нельзя.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {moveState && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setMoveState(null)}
          />
          <div
            className="relative z-[91] w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl p-5 space-y-3"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Переместить «{moveState.item.name}»
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                  Выберите папку и нажмите «Переместить сюда» или зайдите глубже.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMoveState(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-lg shrink-0"
                style={{ border: "1px solid var(--border-color)", color: "var(--text-secondary)" }}
              >
                ×
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              {moveBreadcrumbs.map((seg, i) => (
                <span key={seg.id === null ? "root" : seg.id} className="flex items-center gap-1">
                  {i > 0 && <span>/</span>}
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    style={{ color: i === moveBreadcrumbs.length - 1 ? "var(--accent)" : "var(--text-secondary)" }}
                    onClick={() =>
                      setMoveState((s) => (s ? { ...s, browseParentId: seg.id } : s))
                    }
                  >
                    {seg.name}
                  </button>
                </span>
              ))}
            </div>
            <div
              className="flex-1 min-h-[160px] overflow-y-auto rounded-xl border divide-y"
              style={{ borderColor: "var(--border-color)", background: "var(--bg-secondary)" }}
            >
              {moveChildFolders.length === 0 ? (
                <div className="p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                  Нет вложенных папок. Можно переместить в эту папку.
                </div>
              ) : (
                moveChildFolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-primary)]"
                    style={{ color: "var(--text-primary)" }}
                    onClick={() => setMoveState((s) => (s ? { ...s, browseParentId: f.id } : s))}
                  >
                    <span className="flex min-w-0 items-center gap-2 truncate">
                      <span className="shrink-0 text-[var(--accent)]">
                        <SvgFolder className="h-4 w-4" />
                      </span>
                      {f.name}
                    </span>
                    <span className="text-xs shrink-0 ml-2" style={{ color: "var(--text-tertiary)" }}>
                      Войти →
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMoveState(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => applyMove(moveState.browseParentId)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: "var(--accent)" }}
              >
                Переместить сюда
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkMoveState && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setBulkMoveState(null)}
          />
          <div
            className="relative z-[91] w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl p-5 space-y-3"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Переместить выбранное ({bulkMoveState.ids.length})
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                  Выберите папку и нажмите «Переместить сюда» или зайдите глубже.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBulkMoveState(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-lg shrink-0"
                style={{ border: "1px solid var(--border-color)", color: "var(--text-secondary)" }}
              >
                ×
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              {bulkMoveBreadcrumbs.map((seg, i) => (
                <span key={seg.id === null ? "root" : seg.id} className="flex items-center gap-1">
                  {i > 0 && <span>/</span>}
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    style={{ color: i === bulkMoveBreadcrumbs.length - 1 ? "var(--accent)" : "var(--text-secondary)" }}
                    onClick={() =>
                      setBulkMoveState((s) => (s ? { ...s, browseParentId: seg.id } : s))
                    }
                  >
                    {seg.name}
                  </button>
                </span>
              ))}
            </div>
            <div
              className="flex-1 min-h-[160px] overflow-y-auto rounded-xl border divide-y"
              style={{ borderColor: "var(--border-color)", background: "var(--bg-secondary)" }}
            >
              {bulkMoveChildFolders.length === 0 ? (
                <div className="p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                  Нет вложенных папок. Можно переместить в эту папку.
                </div>
              ) : (
                bulkMoveChildFolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-primary)]"
                    style={{ color: "var(--text-primary)" }}
                    onClick={() => setBulkMoveState((s) => (s ? { ...s, browseParentId: f.id } : s))}
                  >
                    <span className="flex min-w-0 items-center gap-2 truncate">
                      <span className="shrink-0 text-[var(--accent)]">
                        <SvgFolder className="h-4 w-4" />
                      </span>
                      {f.name}
                    </span>
                    <span className="text-xs shrink-0 ml-2" style={{ color: "var(--text-tertiary)" }}>
                      Войти →
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setBulkMoveState(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => applyBulkMove(bulkMoveState.browseParentId)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: "var(--accent)" }}
              >
                Переместить сюда
              </button>
            </div>
          </div>
        </div>
      )}

      {share?.item && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setShare(null)}
          />
          <div
            className="relative z-50 w-full max-w-lg rounded-2xl p-5 space-y-4"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Доступ к «{share.item.name}»
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                  По умолчанию видите только вы. Добавьте пользователей и группы.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShare(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-lg"
                style={{ border: "1px solid var(--border-color)", color: "var(--text-secondary)" }}
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                  Пользователи
                </div>
                <select
                  multiple
                  value={share.userIds.map(String)}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
                    setShare((prev) => (prev ? { ...prev, userIds: selected } : prev));
                  }}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none min-h-[80px]"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.last_name} {u.first_name} ({u.username})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                  Группы
                </div>
                <select
                  multiple
                  value={share.groupIds.map(String)}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
                    setShare((prev) => (prev ? { ...prev, groupIds: selected } : prev));
                  }}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none min-h-[80px]"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShare(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={applyShare}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: "var(--accent)" }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {newFolder.open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setNewFolder({ open: false, name: "", userIds: [], groupIds: [] })}
          />
          <div
            className="relative z-50 w-full max-w-lg rounded-2xl p-5 space-y-4"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Новая папка
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                  Задайте название и права доступа. По умолчанию видите только вы.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNewFolder({ open: false, name: "", userIds: [], groupIds: [] })}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-lg"
                style={{ border: "1px solid var(--border-color)", color: "var(--text-secondary)" }}
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                  Название папки
                </label>
                <input
                  type="text"
                  value={newFolder.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewFolder((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="Например: Материалы по обучению"
                />
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                  Доступ для пользователей
                </div>
                <input
                  type="search"
                  placeholder="Поиск пользователя…"
                  className="w-full px-3 py-2 mb-2 rounded-xl text-xs outline-none"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const q = e.target.value.toLocaleLowerCase();
                    const matched = users
                      .filter(
                        (u) =>
                          `${u.last_name} ${u.first_name} ${u.username}`
                            .toLocaleLowerCase()
                            .includes(q),
                      )
                      .map((u) => u.id);
                    if (!q.trim()) return;
                    setNewFolder((prev) => ({ ...prev, userIds: Array.from(new Set([...prev.userIds, ...matched])) }));
                  }}
                />
                <select
                  multiple
                  value={newFolder.userIds.map(String)}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
                    setNewFolder((prev) => ({ ...prev, userIds: selected }));
                  }}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none min-h-[80px]"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.last_name} {u.first_name} ({u.username})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                  Доступ для групп
                </div>
                <select
                  multiple
                  value={newFolder.groupIds.map(String)}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
                    setNewFolder((prev) => ({ ...prev, groupIds: selected }));
                  }}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none min-h-[80px]"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewFolder({ open: false, name: "", userIds: [], groupIds: [] })}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={createFolder}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: "var(--accent)" }}
              >
                Создать папку
              </button>
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.7)" }}
            onClick={() => setPreviewImage(null)}
          />
          <div className="relative z-50 max-w-4xl max-h-[90vh]">
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 px-3 py-1.5 rounded-xl text-sm font-medium"
              style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}
            >
              Закрыть
            </button>
            <a
              href={previewImage}
              download
              className="absolute -top-10 right-24 px-3 py-1.5 rounded-xl text-sm font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Скачать
            </a>
            <img
              src={previewImage}
              alt=""
              className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}

