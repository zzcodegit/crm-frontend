import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

export default function TrainingArticleForm() {
  const { id } = useParams();
  const articleId = id ? Number(id) : null;
  const isEdit = Number.isFinite(articleId) && articleId !== null;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(Boolean(isEdit));
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("Общее");
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [published, setPublished] = useState(true);
  const [contentHtml, setContentHtml] = useState("<p></p>");

  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewInputRef = useRef<HTMLInputElement | null>(null);
  const pendingEditorHtmlRef = useRef<string | null>(null);

  const applyEditorHtml = (html: string) => {
    const normalized = html || "<p></p>";
    pendingEditorHtmlRef.current = normalized;
    if (editorRef.current) {
      editorRef.current.innerHTML = normalized;
      pendingEditorHtmlRef.current = null;
    }
  };

  useEffect(() => {
    if (!isEdit || !articleId) {
      setContentHtml("<p></p>");
      applyEditorHtml("<p></p>");
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const item = await api.training.get(articleId);
        setTitle(item.title || "");
        setSection((item.section || "Общее").trim() || "Общее");
        setPreviewImageUrl(item.preview_image_url || "");
        setPublished(item.is_published);
        const nextHtml = item.content_html || "<p></p>";
        setContentHtml(nextHtml);
        applyEditorHtml(nextHtml);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [articleId, isEdit]);

  useEffect(() => {
    if (!editorRef.current) return;
    const html = pendingEditorHtmlRef.current ?? contentHtml ?? "<p></p>";
    editorRef.current.innerHTML = html;
    pendingEditorHtmlRef.current = null;
  }, [contentHtml, loading]);

  useEffect(() => {
    if (loading) return;
    if (!editorRef.current) return;
    if (pendingEditorHtmlRef.current == null) return;
    const html = pendingEditorHtmlRef.current;
    requestAnimationFrame(() => {
      if (!editorRef.current || html == null) return;
      editorRef.current.innerHTML = html;
      pendingEditorHtmlRef.current = null;
    });
  }, [loading]);

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  };

  const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload/image", {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Ошибка загрузки изображения");
    }
    return res.json();
  };

  const onInsertImage = async (file: File) => {
    const data = await uploadImage(file);
    exec("insertImage", data.url);
  };

  const onUploadPreview = async (file: File) => {
    const data = await uploadImage(file);
    setPreviewImageUrl(data.url || "");
  };

  const save = async () => {
    const textTitle = title.trim();
    const textSection = section.trim() || "Общее";
    if (!textTitle) {
      alert("Введите заголовок статьи");
      return;
    }
    const content = (editorRef.current?.innerHTML || contentHtml || "").trim();
    setSaving(true);
    try {
      if (isEdit && articleId) {
        await api.training.update(articleId, {
          title: textTitle,
          section: textSection,
          preview_image_url: previewImageUrl.trim() || null,
          content_html: content,
          is_published: published,
        });
      } else {
        await api.training.create({
          title: textTitle,
          section: textSection,
          preview_image_url: previewImageUrl.trim() || null,
          content_html: content,
          is_published: published,
        });
      }
      navigate("/training");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="max-w-5xl mx-auto text-sm" style={{ color: "var(--text-secondary)" }}>Загрузка…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto animate-slide-in">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            {isEdit ? "Редактирование статьи" : "Новая статья"}
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Заполните карточку и сохраните публикацию
          </p>
        </div>
        <Link to="/training" className="px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
          Назад
        </Link>
      </div>

      <div className="rounded-2xl p-5" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,220px] gap-3 mb-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Заголовок статьи"
            className="px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          <label className="flex items-center gap-2 text-sm px-3 py-2.5 rounded-xl" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            Опубликовано
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-3 mb-3">
          <input
            value={section}
            onChange={(e) => setSection(e.target.value)}
            placeholder="Раздел (например: Продажи)"
            className="px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          <button
            type="button"
            onClick={() => previewInputRef.current?.click()}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            Загрузить картинку анонса
          </button>
        </div>

        <input
          ref={previewInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              await onUploadPreview(file);
            } catch (err) {
              alert(err instanceof Error ? err.message : "Ошибка загрузки изображения");
            }
          }}
        />
        <input
          value={previewImageUrl}
          onChange={(e) => setPreviewImageUrl(e.target.value)}
          placeholder="URL картинки анонса"
          className="px-3 py-2.5 rounded-xl text-sm outline-none w-full mb-3"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        />
        {previewImageUrl && (
          <div className="mb-3 rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
            <img src={previewImageUrl} alt="preview" className="w-full max-h-[180px] object-cover" />
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          <button type="button" onClick={() => exec("bold")} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>Жирный</button>
          <button type="button" onClick={() => exec("italic")} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>Курсив</button>
          <button type="button" onClick={() => exec("insertUnorderedList")} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>Список</button>
          <button type="button" onClick={() => exec("formatBlock", "<h2>")} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>Заголовок</button>
          <button
            type="button"
            onClick={() => {
              const url = window.prompt("Ссылка (https://...)");
              if (url) exec("createLink", url);
            }}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            Ссылка
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>Картинка</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                await onInsertImage(file);
              } catch (err) {
                alert(err instanceof Error ? err.message : "Ошибка загрузки изображения");
              }
            }}
          />
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="min-h-[340px] max-h-[55vh] overflow-auto rounded-xl p-4"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        />

        <div className="flex justify-end gap-2 mt-4">
          <Link to="/training" className="px-4 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            Отмена
          </Link>
          <button type="button" disabled={saving} onClick={save} className="px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60" style={{ background: "var(--accent)", color: "#fff" }}>
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
