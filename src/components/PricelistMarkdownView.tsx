import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { useEffect, useState } from "react";
import { api } from "../api";

/** Разрешённые inline-стили для ячеек таблиц из конструктора прайса (см. PricelistTableBuilderModal). */
const PRICELIST_TD_STYLE_RE =
  /^font-weight:(400|700);font-size:(12|14|16|18|20)px(;background-color:#[0-9a-fA-F]{6})?$/;

const pricelistMarkdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    td: [...(defaultSchema.attributes?.td ?? []), ["style", PRICELIST_TD_STYLE_RE]],
    th: [...(defaultSchema.attributes?.th ?? []), ["style", PRICELIST_TD_STYLE_RE]],
  },
};

type Props = {
  source: string;
  className?: string;
};

function OfflineResolvedImage({ alt, src }: { alt?: string; src?: string }) {
  const original = src ?? "";
  const [resolvedSrc, setResolvedSrc] = useState(original);

  useEffect(() => {
    let cancelled = false;
    setResolvedSrc(original);
    if (!original) return;
    void (async () => {
      try {
        const offline = await api.pricelistOffline.resolveAssetUrl(original);
        if (!cancelled) setResolvedSrc(offline || original);
      } catch {
        if (!cancelled) setResolvedSrc(original);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [original]);

  return (
    <img
      src={resolvedSrc}
      alt={alt ?? ""}
      className="max-w-full rounded-xl my-3 object-contain"
      style={{ maxHeight: "min(28rem, 70vh)", border: "1px solid var(--border)" }}
      loading="lazy"
    />
  );
}

/**
 * Описание прайса RX: Markdown + безопасный HTML (таблицы с colspan/rowspan из конструктора).
 */
export default function PricelistMarkdownView({ source, className }: Props) {
  if (!source.trim()) return null;
  return (
    <div
      className={`pricelist-md text-sm leading-relaxed ${className ?? ""}`}
      style={{ color: "var(--text-secondary)" }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, pricelistMarkdownSanitizeSchema]]}
        components={{
          img: ({ alt, src }) => <OfflineResolvedImage alt={alt} src={src} />,
          a: ({ href, children }) => (
            <a href={href} className="underline font-medium" style={{ color: "var(--accent)" }} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
