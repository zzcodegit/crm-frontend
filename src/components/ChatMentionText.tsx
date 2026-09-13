import type { ChatUserShortResponse } from "../api";
import { splitTextWithLinks } from "../utils/chatLinks";
import { splitTextWithMentions } from "../utils/chatMentions";

export default function ChatMentionText({
  text,
  className,
  style,
  mentionColor,
  linkColor,
  knownUsersByUsername,
  onMentionClick,
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  mentionColor?: string;
  linkColor?: string;
  knownUsersByUsername?: Map<string, ChatUserShortResponse>;
  /** Переход в личный чат с упомянутым пользователем */
  onMentionClick?: (username: string) => void;
}) {
  const parts = splitTextWithMentions(text);
  const accent = mentionColor ?? "var(--accent)";
  const linkStyleColor = linkColor ?? "var(--accent)";
  const clickable = Boolean(onMentionClick);

  const renderPlainText = (value: string, keyPrefix: string) =>
    splitTextWithLinks(value).map((lp, j) =>
      lp.type === "text" ? (
        <span key={`${keyPrefix}-t-${j}`}>{lp.value}</span>
      ) : (
        <a
          key={`${keyPrefix}-l-${j}`}
          href={lp.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline break-all"
          style={{ color: linkStyleColor, textUnderlineOffset: "2px" }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {lp.value}
        </a>
      ),
    );

  return (
    <span className={className} style={style}>
      {parts.map((p, i) =>
        p.type === "text" ? (
          <span key={i}>{renderPlainText(p.value, `p${i}`)}</span>
        ) : (
          <button
            key={i}
            type="button"
            className="font-semibold inline p-0 border-0 bg-transparent align-baseline"
            style={{
              color: accent,
              cursor: clickable ? "pointer" : "default",
              textDecoration: clickable ? "underline" : "none",
              textUnderlineOffset: "2px",
            }}
            title={
              clickable
                ? `Открыть чат: ${
                    knownUsersByUsername?.get(p.username.toLowerCase())?.display_name ?? p.username
                  }`
                : knownUsersByUsername?.get(p.username.toLowerCase())?.display_name ?? p.username
            }
            disabled={!clickable}
            onClick={(e) => {
              if (!clickable) return;
              e.stopPropagation();
              e.preventDefault();
              onMentionClick?.(p.username);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {p.value}
          </button>
        ),
      )}
    </span>
  );
}
