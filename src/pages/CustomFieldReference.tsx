import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type CustomFieldItem } from "../api";

export default function CustomFieldReference() {
  const { id } = useParams<{ id: string }>();
  const fieldId = Number(id);
  const [field, setField] = useState<CustomFieldItem | null>(null);
  const [value, setValue] = useState("");

  const load = () => {
    api.ref.customFields.listAll().then((list) => {
      const found = list.find((f) => f.id === fieldId) ?? null;
      setField(found);
    }).catch(() => setField(null));
  };

  useEffect(() => {
    if (!Number.isFinite(fieldId)) return;
    load();
  }, [fieldId]);

  if (!field) return <div style={{ color: "var(--text-secondary)" }}>Загрузка...</div>;

  return (
    <div className="max-w-4xl animate-slide-in space-y-5">
      <Link to="/settings/references" className="text-sm" style={{ color: "var(--accent)" }}>← Справочники</Link>
      <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Справочник: {field.label}</h1>
      <div className="rounded-xl p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        <div className="flex gap-2">
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Новое значение" className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          <button
            type="button"
            onClick={() => {
              const v = value.trim();
              if (!v) return;
              api.ref.customFields.addOption(field.id, { value: v }).then(() => { setValue(""); load(); });
            }}
            className="px-3 py-2 rounded-lg text-sm text-white"
            style={{ background: "var(--accent)" }}
          >
            Добавить
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {field.options.map((opt) => (
            <div key={opt.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "var(--bg-secondary)" }}>
              <span style={{ color: "var(--text-primary)" }}>{opt.value}</span>
              <button type="button" onClick={() => api.ref.customFields.deleteOption(field.id, opt.id).then(load)} style={{ color: "var(--error)" }}>Удалить</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
