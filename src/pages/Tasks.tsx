import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type PortalTaskItem, type TaskAssigneeOption } from "../api";
import { useAuth } from "../contexts/AuthContext";

const VIEW_STORAGE_KEY = "tasks-view-mode-v1";

const statusLabel: Record<PortalTaskItem["status"], string> = {
  new: "Новая",
  in_progress: "В работе",
  done: "Готово",
};

const priorityLabel: Record<PortalTaskItem["priority"], string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
};

const columns: { status: PortalTaskItem["status"]; title: string }[] = [
  { status: "new", title: "Новые" },
  { status: "in_progress", title: "В работе" },
  { status: "done", title: "Готово" },
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDueRu(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isOverdue(task: PortalTaskItem): boolean {
  if (!task.due_at || task.status === "done") return false;
  return Date.parse(task.due_at) < Date.now();
}

function canDeleteTask(task: PortalTaskItem, userId: number | undefined, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (userId == null) return false;
  return task.created_by_user_id === userId || task.assignee_user_id === userId;
}

export default function Tasks() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.is_admin) || user?.role === "admin";
  const uid = user?.id;

  const [tasks, setTasks] = useState<PortalTaskItem[]>([]);
  const [assignees, setAssignees] = useState<TaskAssigneeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [viewMode, setViewMode] = useState<"kanban" | "list">(() => {
    try {
      const v = localStorage.getItem(VIEW_STORAGE_KEY);
      return v === "list" ? "list" : "kanban";
    } catch {
      return "kanban";
    }
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState<PortalTaskItem["priority"]>("medium");
  const [formStatus, setFormStatus] = useState<PortalTaskItem["status"]>("new");
  const [formAssigneeId, setFormAssigneeId] = useState<number | "">("");
  const [formDueLocal, setFormDueLocal] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([api.portalTasks.list(), api.portalTasks.assignees()])
      .then(([t, a]) => {
        setTasks(t);
        setAssignees(a);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  const openCreate = () => {
    setEditingId(null);
    setFormTitle("");
    setFormDescription("");
    setFormPriority("medium");
    setFormStatus("new");
    setFormAssigneeId("");
    setFormDueLocal("");
    setModalOpen(true);
  };

  const openEdit = (task: PortalTaskItem) => {
    setEditingId(task.id);
    setFormTitle(task.title);
    setFormDescription(task.description ?? "");
    setFormPriority(task.priority);
    setFormStatus(task.status);
    setFormAssigneeId(task.assignee_user_id ?? "");
    setFormDueLocal(toDatetimeLocalValue(task.due_at));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = formTitle.trim();
    if (!title) return;
    setSaving(true);
    try {
      const duePayload =
        formDueLocal.trim() === "" ? null : new Date(formDueLocal).toISOString();
      const assigneePayload = formAssigneeId === "" ? null : Number(formAssigneeId);

      if (editingId == null) {
        await api.portalTasks.create({
          title,
          description: formDescription.trim() || undefined,
          priority: formPriority,
          status: formStatus,
          assignee_user_id: assigneePayload,
          due_at: duePayload,
        });
      } else {
        await api.portalTasks.update(editingId, {
          title,
          description: formDescription.trim() || null,
          priority: formPriority,
          status: formStatus,
          assignee_user_id: assigneePayload,
          due_at: duePayload,
        });
      }
      closeModal();
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const patchStatus = async (taskId: number, status: PortalTaskItem["status"]) => {
    try {
      await api.portalTasks.update(taskId, { status });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const onDragStart = (e: React.DragEvent, taskId: number) => {
    e.dataTransfer.setData("text/task-id", String(taskId));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDropColumn = async (e: React.DragEvent, status: PortalTaskItem["status"]) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/task-id");
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    await patchStatus(id, status);
  };

  const removeTask = async (id: number) => {
    if (!window.confirm("Удалить задачу?")) return;
    try {
      await api.portalTasks.delete(id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка удаления");
    }
  };

  const tasksByStatus = useMemo(() => {
    const m: Record<PortalTaskItem["status"], PortalTaskItem[]> = {
      new: [],
      in_progress: [],
      done: [],
    };
    for (const t of tasks) {
      m[t.status].push(t);
    }
    return m;
  }, [tasks]);

  const sortedList = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const da = a.due_at ? Date.parse(a.due_at) : Infinity;
      const db = b.due_at ? Date.parse(b.due_at) : Infinity;
      if (da !== db) return da - db;
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [tasks]);

  const cardShell = (task: PortalTaskItem) => (
    <div
      key={task.id}
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      className="rounded-lg p-3 text-sm cursor-grab active:cursor-grabbing transition-shadow"
      style={{
        background: "var(--bg-secondary)",
        border: `1px solid ${isOverdue(task) ? "var(--error, #c62828)" : "var(--border)"}`,
        boxShadow: "var(--shadow-sm, none)",
      }}
      onClick={() => openEdit(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          openEdit(task);
        }
      }}
    >
      <div className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {task.title}
      </div>
      {task.description ? (
        <div className="text-xs line-clamp-2 mb-2" style={{ color: "var(--text-secondary)" }}>
          {task.description}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5 items-center text-xs">
        <span
          className="px-1.5 py-0.5 rounded"
          style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}
        >
          {priorityLabel[task.priority]}
        </span>
        {task.assignee_label ? (
          <span style={{ color: "var(--text-secondary)" }}>→ {task.assignee_label}</span>
        ) : null}
        {task.due_at ? (
          <span style={{ color: isOverdue(task) ? "var(--error, #c62828)" : "var(--text-secondary)" }}>
            {formatDueRu(task.due_at)}
          </span>
        ) : null}
      </div>
      {canDeleteTask(task, uid, isAdmin) ? (
        <button
          type="button"
          className="mt-2 text-xs underline opacity-80 hover:opacity-100"
          style={{ color: "var(--error, #c62828)" }}
          onClick={(ev) => {
            ev.stopPropagation();
            removeTask(task.id);
          }}
        >
          Удалить
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="max-w-[1400px] mx-auto px-2 sm:px-4 pb-8 animate-slide-in space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Задачник
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-lg overflow-hidden border"
            style={{ borderColor: "var(--border)" }}
          >
            <button
              type="button"
              className="px-3 py-1.5 text-sm font-medium"
              style={{
                background: viewMode === "kanban" ? "var(--accent)" : "var(--bg-primary)",
                color: viewMode === "kanban" ? "#fff" : "var(--text-primary)",
              }}
              onClick={() => setViewMode("kanban")}
            >
              Канбан
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm font-medium"
              style={{
                background: viewMode === "list" ? "var(--accent)" : "var(--bg-primary)",
                color: viewMode === "list" ? "#fff" : "var(--text-primary)",
              }}
              onClick={() => setViewMode("list")}
            >
              Список
            </button>
          </div>
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
            onClick={openCreate}
          >
            Новая задача
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "var(--text-secondary)" }}>Загрузка…</div>
      ) : error ? (
        <div style={{ color: "var(--error)" }}>{error}</div>
      ) : viewMode === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {columns.map((col) => (
            <div
              key={col.status}
              className="rounded-xl p-3 min-h-[200px] flex flex-col gap-2"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
              onDragOver={onDragOver}
              onDrop={(e) => onDropColumn(e, col.status)}
            >
              <div className="font-semibold text-sm mb-1" style={{ color: "var(--text-primary)" }}>
                {col.title}{" "}
                <span style={{ color: "var(--text-secondary)" }}>({tasksByStatus[col.status].length})</span>
              </div>
              <div className="flex flex-col gap-2 flex-1">
                {tasksByStatus[col.status].map((task) => cardShell(task))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full text-sm" style={{ background: "var(--bg-primary)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                <th className="text-left p-3 font-medium">Задача</th>
                <th className="text-left p-3 font-medium">Статус</th>
                <th className="text-left p-3 font-medium">Приоритет</th>
                <th className="text-left p-3 font-medium">Ответственный</th>
                <th className="text-left p-3 font-medium">Срок</th>
                <th className="text-left p-3 font-medium w-40">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sortedList.map((task) => (
                <tr
                  key={task.id}
                  style={{ borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}
                >
                  <td className="p-3 align-top">
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => openEdit(task)}
                    >
                      {task.title}
                    </button>
                    {task.description ? (
                      <div className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                        {task.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3 align-top">{statusLabel[task.status]}</td>
                  <td className="p-3 align-top">{priorityLabel[task.priority]}</td>
                  <td className="p-3 align-top">{task.assignee_label ?? "—"}</td>
                  <td
                    className="p-3 align-top whitespace-nowrap"
                    style={{ color: isOverdue(task) ? "var(--error, #c62828)" : undefined }}
                  >
                    {formatDueRu(task.due_at)}
                  </td>
                  <td className="p-3 align-top">
                    <div className="flex flex-col gap-1">
                      <select
                        className="text-xs rounded px-2 py-1 max-w-[140px]"
                        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                        value={task.status}
                        onChange={(e) => patchStatus(task.id, e.target.value as PortalTaskItem["status"])}
                      >
                        <option value="new">Новая</option>
                        <option value="in_progress">В работе</option>
                        <option value="done">Готово</option>
                      </select>
                      {canDeleteTask(task, uid, isAdmin) ? (
                        <button
                          type="button"
                          className="text-xs text-left underline"
                          style={{ color: "var(--error, #c62828)" }}
                          onClick={() => removeTask(task.id)}
                        >
                          Удалить
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="w-full max-w-lg rounded-xl p-5 shadow-xl max-h-[90vh] overflow-y-auto"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-modal-title"
          >
            <h2 id="task-modal-title" className="text-lg font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              {editingId == null ? "Новая задача" : "Редактирование задачи"}
            </h2>
            <form onSubmit={submitForm} className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                  Заголовок
                </label>
                <input
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                  Описание
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                    Статус
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as PortalTaskItem["status"])}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  >
                    <option value="new">Новая</option>
                    <option value="in_progress">В работе</option>
                    <option value="done">Готово</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                    Приоритет
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as PortalTaskItem["priority"])}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  >
                    <option value="low">Низкий</option>
                    <option value="medium">Средний</option>
                    <option value="high">Высокий</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                  Ответственный
                </label>
                <select
                  value={formAssigneeId === "" ? "" : String(formAssigneeId)}
                  onChange={(e) => setFormAssigneeId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                >
                  <option value="">Не назначен</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} ({a.username})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                  Срок (дата и время)
                </label>
                <input
                  type="datetime-local"
                  value={formDueLocal}
                  onChange={(e) => setFormDueLocal(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg text-sm"
                  style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  onClick={closeModal}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--accent)" }}
                >
                  {saving ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
