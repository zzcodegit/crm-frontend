import { useState } from "react";
import type { ChatPoll } from "../api";

function pct(votes: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((votes / total) * 100);
}

export default function ChatPollBubble({
  poll,
  isMine,
  voting,
  onVote,
}: {
  poll: ChatPoll;
  isMine: boolean;
  voting?: boolean;
  onVote: (optionIds: number[]) => void | Promise<void>;
}) {
  const [pendingIds, setPendingIds] = useState<number[] | null>(null);
  const totalVotes = poll.options.reduce((s, o) => s + o.vote_count, 0);
  const hasVoted = poll.my_option_ids.length > 0;
  const showResults = hasVoted || isMine || totalVotes > 0;

  const toggle = async (optionId: number) => {
    if (voting) return;
    let next: number[];
    if (poll.allows_multiple) {
      const set = new Set(poll.my_option_ids);
      if (set.has(optionId)) set.delete(optionId);
      else set.add(optionId);
      next = Array.from(set);
    } else {
      if (poll.my_option_ids.includes(optionId)) {
        next = [];
      } else {
        next = [optionId];
      }
    }
    setPendingIds(next);
    try {
      await onVote(next);
    } finally {
      setPendingIds(null);
    }
  };

  const activeIds = pendingIds ?? poll.my_option_ids;

  return (
    <div className="mt-1">
      <div
        className="text-sm font-semibold mb-2 flex items-start gap-2"
        style={{ color: isMine ? "#fff" : "var(--text-primary)" }}
      >
        <span aria-hidden className="flex-shrink-0 opacity-80">
          📊
        </span>
        <span className="break-words">{poll.question}</span>
      </div>
      <div className="space-y-1.5">
        {poll.options.map((opt) => {
          const selected = activeIds.includes(opt.id);
          const percent = pct(opt.vote_count, totalVotes);
          return (
            <button
              key={opt.id}
              type="button"
              disabled={voting}
              onClick={() => void toggle(opt.id)}
              className="w-full text-left rounded-xl px-3 py-2 relative overflow-hidden transition-opacity"
              style={{
                opacity: voting ? 0.75 : 1,
                backgroundColor: isMine ? "rgba(255,255,255,0.12)" : "var(--bg-secondary)",
                border: `1px solid ${selected ? (isMine ? "rgba(255,255,255,0.45)" : "var(--accent)") : isMine ? "rgba(255,255,255,0.15)" : "var(--border)"}`,
                color: isMine ? "#fff" : "var(--text-primary)",
              }}
            >
              {showResults && totalVotes > 0 ? (
                <div
                  className="absolute inset-y-0 left-0 rounded-xl"
                  style={{
                    width: `${percent}%`,
                    backgroundColor: isMine ? "rgba(255,255,255,0.18)" : "rgba(87,157,255,0.14)",
                    pointerEvents: "none",
                  }}
                />
              ) : null}
              <div className="relative flex items-center justify-between gap-2">
                <span className="text-sm break-words pr-1">
                  {selected ? "✓ " : ""}
                  {opt.text}
                </span>
                {showResults && totalVotes > 0 ? (
                  <span className="text-xs flex-shrink-0 tabular-nums" style={{ opacity: 0.85 }}>
                    {percent}%
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
      <div
        className="text-[11px] mt-2"
        style={{ color: isMine ? "rgba(255,255,255,0.75)" : "var(--text-secondary)" }}
      >
        {poll.total_voters > 0
          ? `${poll.total_voters} ${poll.total_voters === 1 ? "голос" : poll.total_voters < 5 ? "голоса" : "голосов"}`
          : "Пока нет голосов"}
        {poll.allows_multiple ? " · можно несколько" : ""}
      </div>
    </div>
  );
}
