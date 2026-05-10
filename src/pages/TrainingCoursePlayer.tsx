import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type TrainingBlock, type TrainingCourseLearnResponse, type TrainingQuizQuestion } from "../api";

function sortBlocks(blocks: TrainingBlock[]): TrainingBlock[] {
  return [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export default function TrainingCoursePlayer() {
  const { id } = useParams<{ id: string }>();
  const courseId = Number(id);
  const [data, setData] = useState<TrainingCourseLearnResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [quizBlockId, setQuizBlockId] = useState<string | null>(null);
  const [examOpen, setExamOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!Number.isFinite(courseId)) return;
    setErr("");
    api.training
      .courseLearn(courseId)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const payload = data?.payload;
  const progress = data?.progress;
  const avail = useMemo(() => new Set(data?.available_block_ids ?? []), [data?.available_block_ids]);
  const blocks = useMemo(() => sortBlocks(payload?.blocks ?? []), [payload?.blocks]);

  const passedQuiz = (bid: string) => Boolean(progress?.blocks_quiz_passed?.[bid]);
  const completed = (bid: string) => Boolean(progress?.blocks_completed?.[bid]);

  const openQuiz = (bid: string, timeLimit?: number | null) => {
    setQuizBlockId(bid);
    setAnswers({});
    setMsg(null);
    if (timeLimit && timeLimit > 0) {
      setDeadline(Date.now() + timeLimit * 1000);
    } else {
      setDeadline(null);
    }
  };

  useEffect(() => {
    if (!deadline || (!quizBlockId && !examOpen)) return;
    const t = setInterval(() => {
      if (Date.now() >= deadline) {
        setMsg({ ok: false, text: "Время вышло. Отправьте ответы или начните заново." });
        clearInterval(t);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, quizBlockId, examOpen]);

  const submitQuiz = async (blockId: string | null, isExam: boolean) => {
    if (!Number.isFinite(courseId)) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const r = await api.training.courseSubmitQuiz(courseId, {
        block_id: blockId ?? undefined,
        is_exam: isExam,
        answers,
      });
      setMsg({
        ok: r.passed,
        text: r.passed
          ? isExam
            ? "Экзамен сдан."
            : "Тест пройден."
          : `Не зачтено. Ошибок: ${r.wrong_count} из ${r.total}.`,
      });
      if (r.passed) {
        setQuizBlockId(null);
        setExamOpen(false);
        setAnswers({});
        load();
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setSubmitting(false);
    }
  };

  const completeBlock = async (bid: string) => {
    if (!Number.isFinite(courseId)) return;
    setSubmitting(true);
    try {
      await api.training.courseCompleteBlock(courseId, bid);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestion = (q: TrainingQuizQuestion) => {
    const v = answers[q.id];
    const setV = (val: string | string[]) => setAnswers((prev) => ({ ...prev, [q.id]: val }));

    if (q.type === "text" || q.type === "short_text") {
      return (
        <input
          type="text"
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
          value={typeof v === "string" ? v : ""}
          onChange={(e) => setV(e.target.value)}
          placeholder="Ответ"
        />
      );
    }
    if (q.type === "select") {
      const opts = q.options ?? [];
      return (
        <select
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{ borderColor: "var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
          value={typeof v === "string" ? v : ""}
          onChange={(e) => setV(e.target.value)}
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.text}
            </option>
          ))}
        </select>
      );
    }
    if (q.type === "multi" || q.type === "image_multi") {
      const chosen = Array.isArray(v) ? v : [];
      const toggle = (oid: string) => {
        const set = new Set(chosen);
        if (set.has(oid)) set.delete(oid);
        else set.add(oid);
        setV([...set]);
      };
      return (
        <div className="space-y-2">
          {(q.options ?? []).map((o) => (
            <label key={o.id} className="flex items-start gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={chosen.includes(o.id)} onChange={() => toggle(o.id)} />
              {o.image_url ? <img src={o.image_url} alt="" className="max-h-24 rounded border" /> : null}
              <span>{o.text}</span>
            </label>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {(q.options ?? []).map((o) => (
          <label key={o.id} className="flex items-start gap-2 cursor-pointer text-sm">
            <input
              type="radio"
              name={q.id}
              checked={v === o.id}
              onChange={() => setV(o.id)}
            />
            {o.image_url ? <img src={o.image_url} alt="" className="max-h-24 rounded border" /> : null}
            <span>{o.text}</span>
          </label>
        ))}
      </div>
    );
  };

  const activeQuiz = useMemo(() => {
    if (examOpen && payload?.final_exam) return { quiz: payload.final_exam, blockId: null as string | null };
    if (quizBlockId) {
      const b = blocks.find((x) => x.id === quizBlockId);
      if (b?.quiz) return { quiz: b.quiz, blockId: quizBlockId };
    }
    return null;
  }, [examOpen, payload?.final_exam, quizBlockId, blocks]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto animate-slide-in py-8" style={{ color: "var(--text-secondary)" }}>
        Загрузка курса…
      </div>
    );
  }
  if (err || !data || !payload) {
    return (
      <div className="max-w-5xl mx-auto p-6 rounded-xl" style={{ background: "var(--error-light)", color: "var(--error)" }}>
        {err || "Курс не найден"}
      </div>
    );
  }

  const cert = progress?.certificate_code
    ? {
        code: progress.certificate_code,
        issued_at: progress.certificate_issued_at,
        title: payload.certificate?.title || "Сертификат",
      }
    : null;

  const allBlocksDone = blocks.length > 0 && blocks.every((b) => completed(b.id));

  return (
    <div className="max-w-5xl mx-auto animate-slide-in space-y-6 pb-12">
      <Link to="/training" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
        ← К обучению
      </Link>
      <div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          {data.title}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {data.description}
        </p>
      </div>

      {cert && (
        <div className="rounded-2xl p-6 border border-dashed" style={{ borderColor: "var(--accent)", background: "var(--accent-light)" }}>
          <div className="font-bold text-lg mb-1" style={{ color: "var(--accent)" }}>
            {cert.title}
          </div>
          <div className="text-sm" style={{ color: "var(--text-primary)" }}>
            Номер: <span className="font-mono font-semibold">{cert.code}</span>
          </div>
          {cert.issued_at && (
            <div className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
              Выдан: {new Date(cert.issued_at).toLocaleString("ru-RU")}
            </div>
          )}
        </div>
      )}

      {blocks.map((b) => {
        const locked = !avail.has(b.id);
        const pq = passedQuiz(b.id);
        const done = completed(b.id);
        return (
          <section
            key={b.id}
            className="rounded-2xl p-5 sm:p-6 border"
            style={{
              borderColor: locked ? "var(--border)" : "var(--border)",
              background: "var(--bg-primary)",
              opacity: locked ? 0.65 : 1,
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                {b.title}
              </h2>
              {locked && <span className="text-xs px-2 py-1 rounded-full border" style={{ color: "var(--text-tertiary)" }}>Недоступен</span>}
              {done && <span className="text-xs px-2 py-1 rounded-full" style={{ background: "var(--success)", color: "#fff" }}>Блок завершён</span>}
            </div>
            {locked ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Чтобы открыть блок, завершите предыдущий и пройдите тест (если есть).
              </p>
            ) : (
              <>
                <div className="prose prose-sm max-w-none mb-4" dangerouslySetInnerHTML={{ __html: b.content_html }} />
                {(b.materials ?? []).map((m, i) => (
                  <div key={i} className="mb-4 p-4 rounded-xl" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <div className="font-medium text-sm mb-2" style={{ color: "var(--text-primary)" }}>
                      {m.title}
                    </div>
                    <div className="text-sm" dangerouslySetInnerHTML={{ __html: m.html }} />
                  </div>
                ))}
                {b.quiz && (b.quiz.questions?.length ?? 0) > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!pq ? (
                      <button
                        type="button"
                        onClick={() => openQuiz(b.id, b.quiz?.time_limit_sec)}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                        style={{ background: "var(--accent)" }}
                      >
                        Пройти тест блока
                      </button>
                    ) : (
                      <span className="text-sm font-medium" style={{ color: "var(--success)" }}>
                        Тест пройден
                      </span>
                    )}
                    {pq && !done && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => completeBlock(b.id)}
                        className="px-4 py-2 rounded-xl text-sm font-semibold border"
                        style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                      >
                        Завершить блок
                      </button>
                    )}
                  </div>
                )}
                {(!b.quiz || !(b.quiz.questions?.length ?? 0)) && !done && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => completeBlock(b.id)}
                    className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    Завершить блок
                  </button>
                )}
              </>
            )}
          </section>
        );
      })}

      {payload.final_exam && (payload.final_exam.questions?.length ?? 0) > 0 && (
        <section className="rounded-2xl p-5 border-2" style={{ borderColor: "var(--accent)", background: "var(--bg-primary)" }}>
          <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            Итоговый экзамен
          </h2>
          {!allBlocksDone ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Экзамен доступен после завершения всех блоков.
            </p>
          ) : progress?.exam_passed ? (
            <p className="text-sm font-medium" style={{ color: "var(--success)" }}>
              Экзамен сдан.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => {
                setExamOpen(true);
                setAnswers({});
                setMsg(null);
                const tl = payload.final_exam?.time_limit_sec;
                if (tl && tl > 0) setDeadline(Date.now() + tl * 1000);
                else setDeadline(null);
              }}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              Начать экзамен
            </button>
          )}
        </section>
      )}

      {(quizBlockId || examOpen) && activeQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="max-w-lg w-full max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-xl" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>
                {activeQuiz.quiz.title || (examOpen ? "Экзамен" : "Тест")}
              </h3>
              {deadline && (
                <span className="text-sm tabular-nums" style={{ color: "var(--error)" }}>
                  {Math.max(0, Math.floor((deadline - Date.now()) / 1000))} с
                </span>
              )}
            </div>
            <div className="space-y-6">
              {(activeQuiz.quiz.questions ?? []).map((q) => (
                <div key={q.id}>
                  {q.image_url && <img src={q.image_url} alt="" className="max-h-40 rounded mb-2 border" />}
                  <div className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                    {q.text}
                  </div>
                  {renderQuestion(q)}
                </div>
              ))}
            </div>
            {msg && (
              <p className={`mt-4 text-sm ${msg.ok ? "" : ""}`} style={{ color: msg.ok ? "var(--success)" : "var(--error)" }}>
                {msg.text}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-6">
              <button
                type="button"
                disabled={submitting}
                onClick={() => submitQuiz(examOpen ? null : quizBlockId, examOpen)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: "var(--accent)" }}
              >
                {submitting ? "Отправка…" : "Отправить ответы"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuizBlockId(null);
                  setExamOpen(false);
                  setDeadline(null);
                  setMsg(null);
                }}
                className="px-4 py-2 rounded-xl text-sm border"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
