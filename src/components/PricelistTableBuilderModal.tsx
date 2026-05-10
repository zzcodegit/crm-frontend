import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type Cell = {
  text: string;
  r: number;
  c: number;
  rs: number;
  cs: number;
  /** Жирный текст в ячейке */
  bold?: boolean;
  /** Размер шрифта в пикселях (12 / 14 / 16 / 18 / 20) */
  fontSizePx?: number;
  /** Заливка фона #RRGGBB */
  bgColor?: string;
};

const FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20] as const;

function buildSerializedTdStyle(cell: Cell): string {
  const parts: string[] = [];
  parts.push(`font-weight:${cell.bold ? 700 : 400}`);
  const raw = cell.fontSizePx ?? 14;
  const pct = (FONT_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw  : 14;
  parts.push(`font-size:${pct}px`);
  if (cell.bgColor && /^#[0-9a-fA-F]{6}$/.test(cell.bgColor)) {
    parts.push(`background-color:${cell.bgColor.toLowerCase()}`);
  }
  return parts.join(";");
}

function parseCellStyleFromStyleString(style: string | null | undefined): Partial<Pick<Cell, "bold" | "fontSizePx" | "bgColor">> {
  if (!style?.trim()) return {};
  const s = style.replace(/\s+/g, " ").trim();
  const out: Partial<Pick<Cell, "bold" | "fontSizePx" | "bgColor">> = {};
  if (/font-weight:\s*(700|bold|600)/i.test(s)) out.bold = true;
  else if (/font-weight:\s*400/i.test(s)) out.bold = false;
  const mFsPx = s.match(/font-size:\s*(\d+)px/i);
  if (mFsPx) {
    const n = parseInt(mFsPx[1], 10);
    if ((FONT_SIZE_OPTIONS as readonly number[]).includes(n)) out.fontSizePx = n;
  } else {
    const mFsPct = s.match(/font-size:\s*(\d+)%/i);
    if (mFsPct) {
      const pct = parseInt(mFsPct[1], 10);
      const n = pct <= 100 ? 14 : pct <= 110 ? 16 : pct <= 125 ? 18 : 20;
      if ((FONT_SIZE_OPTIONS as readonly number[]).includes(n)) out.fontSizePx = n;
    }
  }
  const mBg = s.match(/background-color:\s*(#[0-9a-fA-F]{6})/i);
  if (mBg) out.bgColor = mBg[1].toLowerCase();
  return out;
}

function createGrid(rows: number, cols: number): (Cell | null)[][] {
  const g: (Cell | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    g[r] = [];
    for (let c = 0; c < cols; c++) {
      const cell: Cell = { text: "", r, c, rs: 1, cs: 1, bold: false, fontSizePx: 14 };
      g[r][c] = cell;
    }
  }
  return g;
}

function cloneGridRef(grid: (Cell | null)[][]): (Cell | null)[][] {
  return grid.map((row) => [...row]);
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function serializeTableToHtml(grid: (Cell | null)[][]): string {
  if (!grid.length || !grid[0]?.length) return "";
  const rows = grid.length;
  const cols = grid[0].length;
  let html = '<table class="pricelist-user-table"><tbody>';
  for (let r = 0; r < rows; r++) {
    html += "<tr>";
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      if (cell.r !== r || cell.c !== c) continue;
      const rs = cell.rs > 1 ? ` rowspan="${cell.rs}"` : "";
      const cs = cell.cs > 1 ? ` colspan="${cell.cs}"` : "";
      const st = buildSerializedTdStyle(cell);
      const styleAttr = st ? ` style="${htmlEscape(st)}"` : "";
      html += `<td${rs}${cs}${styleAttr}>${htmlEscape(cell.text)}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  return html;
}

function mergeHoriz(grid: (Cell | null)[][], a: Cell): boolean {
  const r = a.r;
  const c = a.c;
  const bCol = c + a.cs;
  if (bCol >= (grid[0]?.length ?? 0)) return false;
  const b = grid[r][bCol];
  if (!b || b.r !== r || b.c !== bCol) return false;
  if (a.rs !== b.rs) return false;
  const oldCsB = b.cs;
  a.cs += b.cs;
  a.text = `${a.text.trim()} ${b.text.trim()}`.trim();
  for (let dr = 0; dr < b.rs; dr++) {
    for (let dc = 0; dc < oldCsB; dc++) {
      grid[b.r + dr][b.c + dc] = null;
    }
  }
  for (let dr = 0; dr < a.rs; dr++) {
    for (let dc = 0; dc < a.cs; dc++) {
      grid[a.r + dr][a.c + dc] = a;
    }
  }
  return true;
}

function mergeVert(grid: (Cell | null)[][], a: Cell): boolean {
  const r = a.r;
  const c = a.c;
  const bRow = r + a.rs;
  if (bRow >= grid.length) return false;
  const b = grid[bRow][c];
  if (!b || b.r !== bRow || b.c !== c) return false;
  if (a.cs !== b.cs) return false;
  const clearRs = b.rs;
  a.rs += b.rs;
  a.text = `${a.text.trim()}\n${b.text.trim()}`.trim();
  for (let dr = 0; dr < clearRs; dr++) {
    for (let dc = 0; dc < b.cs; dc++) {
      grid[b.r + dr][b.c + dc] = null;
    }
  }
  for (let dr = 0; dr < a.rs; dr++) {
    for (let dc = 0; dc < a.cs; dc++) {
      grid[a.r + dr][a.c + dc] = a;
    }
  }
  return true;
}

function splitHorizRight(grid: (Cell | null)[][], a: Cell): boolean {
  if (a.cs <= 1) return false;
  const oldCs = a.cs;
  a.cs -= 1;
  const b: Cell = { text: "", r: a.r, c: a.c + a.cs, rs: a.rs, cs: 1, bold: false, fontSizePx: 14 };
  for (let dr = 0; dr < a.rs; dr++) {
    for (let dc = 0; dc < oldCs; dc++) {
      grid[a.r + dr][a.c + dc] = null;
    }
  }
  for (let dr = 0; dr < a.rs; dr++) {
    for (let dc = 0; dc < a.cs; dc++) {
      grid[a.r + dr][a.c + dc] = a;
    }
  }
  for (let dr = 0; dr < b.rs; dr++) {
    for (let dc = 0; dc < b.cs; dc++) {
      grid[b.r + dr][b.c + dc] = b;
    }
  }
  return true;
}

function splitVertBottom(grid: (Cell | null)[][], a: Cell): boolean {
  if (a.rs <= 1) return false;
  const oldRs = a.rs;
  a.rs -= 1;
  const b: Cell = { text: "", r: a.r + a.rs, c: a.c, rs: 1, cs: a.cs, bold: false, fontSizePx: 14 };
  for (let dr = 0; dr < oldRs; dr++) {
    for (let dc = 0; dc < a.cs; dc++) {
      grid[a.r + dr][a.c + dc] = null;
    }
  }
  for (let dr = 0; dr < a.rs; dr++) {
    for (let dc = 0; dc < a.cs; dc++) {
      grid[a.r + dr][a.c + dc] = a;
    }
  }
  for (let dr = 0; dr < b.rs; dr++) {
    for (let dc = 0; dc < b.cs; dc++) {
      grid[b.r + dr][b.c + dc] = b;
    }
  }
  return true;
}

function addRow(grid: (Cell | null)[][]): (Cell | null)[][] {
  const cols = grid[0]?.length ?? 0;
  const r = grid.length;
  const row: (Cell | null)[] = [];
  for (let c = 0; c < cols; c++) {
    row.push({ text: "", r, c, rs: 1, cs: 1, bold: false, fontSizePx: 14 });
  }
  return [...grid, row];
}

function addCol(grid: (Cell | null)[][]): (Cell | null)[][] {
  return grid.map((row, r) => {
    const c = row.length;
    return [...row, { text: "", r, c, rs: 1, cs: 1, bold: false, fontSizePx: 14 }];
  });
}

function getTopLeftCells(grid: (Cell | null)[][]): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      if (cell.r !== r || cell.c !== c) continue;
      out.push({ ...cell });
    }
  }
  return out;
}

function buildGridFromTopCells(topCells: Cell[], rows: number, cols: number): (Cell | null)[][] {
  const out: (Cell | null)[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));

  for (const cell of topCells) {
    for (let dr = 0; dr < cell.rs; dr++) {
      for (let dc = 0; dc < cell.cs; dc++) {
        const rr = cell.r + dr;
        const cc = cell.c + dc;
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
        out[rr][cc] = cell;
      }
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (out[r][c]) continue;
      const cell: Cell = { text: "", r, c, rs: 1, cs: 1, bold: false, fontSizePx: 14 };
      out[r][c] = cell;
    }
  }
  return out;
}

function insertRowAt(grid: (Cell | null)[][], atRow: number): (Cell | null)[][] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (!rows || !cols) return grid;
  const target = Math.max(0, Math.min(rows, atRow));
  const topCells = getTopLeftCells(grid);
  for (const cell of topCells) {
    if (cell.r < target && cell.r + cell.rs > target) {
      cell.rs += 1;
    } else if (cell.r >= target) {
      cell.r += 1;
    }
  }
  return buildGridFromTopCells(topCells, rows + 1, cols);
}

function insertColAt(grid: (Cell | null)[][], atCol: number): (Cell | null)[][] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (!rows || !cols) return grid;
  const target = Math.max(0, Math.min(cols, atCol));
  const topCells = getTopLeftCells(grid);
  for (const cell of topCells) {
    if (cell.c < target && cell.c + cell.cs > target) {
      cell.cs += 1;
    } else if (cell.c >= target) {
      cell.c += 1;
    }
  }
  return buildGridFromTopCells(topCells, rows, cols + 1);
}

const MAX_PASTE_ROWS = 24;
const MAX_PASTE_COLS = 16;

/** Таблица из Excel / Google Sheets (TAB между колонками). */
function parseTsvToGrid(text: string): (Cell | null)[][] | null {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;
  if (!lines.some((line) => line.includes("\t"))) return null;
  const rows = lines.map((line) => line.split("\t"));
  const rowCount = Math.min(MAX_PASTE_ROWS, rows.length);
  const cols = Math.min(MAX_PASTE_COLS, Math.max(1, ...rows.map((r) => r.length)));
  const grid: (Cell | null)[][] = [];
  for (let r = 0; r < rowCount; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      grid[r][c] = { text: (rows[r][c] ?? "").trim(), r, c, rs: 1, cs: 1, bold: false, fontSizePx: 14 };
    }
  }
  return grid;
}

type SparseGrid = (Cell | undefined)[][];

function cloneGridDeep(grid: (Cell | null)[][]): (Cell | null)[][] {
  return grid.map((row, r) =>
    row.map((cell, c) => {
      if (!cell) return null;
      return { ...cell, r, c };
    })
  );
}

/** HTML-таблица с учётом rowspan/colspan (копирование из браузера, Word и т.д.). */
export function parseHtmlTableToGrid(html: string): (Cell | null)[][] | null {
  const trimmed = html.trim();
  if (!/<table[\s>]/i.test(trimmed)) return null;
  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  // Только прямые строки этой таблицы (без вложенных таблиц в ячейках).
  const trs = Array.from(
    table.querySelectorAll(":scope > tr, :scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr")
  );
  if (trs.length === 0) return null;
  const grid: SparseGrid = [];

  const ensure = (r: number, c: number) => {
    while (grid.length <= r) grid.push([]);
    while (grid[r].length <= c) grid[r].push(undefined);
  };

  for (let ri = 0; ri < trs.length; ri++) {
    // Только прямые ячейки строки (без вложенных таблиц).
    const tds = trs[ri].querySelectorAll(":scope > td, :scope > th");
    let c = 0;
    for (const td of tds) {
      while (true) {
        ensure(ri, c);
        if (grid[ri][c] === undefined) break;
        c++;
      }
      const rs = Math.max(1, parseInt(td.getAttribute("rowspan") || "1", 10) || 1);
      const cs = Math.max(1, parseInt(td.getAttribute("colspan") || "1", 10) || 1);
      const text = (td.textContent || "").replace(/\s+/g, " ").trim();
      const st = parseCellStyleFromStyleString(td.getAttribute("style"));
      const cell: Cell = { text, r: ri, c, rs, cs, ...st };
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) {
          ensure(ri + dr, c + dc);
          // Терпим к частично-кривой разметке: не падаем, если слот уже занят.
          if (grid[ri + dr][c + dc] !== undefined) continue;
          grid[ri + dr][c + dc] = cell;
        }
      }
    }
  }

  let maxR = grid.length;
  let maxC = 0;
  for (const row of grid) maxC = Math.max(maxC, row.length);
  if (maxR > MAX_PASTE_ROWS || maxC > MAX_PASTE_COLS) return null;

  const out: (Cell | null)[][] = [];
  for (let r = 0; r < maxR; r++) {
    out[r] = [];
    for (let c = 0; c < maxC; c++) {
      const v = grid[r]?.[c];
      if (v === undefined) {
        out[r][c] = { text: "", r, c, rs: 1, cs: 1, bold: false, fontSizePx: 14 };
      } else {
        out[r][c] = v;
      }
    }
  }
  return out;
}

export type PricelistUserTableFragment = { start: number; end: number; html: string };

/** Все вхождения таблиц из конструктора прайса в тексте описания. */
export function findPricelistUserTableFragments(text: string): PricelistUserTableFragment[] {
  // class может быть не первым атрибутом, поэтому ищем гибко.
  const re = /<table\b[^>]*\bclass\s*=\s*["'][^"']*\bpricelist-user-table\b[^"']*["'][^>]*>[\s\S]*?<\/table>/gi;
  const out: PricelistUserTableFragment[] = [];
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, html: m[0] });
  }
  return out;
}

/** Первое вхождение таблицы из конструктора прайса (обратная совместимость). */
export function findFirstPricelistUserTableFragment(text: string): PricelistUserTableFragment | null {
  return findPricelistUserTableFragments(text)[0] ?? null;
}

function parseClipboardToGrid(html: string, plain: string): (Cell | null)[][] | null {
  const h = html.trim();
  if (h && /<table[\s>]/i.test(h)) {
    const g = parseHtmlTableToGrid(h);
    if (g) return g;
  }
  if (plain.includes("\t")) {
    const g = parseTsvToGrid(plain);
    if (g) return g;
  }
  return null;
}

async function readClipboardAndParse(): Promise<(Cell | null)[][] | null> {
  let html = "";
  let plain = "";
  try {
    if (navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes("text/html")) {
          html = await (await item.getType("text/html")).text();
        }
        if (item.types.includes("text/plain")) {
          plain = await (await item.getType("text/plain")).text();
        }
      }
    }
  } catch {
    /* read() может быть недоступен — ниже readText */
  }
  if (!plain && !html) {
    try {
      plain = await navigator.clipboard.readText();
    } catch {
      return null;
    }
  }
  return parseClipboardToGrid(html, plain);
}

type Props = {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
  /** Если в описании уже есть таблица конструктора — передать разобранную сетку для редактирования */
  initialGrid?: (Cell | null)[][] | null;
  /** true — заголовок и кнопка в режиме «изменить», не «новая» */
  isEditingExisting?: boolean;
};

export default function PricelistTableBuilderModal({
  open,
  onClose,
  onInsert,
  initialGrid,
  isEditingExisting,
}: Props) {
  const [grid, setGrid] = useState<(Cell | null)[][]>(() =>
    initialGrid?.length && initialGrid[0]?.length ? cloneGridDeep(initialGrid) : createGrid(3, 3)
  );
  const [initRows, setInitRows] = useState(() =>
    initialGrid?.length ? Math.min(24, Math.max(1, initialGrid.length)) : 3
  );
  const [initCols, setInitCols] = useState(() =>
    initialGrid?.length && initialGrid[0]?.length ? Math.min(16, Math.max(1, initialGrid[0].length)) : 3
  );
  const [pasteMsg, setPasteMsg] = useState("");
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);

  useEffect(() => {
    if (open) setPasteMsg("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) return;
      const html = e.clipboardData?.getData("text/html") || "";
      const text = e.clipboardData?.getData("text/plain") || "";
      const g = parseClipboardToGrid(html, text);
      if (g) {
        e.preventDefault();
        setGrid(g);
        setInitRows(Math.min(24, g.length));
        setInitCols(Math.min(16, g[0]?.length ?? 0));
        setPasteMsg(`Вставлено ${g.length}×${g[0]?.length ?? 0} (Ctrl+V).`);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [open]);

  const refresh = useCallback((g: (Cell | null)[][]) => {
    setGrid(cloneGridRef(g));
  }, []);

  const selectedTopCell = selectedCell ? grid[selectedCell.r]?.[selectedCell.c] : null;
  const selectedAnchor =
    selectedTopCell && selectedTopCell.r === selectedCell?.r && selectedTopCell.c === selectedCell?.c ? selectedTopCell : null;

  const handleMergeRight = (cell: Cell) => {
    const g = cloneGridRef(grid);
    if (mergeHoriz(g, cell)) refresh(g);
  };

  const handleMergeDown = (cell: Cell) => {
    const g = cloneGridRef(grid);
    if (mergeVert(g, cell)) refresh(g);
  };

  const handleSplitH = (cell: Cell) => {
    const g = cloneGridRef(grid);
    if (splitHorizRight(g, cell)) refresh(g);
  };

  const handleSplitV = (cell: Cell) => {
    const g = cloneGridRef(grid);
    if (splitVertBottom(g, cell)) refresh(g);
  };

  const setCellText = (cell: Cell, text: string) => {
    cell.text = text;
    refresh(cloneGridRef(grid));
  };

  const patchCellFormat = (patch: Partial<Pick<Cell, "bold" | "fontSizePx" | "bgColor">>) => {
    if (!selectedCell) return;
    const g = cloneGridRef(grid);
    const t = g[selectedCell.r]?.[selectedCell.c];
    if (!t || t.r !== selectedCell.r || t.c !== selectedCell.c) return;
    Object.assign(t, patch);
    refresh(g);
  };

  const fillColumnBackground = () => {
    if (!selectedCell) return;
    const g = cloneGridRef(grid);
    const anchor = g[selectedCell.r]?.[selectedCell.c];
    if (!anchor || anchor.r !== selectedCell.r || anchor.c !== selectedCell.c) return;
    const color = anchor.bgColor;
    if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      setPasteMsg("Сначала выберите цвет фона (поле «Фон») для ячейки в нужном столбце.");
      return;
    }
    const colIdx = anchor.c;
    const tops = getTopLeftCells(g);
    for (const cell of tops) {
      if (cell.c <= colIdx && colIdx < cell.c + cell.cs) {
        cell.bgColor = color;
      }
    }
    refresh(g);
    setPasteMsg(`Фон столбца ${colIdx + 1} применён ко всем ячейкам столбца.`);
  };

  const handlePasteFromClipboard = async () => {
    setPasteMsg("");
    try {
      const g = await readClipboardAndParse();
      if (g) {
        setGrid(g);
        setInitRows(Math.min(24, g.length));
        setInitCols(Math.min(16, g[0]?.length ?? 0));
        setPasteMsg(`Вставлено: ${g.length}×${g[0]?.length ?? 0}.`);
      } else {
        setPasteMsg("В буфере нет таблицы: скопируйте область в Excel / Google Таблицы или HTML с таблицей со страницы.");
      }
    } catch (err) {
      setPasteMsg(err instanceof Error ? err.message : "Нет доступа к буферу обмена.");
    }
  };

  if (!open) return null;

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col p-0"
      style={{ background: "rgba(0,0,0,0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pricelist-table-builder-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full h-full min-h-0 max-h-[100dvh] flex flex-col overflow-hidden rounded-none shadow-xl"
        style={{ background: "var(--bg-primary)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 id="pricelist-table-builder-title" className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {isEditingExisting ? "Изменить таблицу" : "Таблица"}
          </h2>
          <button type="button" className="text-sm px-3 py-1.5 rounded-lg" style={{ color: "var(--text-secondary)" }} onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="px-4 py-3 space-y-3 overflow-y-auto overflow-x-auto flex-1 min-h-0">
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <div>
              <span className="block text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>
                Строк
              </span>
              <input
                type="number"
                min={1}
                max={24}
                value={initRows}
                onChange={(e) => setInitRows(Number(e.target.value) || 1)}
                className="w-20 px-2 py-1.5 rounded-lg border text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <span className="block text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>
                Столбцов
              </span>
              <input
                type="number"
                min={1}
                max={16}
                value={initCols}
                onChange={(e) => setInitCols(Number(e.target.value) || 1)}
                className="w-20 px-2 py-1.5 rounded-lg border text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              />
            </div>
            <button
              type="button"
              className="px-3 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--bg-secondary)", color: "var(--accent)", border: "1px solid var(--border)" }}
              onClick={() => setGrid(createGrid(Math.min(24, Math.max(1, initRows)), Math.min(16, Math.max(1, initCols))))}
            >
              Создать сетку заново
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              onClick={() => {
                if (selectedAnchor) {
                  refresh(insertRowAt(cloneGridRef(grid), selectedAnchor.r + selectedAnchor.rs));
                  return;
                }
                refresh(addRow(cloneGridRef(grid)));
              }}
            >
              + Строка рядом
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              onClick={() => {
                if (selectedAnchor) {
                  refresh(insertColAt(cloneGridRef(grid), selectedAnchor.c + selectedAnchor.cs));
                  return;
                }
                refresh(addCol(cloneGridRef(grid)));
              }}
            >
              + Столбец рядом
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--bg-secondary)", color: "var(--accent)", border: "1px solid var(--border)" }}
              onClick={() => void handlePasteFromClipboard()}
            >
              Вставить из буфера
            </button>
          </div>

          {pasteMsg ? (
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {pasteMsg}
            </p>
          ) : null}

          <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Можно вставить целиком из Excel / Google Таблиц (копирование ячеек) или HTML-таблицы со страницы — кнопка выше или Ctrl+V, когда фокус не в поле ячейки (до {MAX_PASTE_ROWS} строк и {MAX_PASTE_COLS} столбцов).
          </p>

          <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Выберите ячейку (левый верхний угол объединённой области). «Объединить →» и «Объединить ↓» сливают соседние ячейки одного размера по строке или столбцу. «Разделить» возвращает последний объединённый столбец или строку.
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Кнопки «+ Строка рядом» и «+ Столбец рядом» вставляют новую строку/столбец сразу после выбранной ячейки (или в конец, если ячейка не выбрана).
          </p>

          {selectedAnchor ? (
            <div
              className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl border p-3"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
            >
              <span className="text-xs font-semibold shrink-0" style={{ color: "var(--text-secondary)" }}>
                Формат:
              </span>
              <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(selectedAnchor.bold)}
                  onChange={(e) => patchCellFormat({ bold: e.target.checked })}
                />
                Жирный
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs">
                <span style={{ color: "var(--text-tertiary)" }}>Размер</span>
                <select
                  value={selectedAnchor.fontSizePx ?? 14}
                  onChange={(e) => patchCellFormat({ fontSizePx: Number(e.target.value) })}
                  className="rounded-lg border px-2 py-1 text-xs min-w-[4.5rem]"
                  style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                >
                  {FONT_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}px
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-flex items-center gap-2 text-xs">
                <span style={{ color: "var(--text-tertiary)" }}>Фон</span>
                <input
                  type="color"
                  value={
                    selectedAnchor.bgColor && /^#[0-9a-fA-F]{6}$/.test(selectedAnchor.bgColor)
                      ? selectedAnchor.bgColor
                      : "#ffffff"
                  }
                  onChange={(e) => patchCellFormat({ bgColor: e.target.value })}
                  className="h-8 w-12 cursor-pointer rounded border shrink-0"
                  style={{ borderColor: "var(--border)" }}
                  aria-label="Цвет фона ячейки"
                />
                <button
                  type="button"
                  className="text-xs underline shrink-0"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={() => patchCellFormat({ bgColor: undefined })}
                >
                  Сбросить фон
                </button>
              </label>
              <button
                type="button"
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium shrink-0"
                style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--border)" }}
                onClick={fillColumnBackground}
                title="Применить выбранный цвет фона ко всем ячейкам этого столбца"
              >
                Залить столбец
              </button>
            </div>
          ) : (
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              Кликните по ячейке — можно включить жирный текст, изменить размер шрифта и цвет фона; «Залить столбец» копирует текущий фон на весь столбец.
            </p>
          )}

          <div className="overflow-x-auto -mx-1 px-1">
            <table className="border-collapse w-full text-sm" style={{ borderColor: "var(--border)" }}>
              <tbody>
                {Array.from({ length: rows }).map((_, r) => (
                  <tr key={r}>
                    {Array.from({ length: cols }).map((__, c) => {
                      const cell = grid[r][c];
                      if (!cell) return null;
                      if (cell.r !== r || cell.c !== c) return null;
                      const canRight = c + cell.cs < cols && grid[r][c + cell.cs] != null;
                      const canDown = r + cell.rs < rows && grid[r + cell.rs][c] != null;
                      const neighborRight = canRight ? grid[r][c + cell.cs] : null;
                      const neighborDown = canDown ? grid[r + cell.rs][c] : null;
                      const canMergeRight =
                        neighborRight != null && neighborRight.r === r && neighborRight.c === c + cell.cs && neighborRight.rs === cell.rs;
                      const canMergeDown =
                        neighborDown != null && neighborDown.c === c && neighborDown.r === r + cell.rs && neighborDown.cs === cell.cs;
                      return (
                        <td
                          key={`${r}-${c}`}
                          rowSpan={cell.rs}
                          colSpan={cell.cs}
                          className="align-top border p-2 min-w-[7rem]"
                          style={{
                            borderColor:
                              selectedCell?.r === cell.r && selectedCell?.c === cell.c ? "var(--accent)" : "var(--border)",
                            background:
                              cell.bgColor && /^#[0-9a-fA-F]{6}$/.test(cell.bgColor)
                                ? cell.bgColor
                                : "var(--bg-secondary)",
                            boxShadow:
                              selectedCell?.r === cell.r && selectedCell?.c === cell.c
                                ? "inset 0 0 0 2px var(--accent)"
                                : undefined,
                          }}
                          onClick={() => setSelectedCell({ r: cell.r, c: cell.c })}
                        >
                          <textarea
                            value={cell.text}
                            onChange={(e) => setCellText(cell, e.target.value)}
                            className="w-full min-h-[3rem] max-h-[min(12rem,40vh)] text-sm rounded-lg px-2 py-1.5 mb-2 resize-y"
                            style={{
                              border: "1px solid var(--border)",
                              background: "var(--bg-primary)",
                              color: "var(--text-primary)",
                              fontWeight: cell.bold ? 700 : 400,
                              fontSize: `${cell.fontSizePx ?? 14}px`,
                            }}
                            placeholder="Текст"
                          />
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={!canMergeRight}
                              className="text-[11px] px-1.5 py-0.5 rounded disabled:opacity-40"
                              style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                              title="Объединить с ячейкой справа"
                              onClick={() => handleMergeRight(cell)}
                            >
                              Объединить →
                            </button>
                            <button
                              type="button"
                              disabled={!canMergeDown}
                              className="text-[11px] px-1.5 py-0.5 rounded disabled:opacity-40"
                              style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                              title="Объединить с ячейкой снизу"
                              onClick={() => handleMergeDown(cell)}
                            >
                              Объединить ↓
                            </button>
                            <button
                              type="button"
                              disabled={cell.cs <= 1}
                              className="text-[11px] px-1.5 py-0.5 rounded disabled:opacity-40"
                              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                              title="Разделить по столбцам (последний столбец)"
                              onClick={() => handleSplitH(cell)}
                            >
                              Разделить ↔
                            </button>
                            <button
                              type="button"
                              disabled={cell.rs <= 1}
                              className="text-[11px] px-1.5 py-0.5 rounded disabled:opacity-40"
                              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                              title="Разделить по строкам (последняя строка)"
                              onClick={() => handleSplitV(cell)}
                            >
                              Разделить ↕
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-4 py-3 flex flex-wrap justify-end gap-2 border-t" style={{ borderColor: "var(--border)" }}>
          <button type="button" className="px-4 py-2 rounded-xl text-sm" style={{ color: "var(--text-secondary)" }} onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
            onClick={() => {
              const html = serializeTableToHtml(grid);
              if (html) onInsert(html);
              onClose();
            }}
          >
            {isEditingExisting ? "Сохранить таблицу в описании" : "Вставить таблицу в описание"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
