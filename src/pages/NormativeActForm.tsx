import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

export default function NormativeActForm() {
  const { id } = useParams();
  const actId = id ? Number(id) : null;
  const isEdit = Number.isFinite(actId) && actId !== null;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(Boolean(isEdit));
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("Общее");
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentFilename, setAttachmentFilename] = useState("");
  const [published, setPublished] = useState(true);
  const [users, setUsers] = useState<{ id: number; username: string; first_name?: string | null; last_name?: string | null }[]>([]);
  const [visibleUserIds, setVisibleUserIds] = useState<number[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.getUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    if (!isEdit || !actId) {
      if (editorRef.current) editorRef.current.innerHTML = "<p></p>";
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const item = await api.normativeActs.get(actId);
        setTitle(item.title || "");
        setSection((item.section || "Общее").trim() || "Общее");
        setPreviewImageUrl(item.preview_image_url || "");
        setAttachmentUrl(item.attachment_url || "");
        setAttachmentFilename(item.attachment_filename || "");
        setVisibleUserIds(item.visible_user_ids || []);
        setPublished(item.is_published);
        if (editorRef.current) editorRef.current.innerHTML = item.content_html || "<p></p>";
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [actId, isEdit]);

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  };
  const uploadImage = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/image", { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, body: fd });
    if (!res.ok) throw new Error("Ошибка загрузки изображения");
    return res.json();
  };
  const uploadNormativeFile = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/normative-file", {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: fd,
    });
    if (!res.ok) {
      let msg = "Ошибка загрузки файла";
      try {
        const j = (await res.json()) as { detail?: string };
        if (typeof j.detail === "string") msg = j.detail;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return res.json() as Promise<{ url: string; original_filename: string }>;
  };
  const save = async () => {
    const textTitle = title.trim();
    const textSection = section.trim() || "Общее";
    if (!textTitle) return alert("Введите заголовок документа");
    const content = (editorRef.current?.innerHTML || "").trim();
    setSaving(true);
    try {
      const attUrl = attachmentUrl.trim() || null;
      const attName = attachmentFilename.trim() || null;
      if (isEdit && actId) {
        await api.normativeActs.update(actId, {
          title: textTitle,
          section: textSection,
          preview_image_url: previewImageUrl.trim() || null,
          attachment_url: attUrl,
          attachment_filename: attUrl ? attName : null,
          visible_user_ids: visibleUserIds,
          content_html: content,
          is_published: published,
        });
      } else {
        await api.normativeActs.create({
          title: textTitle,
          section: textSection,
          preview_image_url: previewImageUrl.trim() || null,
          attachment_url: attUrl,
          attachment_filename: attUrl ? attName : null,
          visible_user_ids: visibleUserIds,
          content_html: content,
          is_published: published,
        });
      }
      navigate("/normative-acts");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };
  const searchTerm = userSearch.trim().toLowerCase();
  const filteredUsers = users.filter((u) => {
    if (!searchTerm) return true;
    const fullName = [u.last_name, u.first_name].filter(Boolean).join(" ").trim().toLowerCase();
    return fullName.includes(searchTerm) || (u.username || "").toLowerCase().includes(searchTerm);
  });
  if (loading) return <div className="max-w-5xl mx-auto text-sm" style={{ color: "var(--text-secondary)" }}>Загрузка…</div>;

  return (
    <div className="max-w-5xl mx-auto animate-slide-in">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>{isEdit ? "Редактирование нормативного акта" : "Новый нормативный акт"}</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Создание документа и обязательной подписи сотрудников</p>
        </div>
        <Link to="/normative-acts" className="px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Назад</Link>
      </div>
      <div className="rounded-2xl p-5" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,220px] gap-3 mb-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок документа" className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          <label className="flex items-center gap-2 text-sm px-3 py-2.5 rounded-xl" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Опубликовано
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-1 gap-2 mb-3">
          <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Раздел" className="px-3 py-2.5 rounded-xl text-sm outline-none w-full" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => previewInputRef.current?.click()} className="px-3 py-2 rounded-lg text-sm whitespace-nowrap" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              Загрузить картинку анонса
            </button>
            <button
              type="button"
              onClick={() => attachmentInputRef.current?.click()}
              className="px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap"
              style={{ background: "rgba(0,82,204,0.12)", border: "1px solid rgba(0,82,204,0.35)", color: "var(--accent)" }}
            >
              Прикрепить файл (PDF, Office…)
            </button>
          </div>
        </div>
        <input ref={previewInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { const d = await uploadImage(f); setPreviewImageUrl(d.url || ""); } catch { alert("Ошибка загрузки изображения"); } }} />
        <input value={previewImageUrl} onChange={(e) => setPreviewImageUrl(e.target.value)} placeholder="URL картинки анонса" className="px-3 py-2.5 rounded-xl text-sm outline-none w-full mb-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
        {previewImageUrl && <div className="mb-3 rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}><img src={previewImageUrl} alt="preview" className="w-full max-h-[180px] object-cover" /></div>}
        <div className="mb-3 rounded-xl p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Файл документа</div>
          <div className="text-[11px] mb-2" style={{ color: "var(--text-tertiary)" }}>
            PDF, Word, Excel, PowerPoint, ODF, TXT, RTF, ZIP — до 50 МБ
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => attachmentInputRef.current?.click()}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            >
              Загрузить файл
            </button>
            {attachmentUrl ? (
              <>
                <span className="text-sm truncate max-w-[min(100%,280px)]" style={{ color: "var(--text-primary)" }} title={attachmentFilename || attachmentUrl}>
                  {attachmentFilename || attachmentUrl}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAttachmentUrl("");
                    setAttachmentFilename("");
                  }}
                  className="px-2 py-1 rounded-lg text-xs"
                  style={{ color: "var(--error)" }}
                >
                  Убрать
                </button>
              </>
            ) : (
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Файл не прикреплён
              </span>
            )}
          </div>
          <input
            ref={attachmentInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.rtf,.zip,application/pdf,application/zip"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const d = await uploadNormativeFile(f);
                setAttachmentUrl(d.url || "");
                setAttachmentFilename(d.original_filename || f.name);
              } catch (err) {
                alert(err instanceof Error ? err.message : "Ошибка загрузки файла");
              }
            }}
          />
        </div>
        <div className="mb-3 rounded-xl p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Кому виден документ</div>
          <div className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>Если никого не выбрать — документ виден всем сотрудникам</div>
          <input
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Поиск сотрудника (ФИО или логин)"
            className="px-3 py-2 rounded-lg text-sm outline-none w-full mb-2"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-auto">
            {filteredUsers.map((u) => {
              const checked = visibleUserIds.includes(u.id);
              const name = [u.last_name, u.first_name].filter(Boolean).join(" ").trim() || u.username;
              return (
                <label key={u.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setVisibleUserIds((prev) =>
                        e.target.checked ? Array.from(new Set([...prev, u.id])) : prev.filter((x) => x !== u.id)
                      )
                    }
                  />
                  <span>{name}</span>
                </label>
              );
            })}
            {filteredUsers.length === 0 && (
              <div className="text-xs px-2 py-1.5" style={{ color: "var(--text-tertiary)" }}>Ничего не найдено</div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <button type="button" onClick={() => exec("bold")} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>Жирный</button>
          <button type="button" onClick={() => exec("italic")} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>Курсив</button>
          <button type="button" onClick={() => exec("insertUnorderedList")} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>Список</button>
          <button type="button" onClick={() => exec("formatBlock", "<h2>")} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>Заголовок</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>Картинка</button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { const d = await uploadImage(f); exec("insertImage", d.url); } catch { alert("Ошибка загрузки изображения"); } }} />
        </div>
        <div ref={editorRef} contentEditable suppressContentEditableWarning className="min-h-[340px] max-h-[55vh] overflow-auto rounded-xl p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
        <div className="flex justify-end gap-2 mt-4">
          <Link to="/normative-acts" className="px-4 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Отмена</Link>
          <button type="button" disabled={saving} onClick={save} className="px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60" style={{ background: "var(--accent)", color: "#fff" }}>{saving ? "Сохраняем..." : "Сохранить"}</button>
        </div>
      </div>
    </div>
  );
}
