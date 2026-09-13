/** Автоссылки в тексте сообщений чата. */
export type ChatLinkPart = { type: "text"; value: string } | { type: "link"; value: string; href: string };

const CHAT_AUTOLINK_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;

const TRAILING_PUNCT_RE = /[.,;:!?)\]}>]+$/;

export function normalizeChatLinkHref(raw: string): string {
  const u = raw.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^www\./i.test(u)) return `https://${u}`;
  return `https://${u}`;
}

function splitUrlTrailingPunctuation(url: string): { core: string; trailing: string } {
  let core = url;
  let trailing = "";
  while (core.length > 0 && TRAILING_PUNCT_RE.test(core)) {
    const ch = core.slice(-1);
    if (ch === ")" && (core.match(/\(/g)?.length ?? 0) >= (core.match(/\)/g)?.length ?? 0)) {
      break;
    }
    trailing = ch + trailing;
    core = core.slice(0, -1);
  }
  return { core, trailing };
}

export function splitTextWithLinks(text: string): ChatLinkPart[] {
  if (!text) return [];
  const parts: ChatLinkPart[] = [];
  let last = 0;
  const re = new RegExp(CHAT_AUTOLINK_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    const raw = m[0];
    const { core, trailing } = splitUrlTrailingPunctuation(raw);
    if (core) {
      parts.push({ type: "link", value: core, href: normalizeChatLinkHref(core) });
    } else {
      parts.push({ type: "text", value: raw });
    }
    if (trailing) parts.push({ type: "text", value: trailing });
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.length ? parts : [{ type: "text", value: text }];
}
