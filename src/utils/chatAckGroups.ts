import type { ChatMessageItem } from "../api";

export type ChannelAckGroupInfo = {
  /** id первого сообщения в серии */
  anchorId: number;
  messageIds: number[];
  /** Показывать кнопку «Ознакомиться» / статистику только на этом сообщении */
  isLast: boolean;
};

/** Соседние сообщения канала с ack_required от одного автора — одна публикация. */
export function buildChannelAckGroups(messages: ChatMessageItem[]): Map<number, ChannelAckGroupInfo> {
  const map = new Map<number, ChannelAckGroupInfo>();
  let currentIds: number[] = [];
  let currentSender: number | null = null;

  const flush = () => {
    if (currentIds.length === 0) return;
    const anchorId = currentIds[0];
    const lastId = currentIds[currentIds.length - 1];
    const messageIds = [...currentIds];
    for (const id of currentIds) {
      map.set(id, { anchorId, messageIds, isLast: id === lastId });
    }
    currentIds = [];
    currentSender = null;
  };

  for (const m of messages) {
    const sid = m.sender?.id ?? null;
    const inAckSeries = Boolean(m.ack_required && !m.is_deleted && sid != null);

    if (inAckSeries && currentSender === sid) {
      currentIds.push(m.id);
      continue;
    }

    flush();
    if (inAckSeries) {
      currentSender = sid;
      currentIds = [m.id];
    }
  }

  flush();
  return map;
}
