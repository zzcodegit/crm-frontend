import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type NormativeActItem } from "../api";
import { useAuth } from "../contexts/AuthContext";

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function NormativeActs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.is_admin === true;
  const [items, setItems] = useState<NormativeActItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState<string>("Все");

  const load = async () => {
    setLoading(true);
    try {
      setItems(await api.normativeActs.list());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const sections = useMemo(() => {
    const uniq = Array.from(new Set(items.map((x) => (x.section || "Общее").trim() || "Общее")));
    return ["Все", ...uniq];
  }, [items]);
  const filtered = useMemo(() => {
    if (selectedSection === "Все") return items;
    return items.filter((x) => (x.section || "Общее") === selectedSection);
  }, [items, selectedSection]);

  const deleteItem = async (id: number) => {
    if (!window.confirm("Удалить нормативный акт?")) return;
    await api.normativeActs.delete(id);
    await load();
  };

  return (
    <div className="max-w-6xl mx-auto animate-slide-in">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Нормативные акты</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Документы для обязательного ознакомления и подписи</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button type="button" onClick={() => navigate("/normative-acts/report")} className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
              Отчет по подписям
            </button>
            <button type="button" onClick={() => navigate("/normative-acts/new")} className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "var(--accent)", color: "#fff" }}>
              + Создать документ
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl p-4 mb-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>Разделы</div>
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <button key={s} type="button" onClick={() => setSelectedSection(s)} className="px-3 py-2 rounded-xl text-sm border" style={{ background: selectedSection === s ? "var(--accent-light)" : "var(--bg-secondary)", borderColor: selectedSection === s ? "rgba(0,82,204,0.3)" : "var(--border)", color: "var(--text-primary)" }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>Документы</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {loading ? (
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Загрузка…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Пока нет документов</div>
          ) : (
            filtered.map((a) => (
              <button key={a.id} type="button" onClick={() => navigate(`/normative-acts/${a.id}`)} className="text-left rounded-2xl overflow-hidden border transition-all" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
                <div className="h-40 w-full" style={{ background: "var(--bg-tertiary)" }}>
                  {a.preview_image_url ? <img src={a.preview_image_url} alt={a.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: "var(--text-tertiary)" }}>Без картинки</div>}
                </div>
                <div className="p-3">
                  <div className="text-[11px] mb-1 font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>{(a.section || "Общее").trim() || "Общее"}</div>
                  <div className="font-semibold text-sm line-clamp-2" style={{ color: "var(--text-primary)" }}>{a.title}</div>
                  <div className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>{fmtDate(a.updated_at)}</div>
                  <div className="text-xs mt-2 font-medium" style={{ color: a.signed_by_me ? "var(--success,#0a9f4b)" : "var(--error)" }}>
                    {a.signed_by_me ? "Подписано вами" : "Требуется подпись"}
                  </div>
                  {isAdmin && (
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/normative-acts/${a.id}/edit`); }} className="px-2.5 py-1.5 rounded-lg text-xs" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>Изменить</button>
                      <button type="button" onClick={async (e) => { e.stopPropagation(); await deleteItem(a.id); }} className="px-2.5 py-1.5 rounded-lg text-xs" style={{ background: "var(--error-light)", border: "1px solid var(--error)", color: "var(--error)" }}>Удалить</button>
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
