import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import WorkScheduleBoard from "../components/WorkScheduleBoard";
import { isNativeAppShell } from "../utils/nativeApp";

const APK_HOME_TABS = [
  { to: "/pricelist", label: "Прайс склад" },
  { to: "/pricelist-rx", label: "RX" },
  { to: "/pricelist-mkl", label: "Прайс МКЛ" },
] as const;

export default function Dashboard() {
  const { user } = useAuth();

  if (isNativeAppShell()) {
    return (
      <div className="animate-slide-in min-w-0">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
          Главная
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          Выберите раздел прайса
        </p>

        <nav className="flex flex-col sm:flex-row flex-wrap gap-3" aria-label="Разделы прайса">
          {APK_HOME_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                `rounded-xl text-sm font-semibold text-center transition-all px-4 py-3.5 min-h-[48px] flex items-center justify-center sm:min-w-[160px] ${
                  isActive ? "shadow-md" : "hover:opacity-95 active:scale-[0.99]"
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? {
                      color: "#ffffff",
                      background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)",
                      border: "1px solid transparent",
                      boxShadow: "0 4px 14px rgba(0, 82, 204, 0.25)",
                    }
                  : {
                      color: "var(--text-primary)",
                      backgroundColor: "var(--bg-primary)",
                      border: "1px solid var(--border)",
                    }
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="animate-slide-in min-w-0">
      <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        Главная
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        Добро пожаловать, {user?.username}
      </p>

      <div className="mt-6">
        <WorkScheduleBoard mode="consultant" />
      </div>
    </div>
  );
}
