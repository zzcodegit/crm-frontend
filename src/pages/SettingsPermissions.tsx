import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { usePermissions } from "../contexts/PermissionsContext";
import { APP_SECTIONS, type SectionKey } from "../permissions";

export default function SettingsPermissions() {
  const { groups, loading, groupPermissions, setGroupDeniedSections } = usePermissions();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const selectedGroup = useMemo(() => {
    if (groups.length === 0) return null;
    const fallback = groups[0];
    const group = selectedGroupId ? groups.find((g) => g.id === selectedGroupId) : fallback;
    return group ?? fallback;
  }, [groups, selectedGroupId]);

  const deniedForSelected = useMemo(() => {
    if (!selectedGroup) return new Set<SectionKey>();
    return new Set(groupPermissions[String(selectedGroup.id)] ?? []);
  }, [groupPermissions, selectedGroup]);

  const toggleSection = (sectionKey: SectionKey) => {
    if (!selectedGroup) return;
    const next = new Set(deniedForSelected);
    if (next.has(sectionKey)) next.delete(sectionKey);
    else next.add(sectionKey);
    setGroupDeniedSections(selectedGroup.id, [...next]);
  };

  return (
    <div className="max-w-5xl animate-slide-in space-y-6">
      <div>
        <Link to="/settings" className="inline-flex items-center gap-2 text-sm font-medium mb-3 hover:opacity-80" style={{ color: "var(--text-secondary)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Настройки
        </Link>
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
          Права групп по разделам
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Выберите группу и отключите разделы. Отключенный раздел скрывается в меню и будет недоступен по URL.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl p-6" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}>
          Загрузка групп...
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl p-6" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}>
          Нет групп. Сначала создайте группу в разделе пользователей.
        </div>
      ) : (
        <>
          <div className="rounded-xl p-5" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Группа пользователей
            </label>
            <select
              className="w-full md:w-[340px] rounded-md px-3 py-2.5 text-sm"
              style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              value={selectedGroup?.id ?? ""}
              onChange={(e) => setSelectedGroupId(Number(e.target.value))}
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl p-5 space-y-3" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
              Доступ к разделам
            </h2>
            {APP_SECTIONS.map((section) => {
              const denied = deniedForSelected.has(section.key);
              return (
                <label
                  key={section.key}
                  className="flex items-start gap-3 rounded-lg px-3 py-3 cursor-pointer"
                  style={{ backgroundColor: denied ? "var(--error-light)" : "var(--bg-secondary)" }}
                >
                  <input
                    type="checkbox"
                    checked={!denied}
                    onChange={() => toggleSection(section.key)}
                    className="mt-1"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span>
                    <span className="block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {section.label}
                    </span>
                    <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
                      {section.basePath}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
