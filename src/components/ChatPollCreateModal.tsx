import { useState } from "react";

export type ChatPollCreatePayload = {
  question: string;
  options: string[];
  allows_multiple: boolean;
};

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

export default function ChatPollCreateModal({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: ChatPollCreatePayload) => void | Promise<void>;
  submitting?: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowsMultiple, setAllowsMultiple] = useState(false);

  if (!open) return null;

  const reset = () => {
    setQuestion("");
    setOptions(["", ""]);
    setAllowsMultiple(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, ""]);
  };

  const removeOption = (idx: number) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    const q = question.trim();
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!q) {
      window.alert("Введите вопрос опроса");
      return;
    }
    if (opts.length < MIN_OPTIONS) {
      window.alert(`Добавьте минимум ${MIN_OPTIONS} варианта ответа`);
      return;
    }
    await onSubmit({ question: q, options: opts, allows_multiple: allowsMultiple });
    reset();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={handleClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Новый опрос
          </h3>
          <button
            type="button"
            className="p-2 rounded-xl"
            style={{ color: "var(--text-secondary)" }}
            onClick={handleClose}
            disabled={submitting}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
          Вопрос
        </label>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="Например: Когда встречаемся?"
          className="w-full rounded-xl px-3 py-2.5 text-sm mb-4"
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
          disabled={submitting}
        />

        <div className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
          Варианты ответа
        </div>
        <div className="space-y-2 mb-3">
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={opt}
                onChange={(e) => {
                  const v = e.target.value;
                  setOptions((prev) => prev.map((o, i) => (i === idx ? v : o)));
                }}
                maxLength={200}
                placeholder={`Вариант ${idx + 1}`}
                className="flex-1 rounded-xl px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                disabled={submitting}
              />
              {options.length > MIN_OPTIONS ? (
                <button
                  type="button"
                  className="p-2 rounded-xl flex-shrink-0"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={() => removeOption(idx)}
                  disabled={submitting}
                  aria-label="Удалить вариант"
                >
                  −
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {options.length < MAX_OPTIONS ? (
          <button
            type="button"
            className="text-sm font-medium mb-4"
            style={{ color: "var(--accent)" }}
            onClick={addOption}
            disabled={submitting}
          >
            + Добавить вариант
          </button>
        ) : null}

        <label className="flex items-start gap-2 mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={allowsMultiple}
            onChange={(e) => setAllowsMultiple(e.target.checked)}
            disabled={submitting}
            className="mt-0.5"
          />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Можно выбрать несколько вариантов
          </span>
        </label>

        <button
          type="button"
          className="w-full py-3 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--accent)", opacity: submitting ? 0.7 : 1 }}
          onClick={() => void handleSubmit()}
          disabled={submitting}
        >
          {submitting ? "Отправка…" : "Создать опрос"}
        </button>
      </div>
    </div>
  );
}
