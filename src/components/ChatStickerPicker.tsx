import { useMemo, useState } from "react";
import { CHAT_STICKER_PACKS, stickerPreviewUrl } from "../data/chatStickers";

export default function ChatStickerPicker({
  onPick,
  onClose,
  sending = false,
}: {
  onPick: (stickerId: string) => void | Promise<void>;
  onClose: () => void;
  sending?: boolean;
}) {
  const [packId, setPackId] = useState(CHAT_STICKER_PACKS[0]?.id ?? "");
  const activePack = useMemo(
    () => CHAT_STICKER_PACKS.find((p) => p.id === packId) ?? CHAT_STICKER_PACKS[0],
    [packId]
  );

  return (
    <div
      className="fixed inset-0 z-[150]"
      style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Стикеры"
    >
      <div
        className="absolute left-0 right-0 bottom-0 rounded-t-3xl flex flex-col"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderTop: "1px solid var(--border)",
          boxShadow: "0 -18px 60px rgba(0,0,0,0.28)",
          maxHeight: "52vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
          <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            Стикеры
          </div>
          <button
            type="button"
            className="p-2 rounded-xl"
            style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            onClick={onClose}
            aria-label="Закрыть"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto shrink-0">
          {CHAT_STICKER_PACKS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0"
              style={{
                backgroundColor: p.id === activePack?.id ? "var(--accent)" : "var(--bg-secondary)",
                color: p.id === activePack?.id ? "#fff" : "var(--text-secondary)",
                border: `1px solid ${p.id === activePack?.id ? "var(--accent)" : "var(--border)"}`,
              }}
              onClick={() => setPackId(p.id)}
            >
              {p.title}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-3 pb-4" data-allow-scroll>
          {sending ? (
            <div className="text-xs py-4 text-center" style={{ color: "var(--text-tertiary)" }}>
              Отправка…
            </div>
          ) : null}
          <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
            {(activePack?.stickers ?? []).map((s) => {
              const src = stickerPreviewUrl(s.id);
              if (!src) return null;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={sending}
                  className="aspect-square rounded-2xl p-1.5 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                  title={s.label}
                  aria-label={s.label}
                  onClick={() => void onPick(s.id)}
                >
                  <img src={src} alt="" className="w-full h-full object-contain" draggable={false} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
