import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type TrainingArticleItem, type TrainingCourseRow } from "../api";
import { useAuth } from "../contexts/AuthContext";

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Training() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.is_admin === true;
  const [tab, setTab] = useState<"articles" | "courses">("articles");
  const [articles, setArticles] = useState<TrainingArticleItem[]>([]);
  const [courses, setCourses] = useState<TrainingCourseRow[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("Все");
  const [loading, setLoading] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.training.list();
      setArticles(list);
    } finally {
      setLoading(false);
    }
  };

  const loadCourses = async () => {
    setLoadingCourses(true);
    try {
      const list = isAdmin ? await api.training.coursesAdminAll() : await api.training.coursesList();
      setCourses(list);
    } catch {
      setCourses([]);
    } finally {
      setLoadingCourses(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadCourses();
  }, [isAdmin]);

  const sections = useMemo(() => {
    const uniq = Array.from(new Set(articles.map((x) => (x.section || "Общее").trim() || "Общее")));
    return ["Все", ...uniq];
  }, [articles]);
  const filtered = useMemo(() => {
    if (selectedSection === "Все") return articles;
    return articles.filter((x) => (x.section || "Общее") === selectedSection);
  }, [articles, selectedSection]);

  const deleteArticle = async (id: number) => {
    if (!window.confirm("Удалить статью?")) return;
    await api.training.delete(id);
    await load();
  };

  const deleteCourse = async (id: number) => {
    if (!window.confirm("Удалить курс и весь прогресс пользователей?")) return;
    await api.training.courseDelete(id);
    await loadCourses();
  };

  return (
    <div className="max-w-6xl mx-auto animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Обучение</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Курсы со структурой, тестами и сертификатом; статьи и инструкции</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate("/training/course/new")}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              + Курс
            </button>
            <button
              type="button"
              onClick={() => navigate("/training/new")}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              + Статья
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab("articles")}
          className="px-4 py-2 rounded-xl text-sm font-semibold border"
          style={{
            background: tab === "articles" ? "var(--accent-light)" : "var(--bg-primary)",
            borderColor: tab === "articles" ? "var(--accent)" : "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          Статьи
        </button>
        <button
          type="button"
          onClick={() => setTab("courses")}
          className="px-4 py-2 rounded-xl text-sm font-semibold border"
          style={{
            background: tab === "courses" ? "var(--accent-light)" : "var(--bg-primary)",
            borderColor: tab === "courses" ? "var(--accent)" : "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          Курсы
        </button>
      </div>

      {tab === "courses" && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>Курсы</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {loadingCourses ? (
              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Загрузка…</div>
            ) : courses.length === 0 ? (
              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {isAdmin ? "Создайте курс — кнопка «+ Курс»" : "Пока нет опубликованных курсов"}
              </div>
            ) : (
              courses.map((c) => (
                <div
                  key={c.id}
                  className="text-left rounded-2xl overflow-hidden border transition-all"
                  style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => (c.is_published || isAdmin ? navigate(`/training/course/${c.id}`) : undefined)}
                    disabled={!c.is_published && !isAdmin}
                  >
                    <div className="h-36 w-full" style={{ background: "var(--bg-tertiary)" }}>
                      {c.preview_image_url ? (
                        <img src={c.preview_image_url} alt={c.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: "var(--text-tertiary)" }}>
                          Курс
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      {!c.is_published && isAdmin && (
                        <div className="text-[10px] font-bold uppercase mb-1" style={{ color: "var(--text-tertiary)" }}>Черновик</div>
                      )}
                      <div className="font-semibold text-sm line-clamp-2" style={{ color: "var(--text-primary)" }}>{c.title}</div>
                      <div className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{c.description || "—"}</div>
                      <div className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>{fmtDate(c.updated_at)}</div>
                    </div>
                  </button>
                  {isAdmin && (
                    <div className="px-3 pb-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/training/course/${c.id}/edit`)}
                        className="px-2.5 py-1.5 rounded-lg text-xs"
                        style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                      >
                        Редактор
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteCourse(c.id)}
                        className="px-2.5 py-1.5 rounded-lg text-xs"
                        style={{ background: "var(--error-light)", border: "1px solid var(--error)", color: "var(--error)" }}
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "articles" && (
        <>
      <div className="rounded-2xl p-4 mb-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>Разделы</div>
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSelectedSection(s)}
              className="px-3 py-2 rounded-xl text-sm border"
              style={{
                background: selectedSection === s ? "var(--accent-light)" : "var(--bg-secondary)",
                borderColor: selectedSection === s ? "rgba(0,82,204,0.3)" : "var(--border)",
                color: "var(--text-primary)",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>Статьи</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {loading ? (
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Загрузка…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>В этом разделе пока нет статей</div>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/training/${a.id}`)}
                className="text-left rounded-2xl overflow-hidden border transition-all"
                style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
              >
                <div className="h-40 w-full" style={{ background: "var(--bg-tertiary)" }}>
                  {a.preview_image_url ? (
                    <img src={a.preview_image_url} alt={a.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: "var(--text-tertiary)" }}>
                      Без картинки
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="text-[11px] mb-1 font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                    {(a.section || "Общее").trim() || "Общее"}
                  </div>
                  <div className="font-semibold text-sm line-clamp-2" style={{ color: "var(--text-primary)" }}>{a.title}</div>
                  <div className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>{fmtDate(a.updated_at)}</div>
                  {isAdmin && (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/training/${a.id}/edit`);
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs"
                        style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await deleteArticle(a.id);
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs"
                        style={{ background: "var(--error-light)", border: "1px solid var(--error)", color: "var(--error)" }}
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
        </>
      )}

    </div>
  );
}
