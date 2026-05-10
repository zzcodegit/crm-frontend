import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type TrainingBlock,
  type TrainingCoursePayload,
  type TrainingQuizSpec,
  type TrainingQuestionType,
} from "../api";
import { defaultCoursePayload, defaultQuestion, emptyQuiz, newId } from "../utils/trainingCourseDefaults";

const Q_TYPES: { v: TrainingQuestionType; label: string }[] = [
  { v: "single", label: "Один вариант" },
  { v: "multi", label: "Несколько вариантов" },
  { v: "select", label: "Выпадающий список" },
  { v: "text", label: "Текст (свободный)" },
  { v: "short_text", label: "Короткий ответ" },
  { v: "image_single", label: "Картинка + один" },
  { v: "image_multi", label: "Картинка + несколько" },
];

type BuilderTab = "meta" | "blocks" | "exam";

export default function TrainingCourseBuilder() {
  const { id } = useParams<{ id: string }>();
  const editId = id && id !== "new" ? Number(id) : NaN;
  const isNew = !Number.isFinite(editId);
  const navigate = useNavigate();

  const [title, setTitle] = useState("Новый курс");
  const [description, setDescription] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [published, setPublished] = useState(false);
  const [payload, setPayload] = useState<TrainingCoursePayload>(defaultCoursePayload);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [activeTab, setActiveTab] = useState<BuilderTab>("meta");
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    api.training
      .courseGetAdmin(editId)
      .then((c) => {
        setTitle(c.title);
        setDescription(c.description || "");
        setPreviewUrl(c.preview_image_url || "");
        setPublished(c.is_published);
        setPayload(c.payload && c.payload.blocks ? c.payload : defaultCoursePayload());
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, [editId, isNew]);

  const updateBlock = (i: number, patch: Partial<TrainingBlock>) => {
    setPayload((p) => {
      const blocks = [...(p.blocks || [])];
      blocks[i] = { ...blocks[i], ...patch };
      return { ...p, blocks };
    });
  };

  const addBlock = () => {
    setPayload((p) => {
      const nextBlocks = [
        ...(p.blocks || []),
        {
          id: newId("blk"),
          title: `Блок ${(p.blocks?.length ?? 0) + 1}`,
          order: p.blocks?.length ?? 0,
          content_html: "<p></p>",
          materials: [],
          opens_at: null,
          require_previous: true,
          quiz: null,
        },
      ];
      setActiveBlockIndex(nextBlocks.length - 1);
      return { ...p, blocks: nextBlocks };
    });
  };

  const removeBlock = (i: number) => {
    setPayload((p) => {
      const next = (p.blocks || []).filter((_, j) => j !== i);
      let nextIndex = activeBlockIndex;
      if (nextIndex >= next.length) nextIndex = Math.max(0, next.length - 1);
      setActiveBlockIndex(nextIndex);
      return { ...p, blocks: next };
    });
  };

  const setBlockQuiz = (i: number, quiz: TrainingQuizSpec | null) => {
    updateBlock(i, { quiz });
  };

  const save = async () => {
    setErr("");
    setSaving(true);
    try {
      if (isNew) {
        const c = await api.training.courseCreate({
          title: title.trim(),
          description,
          preview_image_url: previewUrl || null,
          is_published: published,
          payload,
        });
        navigate(`/training/course/${c.id}/edit`, { replace: true });
      } else {
        await api.training.courseUpdate(editId, {
          title: title.trim(),
          description,
          preview_image_url: previewUrl || null,
          is_published: published,
          payload,
        });
        navigate("/training");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="max-w-5xl mx-auto py-12" style={{ color: "var(--text-secondary)" }}>Загрузка…</div>;
  }

  const blocks = payload.blocks || [];
  const hasBlocks = blocks.length > 0;
  const currentBlock = hasBlocks ? blocks[Math.min(activeBlockIndex, blocks.length - 1)] : null;

  return (
    <div className="max-w-6xl mx-auto animate-slide-in space-y-6 pb-16">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <Link to="/training" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
          ← К обучению
        </Link>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {saving ? "Сохранение…" : isNew ? "Создать курс" : "Сохранить"}
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            {isNew ? "Новый курс" : "Редактирование курса"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Сначала заполните карточку курса, затем контент блоков и итоговый экзамен.
          </p>
        </div>
      </div>

      <div className="inline-flex gap-2 rounded-2xl p-1 bg-[var(--bg-secondary)] border" style={{ borderColor: "var(--border)" }}>
        {[
          { id: "meta", label: "1. Карточка курса" },
          { id: "blocks", label: "2. Блоки и тесты" },
          { id: "exam", label: "3. Итоговый экзамен" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id as BuilderTab)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: activeTab === t.id ? "var(--bg-primary)" : "transparent",
              color: activeTab === t.id ? "var(--text-primary)" : "var(--text-secondary)",
              border: activeTab === t.id ? "1px solid var(--border-color)" : "1px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="p-3 rounded-xl text-sm" style={{ background: "var(--error-light)", color: "var(--error)" }}>
          {err}
        </div>
      )}
      {activeTab === "meta" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)]">
          <div className="rounded-2xl p-5 space-y-4 border" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
            <label className="block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Название
            </label>
            <input
              className="w-full px-3 py-2 rounded-xl border text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <label className="block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Краткое описание
            </label>
            <textarea
              className="w-full px-3 py-2 rounded-xl border text-sm min-h-[80px]"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <label className="block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              URL картинки анонса
            </label>
            <input
              className="w-full px-3 py-2 rounded-xl border text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              value={previewUrl}
              onChange={(e) => setPreviewUrl(e.target.value)}
              placeholder="https://…"
            />
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
              Опубликован (виден в списке курсов)
            </label>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl p-5 space-y-2 border" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
              <div className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                Сертификат
              </div>
              <input
                className="w-full px-3 py-2 rounded-xl border text-sm mb-2"
                placeholder="Заголовок на сертификате"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                value={payload.certificate?.title || ""}
                onChange={(e) =>
                  setPayload((p) => ({ ...p, certificate: { ...p.certificate, title: e.target.value, subtitle: p.certificate?.subtitle } }))
                }
              />
              <input
                className="w-full px-3 py-2 rounded-xl border text-sm"
                placeholder="Подзаголовок / описание"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                value={payload.certificate?.subtitle || ""}
                onChange={(e) =>
                  setPayload((p) => ({ ...p, certificate: { title: p.certificate?.title || "", subtitle: e.target.value } }))
                }
              />
              <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
                Эти тексты будут напечатаны на PDF-сертификате после успешного экзамена.
              </p>
            </div>
            <div className="rounded-2xl p-4 text-xs border" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
              <div className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                Подсказка
              </div>
              <p>Сначала настройте название, описание и сертификат. После сохранения курс появится в списке, но только опубликованные курсы видны ученикам.</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "blocks" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]">
          <div className="rounded-2xl p-4 border flex flex-col gap-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Блоки курса
              </h2>
              <button
                type="button"
                onClick={addBlock}
                className="text-xs font-medium px-3 py-1.5 rounded-xl border"
                style={{ color: "var(--accent)", borderColor: "var(--border)" }}
              >
                + Блок
              </button>
            </div>
            {hasBlocks ? (
              <div className="space-y-1 max-h-[420px] overflow-auto pr-1">
                {blocks
                  .slice()
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map((b) => {
                    const index = blocks.findIndex((x) => x.id === b.id);
                    const isActive = index === activeBlockIndex;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setActiveBlockIndex(index)}
                        className="w-full text-left rounded-xl px-3 py-2 text-xs transition-colors"
                        style={{
                          background: isActive ? "var(--bg-secondary)" : "transparent",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold truncate">
                            {b.title || `Блок ${index + 1}`}
                          </span>
                          <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                            #{b.order ?? index}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                          {b.require_previous && <span className="px-1.5 py-0.5 rounded-full border border-dashed">по порядку</span>}
                          {b.opens_at && <span className="px-1.5 py-0.5 rounded-full border border-dashed">отложен</span>}
                          {b.quiz && <span className="px-1.5 py-0.5 rounded-full border border-dashed">тест</span>}
                        </div>
                      </button>
                    );
                  })}
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Пока нет ни одного блока. Добавьте первый блок, чтобы настроить материалы и тест.
              </p>
            )}
          </div>

          <div className="space-y-4">
            {currentBlock ? (
              <div className="rounded-2xl p-5 border space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
                <div className="flex flex-wrap gap-2 justify-between items-start">
                  <input
                    className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border font-semibold"
                    style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                    value={currentBlock.title}
                    onChange={(e) => updateBlock(activeBlockIndex, { title: e.target.value })}
                    placeholder="Название блока (например, «Введение»)"
                  />
                  <button type="button" className="text-sm text-red-600" onClick={() => removeBlock(activeBlockIndex)}>
                    Удалить блок
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      Порядок
                    </label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 rounded-xl border text-sm"
                      style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                      value={currentBlock.order}
                      onChange={(e) => updateBlock(activeBlockIndex, { order: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      Открыт с (дата/время, пусто — без отложенного старта)
                    </label>
                    <input
                      type="datetime-local"
                      className="w-full px-3 py-2 rounded-xl border text-sm"
                      style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                      value={currentBlock.opens_at ? currentBlock.opens_at.slice(0, 16) : ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateBlock(activeBlockIndex, { opens_at: v ? new Date(v).toISOString() : null });
                      }}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentBlock.require_previous}
                    onChange={(e) => updateBlock(activeBlockIndex, { require_previous: e.target.checked })}
                  />
                  Нельзя открыть, пока не завершён предыдущий блок
                </label>
                <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>
                  Материал (HTML)
                </label>
                <textarea
                  className="w-full px-3 py-2 rounded-xl border text-sm font-mono min-h-[160px]"
                  style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                  value={currentBlock.content_html}
                  onChange={(e) => updateBlock(activeBlockIndex, { content_html: e.target.value })}
                  placeholder="<h2>Заголовок</h2><p>Текст блока…</p>"
                />

                <div className="border-t pt-3 mt-2 space-y-2" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                      Тест блока
                    </span>
                    {!currentBlock.quiz ? (
                      <button
                        type="button"
                        className="text-sm px-3 py-1.5 rounded-lg border"
                        style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                        onClick={() => setBlockQuiz(activeBlockIndex, emptyQuiz("Контрольный тест"))}
                      >
                        Добавить тест
                      </button>
                    ) : (
                      <button type="button" className="text-sm text-red-600" onClick={() => setBlockQuiz(activeBlockIndex, null)}>
                        Убрать тест
                      </button>
                    )}
                  </div>
                  {currentBlock.quiz && (
                    <QuizEditor
                      quiz={currentBlock.quiz}
                      onChange={(q) => setBlockQuiz(activeBlockIndex, q)}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl p-5 border" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Добавьте хотя бы один блок, чтобы редактировать материалы и тесты.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "exam" && (
        <div className="rounded-2xl p-5 border space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
          <div className="flex justify-between items-center mb-2">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Итоговый экзамен
              </h2>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                Проходит после всех блоков. По результату выдаётся сертификат.
              </p>
            </div>
            {!payload.final_exam ? (
              <button
                type="button"
                className="text-sm px-3 py-2 rounded-xl border"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                onClick={() => setPayload((p) => ({ ...p, final_exam: emptyQuiz("Экзамен") }))}
              >
                Добавить экзамен
              </button>
            ) : (
              <button
                type="button"
                className="text-sm text-red-600"
                onClick={() => setPayload((p) => ({ ...p, final_exam: null }))}
              >
                Убрать экзамен
              </button>
            )}
          </div>
          {payload.final_exam && (
            <QuizEditor quiz={payload.final_exam} onChange={(q) => setPayload((p) => ({ ...p, final_exam: q }))} />
          )}
        </div>
      )}
    </div>
  );
}

function QuizEditor({ quiz, onChange }: { quiz: TrainingQuizSpec; onChange: (q: TrainingQuizSpec) => void }) {
  const setQ = (patch: Partial<TrainingQuizSpec>) => onChange({ ...quiz, ...patch });

  return (
    <div className="space-y-3">
      <input
        className="w-full px-3 py-2 rounded-xl border text-sm"
        placeholder="Название теста"
        style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
        value={quiz.title || ""}
        onChange={(e) => setQ({ title: e.target.value })}
      />
      <div className="grid sm:grid-cols-3 gap-2">
        <div>
          <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Лимит времени (сек), пусто — без лимита
          </label>
          <input
            type="number"
            className="w-full px-3 py-2 rounded-xl border text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
            value={quiz.time_limit_sec ?? ""}
            onChange={(e) => setQ({ time_limit_sec: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
        <div>
          <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Режим зачёта
          </label>
          <select
            className="w-full px-3 py-2 rounded-xl border text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
            value={quiz.pass_mode || "errors"}
            onChange={(e) => setQ({ pass_mode: e.target.value as "errors" | "percent" })}
          >
            <option value="errors">По числу ошибок</option>
            <option value="percent">По проценту верных</option>
          </select>
        </div>
        {quiz.pass_mode === "percent" ? (
          <div>
            <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Мин. % верных
            </label>
            <input
              type="number"
              className="w-full px-3 py-2 rounded-xl border text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
              value={quiz.min_percent ?? 70}
              onChange={(e) => setQ({ min_percent: Number(e.target.value) })}
            />
          </div>
        ) : (
          <div>
            <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Макс. ошибок (включительно)
            </label>
            <input
              type="number"
              className="w-full px-3 py-2 rounded-xl border text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
              value={quiz.max_wrong ?? 0}
              onChange={(e) => setQ({ max_wrong: Number(e.target.value) })}
            />
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Вопросы
        </span>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded-lg border"
          style={{ borderColor: "var(--border)" }}
          onClick={() => onChange({ ...quiz, questions: [...(quiz.questions || []), defaultQuestion()] })}
        >
          + Вопрос
        </button>
      </div>

      {(quiz.questions || []).map((qu, qi) => (
        <div key={qu.id} className="p-3 rounded-xl border space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
          <div className="flex flex-wrap gap-2 justify-between">
            <select
              className="text-sm px-2 py-1 rounded-lg border"
              style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
              value={qu.type}
              onChange={(e) =>
                onChange({
                  ...quiz,
                  questions: (quiz.questions || []).map((x, j) =>
                    j === qi ? { ...x, type: e.target.value as TrainingQuestionType } : x
                  ),
                })
              }
            >
              {Q_TYPES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="text-xs text-red-600"
              onClick={() =>
                onChange({
                  ...quiz,
                  questions: (quiz.questions || []).filter((_, j) => j !== qi),
                })
              }
            >
              Удалить вопрос
            </button>
          </div>
          <textarea
            className="w-full px-2 py-1 rounded-lg border text-sm"
            placeholder="Текст вопроса"
            style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
            value={qu.text}
            onChange={(e) =>
              onChange({
                ...quiz,
                questions: (quiz.questions || []).map((x, j) => (j === qi ? { ...x, text: e.target.value } : x)),
              })
            }
          />
          <input
            className="w-full px-2 py-1 rounded-lg border text-xs"
            placeholder="URL картинки к вопросу (необязательно)"
            style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
            value={qu.image_url || ""}
            onChange={(e) =>
              onChange({
                ...quiz,
                questions: (quiz.questions || []).map((x, j) => (j === qi ? { ...x, image_url: e.target.value || null } : x)),
              })
            }
          />
          {["single", "multi", "select", "image_single", "image_multi"].includes(qu.type) && (
            <div className="space-y-1">
              {(qu.options || []).map((op, oi) => (
                <div key={op.id} className="flex gap-2 items-center">
                  <input
                    className="flex-1 px-2 py-1 rounded border text-xs"
                    style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                    value={op.text}
                    onChange={(e) => {
                      const options = [...(qu.options || [])];
                      options[oi] = { ...options[oi], text: e.target.value };
                      onChange({
                        ...quiz,
                        questions: (quiz.questions || []).map((x, j) => (j === qi ? { ...x, options } : x)),
                      });
                    }}
                  />
                  <label className="text-xs flex items-center gap-1 shrink-0">
                    <input
                      type="checkbox"
                      checked={(qu.correct_option_ids || []).includes(op.id)}
                      onChange={() => {
                        const cur = new Set(qu.correct_option_ids || []);
                        if (qu.type === "single" || qu.type === "select" || qu.type === "image_single") {
                          cur.clear();
                          cur.add(op.id);
                        } else {
                          if (cur.has(op.id)) cur.delete(op.id);
                          else cur.add(op.id);
                        }
                        onChange({
                          ...quiz,
                          questions: (quiz.questions || []).map((x, j) =>
                            j === qi ? { ...x, correct_option_ids: [...cur] } : x
                          ),
                        });
                      }}
                    />
                    верно
                  </label>
                </div>
              ))}
              <button
                type="button"
                className="text-xs"
                style={{ color: "var(--accent)" }}
                onClick={() => {
                  const oid = newId("opt");
                  const options = [...(qu.options || []), { id: oid, text: "Вариант" }];
                  onChange({
                    ...quiz,
                    questions: (quiz.questions || []).map((x, j) => (j === qi ? { ...x, options } : x)),
                  });
                }}
              >
                + вариант
              </button>
            </div>
          )}
          {["text", "short_text"].includes(qu.type) && (
            <input
              className="w-full px-2 py-1 rounded border text-sm"
              placeholder="Правильный ответ (для автопроверки)"
              style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
              value={qu.correct_text || ""}
              onChange={(e) =>
                onChange({
                  ...quiz,
                  questions: (quiz.questions || []).map((x, j) => (j === qi ? { ...x, correct_text: e.target.value } : x)),
                })
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}
