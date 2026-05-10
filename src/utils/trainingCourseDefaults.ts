import type { TrainingCoursePayload, TrainingQuizQuestion, TrainingQuizSpec } from "../api";

export function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID().slice(0, 10)}`;
  return `${prefix}-${Date.now().toString(36)}`;
}

export function defaultQuestion(): TrainingQuizQuestion {
  return {
    id: newId("q"),
    type: "single",
    text: "Вопрос",
    options: [
      { id: "a", text: "Вариант 1" },
      { id: "b", text: "Вариант 2" },
    ],
    correct_option_ids: ["a"],
  };
}

export function emptyQuiz(title: string): TrainingQuizSpec {
  return {
    title,
    time_limit_sec: null,
    pass_mode: "errors",
    max_wrong: 0,
    min_percent: null,
    questions: [defaultQuestion()],
  };
}

export function defaultCoursePayload(): TrainingCoursePayload {
  return {
    version: 1,
    blocks: [
      {
        id: newId("blk"),
        title: "Блок 1",
        order: 0,
        content_html: "<p>Текст материала</p>",
        materials: [],
        opens_at: null,
        require_previous: true,
        quiz: null,
      },
    ],
    final_exam: null,
    certificate: { title: "Сертификат", subtitle: "об окончании курса" },
  };
}
