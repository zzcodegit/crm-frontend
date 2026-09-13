/**
 * Иллюстрированные стикеры из /public/stickers (см. scripts/download-stickers.sh).
 * Источник: https://github.com/WhatsApp/stickers — sample packs Cuppy и Together While Apart.
 */

import manifest from "../../public/stickers/manifest.json";

export type ChatStickerDef = {
  id: string;
  label: string;
  file: string;
  packId: string;
};

export type ChatStickerPack = {
  id: string;
  title: string;
  stickers: ChatStickerDef[];
};

type ManifestSticker = { id: string; file: string; label: string };
type ManifestPack = { id: string; title: string; dir: string; stickers: ManifestSticker[] };

const STICKER_BY_ID = new Map<string, ChatStickerDef & { dir: string }>();

export const CHAT_STICKER_PACKS: ChatStickerPack[] = (manifest.packs as ManifestPack[]).map((pack) => ({
  id: pack.id,
  title: pack.title,
  stickers: pack.stickers.map((s) => {
    const def = { id: s.id, label: s.label, file: s.file, packId: pack.id };
    STICKER_BY_ID.set(s.id, { ...def, dir: pack.dir });
    return def;
  }),
}));

function stickerAssetPath(stickerId: string): string | null {
  const def = STICKER_BY_ID.get(stickerId);
  if (!def) return null;
  return `/stickers/${def.dir}/${def.file}`;
}

export function stickerPreviewUrl(stickerId: string): string | null {
  return stickerAssetPath(stickerId);
}

export async function chatStickerToFile(stickerId: string): Promise<File | null> {
  const def = STICKER_BY_ID.get(stickerId);
  const path = stickerAssetPath(stickerId);
  if (!def || !path) return null;

  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = blob.type || "image/webp";
    return new File([blob], `sticker-${stickerId}.webp`, { type });
  } catch {
    return null;
  }
}

export function isStickerUploadFile(file: File): boolean {
  return (file.name || "").toLowerCase().startsWith("sticker-");
}
