import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import PricelistMarkdownView from "./PricelistMarkdownView";
import PricelistTableBuilderModal, {
  findPricelistUserTableFragments,
  parseHtmlTableToGrid,
  type Cell,
} from "./PricelistTableBuilderModal";

type Props = {
  value: string;
  onChange: (v: string) => void;
  textareaClassName: string;
  inputStyle: CSSProperties;
  uploadImage: (file: File) => Promise<string>;
};

export default function PricelistRxDescriptionEditor({
  value,
  onChange,
  textareaClassName,
  inputStyle,
  uploadImage,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState(false);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [tableModalKey, setTableModalKey] = useState(0);
  const [tableReplaceRange, setTableReplaceRange] = useState<{ start: number; end: number } | null>(null);
  const [tableInitialGrid, setTableInitialGrid] = useState<(Cell | null)[][] | null>(null);

  const tableFragments = useMemo(() => findPricelistUserTableFragments(value), [value]);
  const hasExistingUserTable = tableFragments.length > 0;
  const [drawOpen, setDrawOpen] = useState(false);
  const [sketchBusy, setSketchBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [penColor, setPenColor] = useState("#2563eb");
  const penColorRef = useRef(penColor);
  penColorRef.current = penColor;

  const insertSnippet = useCallback(
    (snippet: string) => {
      const el = taRef.current;
      if (!el) {
        onChange(value + snippet);
        return;
      }
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = value.slice(0, start) + snippet + value.slice(end);
      onChange(next);
      const pos = start + snippet.length;
      queueMicrotask(() => {
        el.setSelectionRange(pos, pos);
        el.focus();
      });
    },
    [onChange, value]
  );

  const closeTableModal = useCallback(() => {
    setTableModalOpen(false);
    setTableReplaceRange(null);
    setTableInitialGrid(null);
  }, []);

  const applyTableHtml = useCallback(
    (html: string) => {
      if (!html.trim()) return;
      if (tableReplaceRange) {
        const { start, end } = tableReplaceRange;
        const inserted = `\n\n${html}\n\n`;
        const next = value.slice(0, start) + inserted + value.slice(end);
        onChange(next);
        const pos = start + inserted.length;
        queueMicrotask(() => {
          const el = taRef.current;
          if (el) {
            el.focus();
            el.setSelectionRange(pos, pos);
          }
        });
      } else {
        insertSnippet(`\n\n${html}\n\n`);
      }
    },
    [tableReplaceRange, value, onChange, insertSnippet]
  );

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = 640;
    const h = 220;
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = "100%";
    canvas.style.maxWidth = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = penColorRef.current;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useLayoutEffect(() => {
    if (!drawOpen) return;
    initCanvas();
  }, [drawOpen, initCanvas]);

  const getPos = (e: ReactMouseEvent | ReactTouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    const scaleX = 640 / r.width;
    const scaleY = 220 / r.height;
    if ("touches" in e && e.touches.length > 0) {
      const t = e.touches[0];
      return { x: (t.clientX - r.left) * scaleX, y: (t.clientY - r.top) * scaleY };
    }
    if ("touches" in e && e.changedTouches?.length) {
      const t = e.changedTouches[0];
      return { x: (t.clientX - r.left) * scaleX, y: (t.clientY - r.top) * scaleY };
    }
    if ("clientX" in e) {
      return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
    }
    return { x: 0, y: 0 };
  };

  const startDraw = (e: ReactMouseEvent<HTMLCanvasElement> | ReactTouchEvent<HTMLCanvasElement>) => {
    if ("touches" in e) e.preventDefault();
    drawingRef.current = true;
    const p = getPos(e);
    lastRef.current = p;
  };

  const moveDraw = (e: ReactMouseEvent<HTMLCanvasElement> | ReactTouchEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    if ("touches" in e) e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !lastRef.current) return;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = penColorRef.current;
    ctx.stroke();
    lastRef.current = p;
  };

  const endDraw = () => {
    drawingRef.current = false;
    lastRef.current = null;
  };

  const clearCanvas = () => {
    initCanvas();
  };

  const insertSketch = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSketchBusy(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
      if (!blob) throw new Error("Не удалось сохранить рисунок");
      const file = new File([blob], "sketch.png", { type: "image/png" });
      const url = await uploadImage(file);
      const line = `\n\n![Рисунок](${url})\n`;
      insertSnippet(line);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка загрузки рисунка");
    } finally {
      setSketchBusy(false);
    }
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Выберите файл изображения (jpg/png/webp/gif/svg)");
      return;
    }
    setImageBusy(true);
    try {
      const url = await uploadImage(file);
      const alt = file.name.replace(/\.[^.]+$/, "").trim() || "Изображение";
      insertSnippet(`\n\n![${alt}](${url})\n\n`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка загрузки изображения");
    } finally {
      setImageBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="block text-sm font-medium flex-1 min-w-[12rem]" style={{ color: "var(--text-secondary)" }}>
          Полное описание
        </label>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ background: "var(--bg-secondary)", color: "var(--accent)", border: "1px solid var(--border)" }}
          onClick={() => {
            // Всегда создаём новую таблицу и вставляем в текущую позицию курсора.
            setTableReplaceRange(null);
            setTableInitialGrid(null);
            setTableModalKey((k) => k + 1);
            setTableModalOpen(true);
          }}
        >
          + Таблица
        </button>
        {hasExistingUserTable ? (
          <div className="flex flex-wrap gap-2">
            {tableFragments.map((frag, idx) => (
              <button
                key={`${frag.start}-${frag.end}-${idx}`}
                type="button"
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                onClick={() => {
                  const grid = parseHtmlTableToGrid(frag.html);
                  if (!grid) {
                    alert(`Таблицу #${idx + 1} не удалось разобрать для редактирования. Создайте новую и скопируйте данные.`);
                    return;
                  }
                  setTableReplaceRange({ start: frag.start, end: frag.end });
                  setTableInitialGrid(grid);
                  setTableModalKey((k) => k + 1);
                  setTableModalOpen(true);
                }}
              >
                Изменить таблицу #{idx + 1}
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          onClick={() => setDrawOpen((v) => !v)}
        >
          {drawOpen ? "Скрыть рисунок" : "Рисунок"}
        </button>
        <label
          className="text-xs px-3 py-1.5 rounded-lg font-medium cursor-pointer"
          style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        >
          {imageBusy ? "Загрузка…" : "+ Изображение"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={imageBusy}
            onChange={(e) => void handleImagePick(e)}
          />
        </label>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ background: preview ? "var(--accent-light)" : "var(--bg-secondary)", color: "var(--accent)", border: "1px solid var(--border)" }}
          onClick={() => setPreview((v) => !v)}
        >
          {preview ? "Только текст" : "Предпросмотр"}
        </button>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
        Таблица — визуальный редактор (объединение ячеек). Кнопка «+ Таблица» всегда вставляет новую таблицу в позицию курсора, поэтому можно добавить несколько таблиц в одном описании. Каждую существующую таблицу можно открыть отдельной кнопкой «Изменить таблицу #N» — правки применяются сразу в тексте описания (до сохранения элемента). Также поддерживаются Markdown-списки и **жирный текст**. Рисунок загружается на сервер и вставляется как картинка.
      </p>
      <PricelistTableBuilderModal
        key={tableModalKey}
        open={tableModalOpen}
        onClose={closeTableModal}
        onInsert={applyTableHtml}
        initialGrid={tableInitialGrid ?? undefined}
        isEditingExisting={tableReplaceRange !== null}
      />
      {drawOpen && (
        <div
          className="rounded-xl p-3 space-y-2"
          style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)" }}
        >
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span style={{ color: "var(--text-secondary)" }}>Цвет линии:</span>
            <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border" aria-label="Цвет пера" />
            <button type="button" className="px-2 py-1 rounded-lg" style={{ color: "var(--accent)" }} onClick={clearCanvas}>
              Очистить холст
            </button>
            <button
              type="button"
              disabled={sketchBusy}
              className="px-3 py-1.5 rounded-lg font-medium text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
              onClick={() => void insertSketch()}
            >
              {sketchBusy ? "Загрузка…" : "Вставить рисунок в описание"}
            </button>
          </div>
          <canvas
            ref={canvasRef}
            className="rounded-lg cursor-crosshair touch-none w-full bg-white"
            style={{ border: "1px solid var(--border)" }}
            onMouseDown={startDraw}
            onMouseMove={moveDraw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={moveDraw}
            onTouchEnd={endDraw}
          />
        </div>
      )}
      {preview ? (
        <div className="rounded-xl p-4 min-h-[5rem]" style={{ border: "1px solid var(--border)", background: "var(--bg-primary)" }}>
          {value.trim() ? <PricelistMarkdownView source={value} /> : <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>Пусто</span>}
        </div>
      ) : (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={textareaClassName}
          style={{ ...inputStyle, fieldSizing: "fixed" } as CSSProperties}
          rows={8}
          placeholder="Текст; таблицы через «+ Таблица»; рисунок — ссылка на изображение"
        />
      )}
    </div>
  );
}
