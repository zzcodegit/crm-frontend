import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { externalizeEmbeddedImages, htmlHasEmbeddedImages } from "../utils/trainingContentImages";
import {
  TrainingEditorFontSize,
  TRAINING_FONT_SIZES_PX,
  parseTrainingFontSizePx,
} from "../utils/trainingEditorFontSize";

function holdEditorFocus(e: MouseEvent) {
  e.preventDefault();
}

function ToolbarBtn({
  children,
  onClick,
  disabled,
  active,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={holdEditorFocus}
      onClick={onClick}
      className="px-3 py-2 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: active ? "var(--accent-light)" : "var(--bg-secondary)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        color: active ? "var(--accent)" : "var(--text-primary)",
      }}
    >
      {children}
    </button>
  );
}

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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewInputRef = useRef<HTMLInputElement | null>(null);
  const pendingEditorHtmlRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // We use dedicated `LinkExtension` below to control behavior/attrs.
        // StarterKit also ships a `link` extension -> duplicate names warning.
        link: false,
      }),
      Underline,
      TextStyle,
      TrainingEditorFontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      LinkExtension.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: { class: "training-editor-img" },
      }),
      Placeholder.configure({ placeholder: "Введите текст статьи…" }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: contentHtml,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "min-h-[340px] max-h-[55vh] overflow-auto rounded-xl p-4 outline-none",
        style:
          "background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-primary);",
      },
    },
    onUpdate: ({ editor }) => {
      const html = (editor.getHTML() || "<p></p>").trim() || "<p></p>";
      setContentHtml(html);
    },
  });

  const applyEditorHtml = (html: string) => {
    const normalized = html || "<p></p>";
    pendingEditorHtmlRef.current = normalized;
    if (editor) {
      editor.commands.setContent(normalized, { emitUpdate: false });
      pendingEditorHtmlRef.current = null;
    }
  };

  useEffect(() => {
    const onApply = (e: Event) => {
      const detail = (e as CustomEvent<{ url?: string; text?: string }>).detail || {};
      const url = (detail.url || "").trim();
      const text = (detail.text || "").trim();
      if (!url || !text) return;
      if (!articleId) return;
      // Only apply if current page matches the URL target
      if (!url.includes(`/training/${articleId}/edit`)) return;

      const safe = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const html = `<p>${safe.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`;
      setContentHtml(html);
      applyEditorHtml(html);
    };
    window.addEventListener("gigachat:apply-training-article", onApply as EventListener);
    return () => window.removeEventListener("gigachat:apply-training-article", onApply as EventListener);
  }, [articleId]);

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
    if (!editor || loading) return;
    if (pendingEditorHtmlRef.current == null) return;
    const html = pendingEditorHtmlRef.current;
    editor.commands.setContent(html || "<p></p>", { emitUpdate: false });
    pendingEditorHtmlRef.current = null;
  }, [editor, loading, contentHtml]);

  const [, setToolbarTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const refreshToolbar = () => setToolbarTick((n) => n + 1);
    editor.on("selectionUpdate", refreshToolbar);
    editor.on("transaction", refreshToolbar);
    return () => {
      editor.off("selectionUpdate", refreshToolbar);
      editor.off("transaction", refreshToolbar);
    };
  }, [editor]);

  const bumpFontSize = (delta: number) => {
    if (!editor) return;
    const cur = parseTrainingFontSizePx(editor.getAttributes("textStyle")?.fontSize as string | undefined);
    const next = Math.max(10, Math.min(72, cur + delta));
    editor.chain().focus().setFontSize(`${next}px`).run();
  };

  const exec = (
    cmd:
      | "bold"
      | "italic"
      | "underline"
      | "strike"
      | "bulletList"
      | "orderedList"
      | "taskList"
      | "heading1"
      | "heading2"
      | "paragraph"
      | "blockquote"
      | "codeBlock"
      | "hr"
      | "undo"
      | "redo"
      | "link"
      | "unlink"
      | "alignLeft"
      | "alignCenter"
      | "alignRight"
      | "alignJustify"
      | "table"
      | "tableAddRowAfter"
      | "tableAddColumnAfter"
      | "tableDelete"
      | "fontSize"
      | "fontSizeUnset"
      | "color"
      | "highlight",
    arg?: unknown,
  ) => {
    if (!editor) return;

    if (cmd === "bold") editor.chain().focus().toggleBold().run();
    else if (cmd === "italic") editor.chain().focus().toggleItalic().run();
    else if (cmd === "underline") editor.chain().focus().toggleUnderline().run();
    else if (cmd === "strike") editor.chain().focus().toggleStrike().run();
    else if (cmd === "bulletList") editor.chain().focus().toggleBulletList().run();
    else if (cmd === "orderedList") editor.chain().focus().toggleOrderedList().run();
    else if (cmd === "taskList") editor.chain().focus().toggleTaskList().run();
    else if (cmd === "paragraph") editor.chain().focus().setParagraph().run();
    else if (cmd === "heading1") editor.chain().focus().toggleHeading({ level: 1 }).run();
    else if (cmd === "heading2") editor.chain().focus().toggleHeading({ level: 2 }).run();
    else if (cmd === "blockquote") editor.chain().focus().toggleBlockquote().run();
    else if (cmd === "codeBlock") editor.chain().focus().toggleCodeBlock().run();
    else if (cmd === "hr") editor.chain().focus().setHorizontalRule().run();
    else if (cmd === "undo") editor.chain().focus().undo().run();
    else if (cmd === "redo") editor.chain().focus().redo().run();
    else if (cmd === "alignLeft") editor.chain().focus().setTextAlign("left").run();
    else if (cmd === "alignCenter") editor.chain().focus().setTextAlign("center").run();
    else if (cmd === "alignRight") editor.chain().focus().setTextAlign("right").run();
    else if (cmd === "alignJustify") editor.chain().focus().setTextAlign("justify").run();
    else if (cmd === "table") editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    else if (cmd === "tableAddRowAfter") editor.chain().focus().addRowAfter().run();
    else if (cmd === "tableAddColumnAfter") editor.chain().focus().addColumnAfter().run();
    else if (cmd === "tableDelete") editor.chain().focus().deleteTable().run();
    else if (cmd === "unlink") editor.chain().focus().unsetLink().run();
    else if (cmd === "fontSizeUnset") editor.chain().focus().unsetFontSize().run();
    else if (cmd === "fontSize") {
      const val = typeof arg === "string" ? arg : "";
      if (!val) return;
      editor.chain().focus().setFontSize(val).run();
    } else if (cmd === "link") {
      const prev = (editor.getAttributes("link")?.href as string | undefined) || "";
      const url = window.prompt("Ссылка (https://...)", prev || "https://");
      if (!url?.trim()) return;
      const href = url.trim();
      const { empty } = editor.state.selection;
      if (empty) {
        editor.chain().focus().insertContent(`<a href="${href}" rel="noopener noreferrer nofollow" target="_blank">${href}</a>`).run();
      } else {
        editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
      }
    } else if (cmd === "color") {
      const val = typeof arg === "string" ? arg : "";
      if (!val) return;
      editor.chain().focus().setColor(val).run();
    } else if (cmd === "highlight") {
      const val = typeof arg === "string" ? arg : "";
      if (!val) return;
      editor.chain().focus().toggleHighlight({ color: val }).run();
    }
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
    if (!editor) return;
    editor.chain().focus().setImage({ src: data.url }).run();
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
    let content = (editor?.getHTML() || contentHtml || "").trim();
    setSaving(true);
    try {
      if (htmlHasEmbeddedImages(content)) {
        content = await externalizeEmbeddedImages(content, uploadImage);
        if (editor) {
          editor.commands.setContent(content, { emitUpdate: false });
        }
        setContentHtml(content);
      }
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

  const toolbarDisabled = !editor;
  const selectionFontSize = parseTrainingFontSizePx(editor?.getAttributes("textStyle")?.fontSize as string | undefined);

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

        <div
          className="relative z-20 flex flex-wrap gap-2 mb-3 p-2 rounded-2xl"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
        >
          <div className="flex flex-wrap gap-2">
            <ToolbarBtn title="Отменить" disabled={toolbarDisabled || !editor?.can().undo()} onClick={() => exec("undo")}>
              ↶
            </ToolbarBtn>
            <ToolbarBtn title="Повторить" disabled={toolbarDisabled || !editor?.can().redo()} onClick={() => exec("redo")}>
              ↷
            </ToolbarBtn>
          </div>

          <div className="flex flex-wrap gap-2">
            <ToolbarBtn disabled={toolbarDisabled} active={editor?.isActive("bold")} onClick={() => exec("bold")}>
              <span className="font-semibold">B</span>
            </ToolbarBtn>
            <ToolbarBtn disabled={toolbarDisabled} active={editor?.isActive("italic")} onClick={() => exec("italic")}>
              <span className="italic">I</span>
            </ToolbarBtn>
            <ToolbarBtn disabled={toolbarDisabled} active={editor?.isActive("underline")} onClick={() => exec("underline")}>
              <span className="underline">U</span>
            </ToolbarBtn>
            <ToolbarBtn disabled={toolbarDisabled} active={editor?.isActive("strike")} title="Зачёркнутый" onClick={() => exec("strike")}>
              <span className="line-through">S</span>
            </ToolbarBtn>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ToolbarBtn disabled={toolbarDisabled} active={editor?.isActive("paragraph")} onClick={() => exec("paragraph")}>
              Текст
            </ToolbarBtn>
            <ToolbarBtn disabled={toolbarDisabled} active={editor?.isActive("heading", { level: 1 })} onClick={() => exec("heading1")}>
              H1
            </ToolbarBtn>
            <ToolbarBtn disabled={toolbarDisabled} active={editor?.isActive("heading", { level: 2 })} onClick={() => exec("heading2")}>
              H2
            </ToolbarBtn>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium px-1" style={{ color: "var(--text-secondary)" }}>
              Размер
            </span>
            <ToolbarBtn title="Уменьшить выделенный текст" disabled={toolbarDisabled} onClick={() => bumpFontSize(-2)}>
              A−
            </ToolbarBtn>
            <select
              aria-label="Размер шрифта"
              disabled={toolbarDisabled}
              value=""
              onMouseDown={holdEditorFocus}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__reset__") exec("fontSizeUnset");
                else if (v) exec("fontSize", `${v}px`);
                e.currentTarget.selectedIndex = 0;
              }}
              className="px-2 py-2 rounded-lg text-sm disabled:opacity-40"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                minWidth: "5.5rem",
              }}
            >
              <option value="" disabled>
                {selectionFontSize}px
              </option>
              {TRAINING_FONT_SIZES_PX.map((n) => (
                <option key={n} value={String(n)}>
                  {n}px
                </option>
              ))}
              <option value="__reset__">Сбросить</option>
            </select>
            <ToolbarBtn title="Увеличить выделенный текст" disabled={toolbarDisabled} onClick={() => bumpFontSize(2)}>
              A+
            </ToolbarBtn>
          </div>

          <div className="flex flex-wrap gap-2">
            <ToolbarBtn disabled={toolbarDisabled} active={editor?.isActive("bulletList")} onClick={() => exec("bulletList")}>
              • Список
            </ToolbarBtn>
            <ToolbarBtn disabled={toolbarDisabled} active={editor?.isActive("orderedList")} onClick={() => exec("orderedList")}>
              1. Список
            </ToolbarBtn>
            <ToolbarBtn disabled={toolbarDisabled} active={editor?.isActive("taskList")} onClick={() => exec("taskList")}>
              ☑︎ Чек‑лист
            </ToolbarBtn>
          </div>

          <div className="flex flex-wrap gap-2">
            <ToolbarBtn title="По левому краю" disabled={toolbarDisabled} active={editor?.isActive({ textAlign: "left" })} onClick={() => exec("alignLeft")}>
              ⬅
            </ToolbarBtn>
            <ToolbarBtn title="По центру" disabled={toolbarDisabled} active={editor?.isActive({ textAlign: "center" })} onClick={() => exec("alignCenter")}>
              ↔
            </ToolbarBtn>
            <ToolbarBtn title="По правому краю" disabled={toolbarDisabled} active={editor?.isActive({ textAlign: "right" })} onClick={() => exec("alignRight")}>
              ➡
            </ToolbarBtn>
            <ToolbarBtn title="По ширине" disabled={toolbarDisabled} active={editor?.isActive({ textAlign: "justify" })} onClick={() => exec("alignJustify")}>
              ≡
            </ToolbarBtn>
          </div>

          <div className="flex flex-wrap gap-2">
            <label
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-2 cursor-pointer"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              onMouseDown={holdEditorFocus}
            >
              Цвет
              <input
                type="color"
                defaultValue="#111111"
                disabled={toolbarDisabled}
                onChange={(e) => exec("color", e.target.value)}
                className="w-6 h-6 rounded cursor-pointer disabled:opacity-40"
                title="Цвет текста"
              />
            </label>
            <label
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-2 cursor-pointer"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              onMouseDown={holdEditorFocus}
            >
              Маркер
              <input
                type="color"
                defaultValue="#fff59d"
                disabled={toolbarDisabled}
                onChange={(e) => exec("highlight", e.target.value)}
                className="w-6 h-6 rounded cursor-pointer disabled:opacity-40"
                title="Подсветка"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <ToolbarBtn disabled={toolbarDisabled} onClick={() => exec("link")}>
              Ссылка
            </ToolbarBtn>
            <ToolbarBtn disabled={toolbarDisabled || !editor?.isActive("link")} onClick={() => exec("unlink")}>
              Убрать ссылку
            </ToolbarBtn>
            <ToolbarBtn disabled={toolbarDisabled} onClick={() => fileInputRef.current?.click()}>
              Картинка
            </ToolbarBtn>
            <ToolbarBtn disabled={toolbarDisabled} onClick={() => exec("table")}>
              Таблица
            </ToolbarBtn>
            <ToolbarBtn
              title="Добавить строку (курсор в таблице)"
              disabled={toolbarDisabled || !editor?.can().addRowAfter()}
              onClick={() => exec("tableAddRowAfter")}
            >
              +стр
            </ToolbarBtn>
            <ToolbarBtn
              title="Добавить столбец (курсор в таблице)"
              disabled={toolbarDisabled || !editor?.can().addColumnAfter()}
              onClick={() => exec("tableAddColumnAfter")}
            >
              +стл
            </ToolbarBtn>
            <ToolbarBtn
              title="Удалить таблицу"
              disabled={toolbarDisabled || !editor?.can().deleteTable()}
              onClick={() => exec("tableDelete")}
            >
              Удалить таблицу
            </ToolbarBtn>
            <ToolbarBtn disabled={toolbarDisabled} active={editor?.isActive("blockquote")} onClick={() => exec("blockquote")}>
              Цитата
            </ToolbarBtn>
            <ToolbarBtn disabled={toolbarDisabled} active={editor?.isActive("codeBlock")} onClick={() => exec("codeBlock")}>
              Код
            </ToolbarBtn>
            <ToolbarBtn disabled={toolbarDisabled} onClick={() => exec("hr")}>
              Линия
            </ToolbarBtn>
          </div>
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

        <div className="training-article-editor relative z-0">
          <EditorContent editor={editor} />
        </div>

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
