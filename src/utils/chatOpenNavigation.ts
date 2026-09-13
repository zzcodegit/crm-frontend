/** Параметры deep-link для открытия чата в боковой панели (не на /chat). */
export type ChatOpenTarget = {
  kind: "general" | "private" | "group" | "bot";
  dialogId?: number;
  messageId?: number;
  userId?: number;
  username?: string;
  threadUserId?: number;
  nonce: number;
};

const CHAT_OPEN_KEYS = ["openChat", "chatType", "dialogId", "messageId", "threadUserId", "userId", "username"] as const;

export function buildChatOpenSearchParams(data: Record<string, string | undefined | null>): URLSearchParams {
  const params = new URLSearchParams();
  params.set("openChat", "1");
  const chatType = (data.chatType || data.chat_type || "").trim();
  if (chatType) params.set("chatType", chatType);
  if (data.dialogId) params.set("dialogId", String(data.dialogId));
  if (data.messageId) params.set("messageId", String(data.messageId));
  if (data.threadUserId) params.set("threadUserId", String(data.threadUserId));
  if (data.userId) params.set("userId", String(data.userId));
  if (data.username) params.set("username", String(data.username));
  return params;
}

export function buildChatOpenPath(data: Record<string, string | undefined | null>): string {
  const qs = buildChatOpenSearchParams(data).toString();
  return qs ? `/?${qs}` : "/?openChat=1";
}

/** Есть ли в target конкретный чат (не просто «открыть панель»). */
export function hasSpecificChatOpenTarget(
  target: Omit<ChatOpenTarget, "nonce"> | null | undefined
): boolean {
  if (!target) return false;
  if (target.messageId) return true;
  if (target.kind === "group" && target.dialogId) return true;
  if (target.kind === "private" && (target.dialogId || target.userId || target.username)) return true;
  if (target.kind === "bot" && target.threadUserId) return true;
  return false;
}

export function parseChatOpenTarget(search: string | URLSearchParams): Omit<ChatOpenTarget, "nonce"> | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  if (params.get("openChat") !== "1") return null;

  const hasAny =
    params.get("chatType") ||
    params.get("dialogId") ||
    params.get("messageId") ||
    params.get("threadUserId") ||
    params.get("userId") ||
    params.get("username");
  if (!hasAny) return null;

  const num = (key: string) => {
    const v = Number(params.get(key));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };

  const username = params.get("username")?.trim() || undefined;
  const userId = num("userId");
  const chatTypeParam = params.get("chatType")?.trim().toLowerCase();
  const rawKind = chatTypeParam || (userId || username ? "private" : "general");
  const kind =
    rawKind === "private" || rawKind === "group" || rawKind === "bot" || rawKind === "general"
      ? rawKind
      : userId || username
        ? "private"
        : "general";

  return {
    kind,
    dialogId: num("dialogId"),
    messageId: num("messageId"),
    threadUserId: num("threadUserId"),
    userId,
    username,
  };
}

/** Убирает параметры открытия чата из адресной строки. */
export function stripChatOpenParams(search: string | URLSearchParams): string {
  const params = typeof search === "string" ? new URLSearchParams(search) : new URLSearchParams(search.toString());
  for (const key of CHAT_OPEN_KEYS) {
    params.delete(key);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
