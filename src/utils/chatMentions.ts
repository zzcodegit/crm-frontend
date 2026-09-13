import type { ChatUserShortResponse } from "../api";

/** Упоминание в тексте: @username (логин без пробелов). */
export const CHAT_MENTION_USERNAME_RE = /@([a-zA-Z0-9._-]+)/g;

export function mentionInsertToken(user: ChatUserShortResponse): string {
  const u = (user.username || "").trim();
  return u ? `@${u} ` : "";
}

export function parseMentionAtCaret(
  text: string,
  caret: number
): { start: number; end: number; query: string } | null {
  const pos = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, pos);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const query = before.slice(at + 1);
  if (query.includes(" ") || query.includes("\n") || query.includes("\t")) return null;
  return { start: at, end: pos, query };
}

export function filterUsersForMention(
  users: ChatUserShortResponse[],
  query: string,
  excludeUserId?: number
): ChatUserShortResponse[] {
  const q = query.trim().toLowerCase();
  let list = users.filter((u) => u.id !== excludeUserId && u.is_active !== false);
  if (!q) return list.slice(0, 12);
  return list
    .filter((u) => {
      const un = (u.username || "").toLowerCase();
      const dn = (u.display_name || "").toLowerCase();
      return un.includes(q) || dn.includes(q);
    })
    .slice(0, 12);
}

export type ChatMentionTextPart =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; username: string };

export function splitTextWithMentions(text: string): ChatMentionTextPart[] {
  if (!text) return [];
  const parts: ChatMentionTextPart[] = [];
  let last = 0;
  const re = new RegExp(CHAT_MENTION_USERNAME_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: "mention", value: m[0], username: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}
