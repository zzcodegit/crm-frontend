import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../api";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "setup">("login");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(username, password);
        navigate("/", { replace: true });
      } else {
        if (!newPassword.trim() || !newPassword2.trim()) {
          setError("Введите новый пароль");
          return;
        }
        if (newPassword !== newPassword2) {
          setError("Пароли не совпадают");
          return;
        }

        await api.setupPassword(username, newPassword, newPassword2);
        await login(username, newPassword);
        navigate("/", { replace: true });
      }
    } catch (err) {
      if (mode === "login" && err instanceof Error && err.message === "PASSWORD_SETUP_REQUIRED") {
        setMode("setup");
        setPassword("");
        setNewPassword("");
        setNewPassword2("");
        setError("");
      } else {
        setError(err instanceof Error ? err.message : "Ошибка входа");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Декоративный фон */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Градиентные круги */}
        <div 
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow"
          style={{ 
            background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
            opacity: 0.2,
          }}
        />
        <div 
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-medium"
          style={{ 
            background: 'radial-gradient(circle, var(--purple) 0%, transparent 70%)',
            opacity: 0.15,
          }}
        />
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-3xl animate-float-fast"
          style={{ 
            background: 'radial-gradient(circle, var(--teal) 0%, transparent 70%)',
            opacity: 0.1,
          }}
        />
        
        {/* Сетка */}
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
            opacity: 0.03,
          }}
        />
      </div>

      {/* Контейнер формы */}
      <div className="relative z-10 w-full max-w-md">
        {/* Карточка логина */}
        <div 
          className="rounded-2xl p-8 sm:p-10 animate-slide-in backdrop-blur-sm"
          style={{ 
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          }}
        >
          {/* Логотип и заголовок */}
          <div className="text-center mb-8">
            <div 
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-white mx-auto mb-5 relative overflow-hidden group"
              style={{ 
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                boxShadow: '0 8px 24px rgba(0, 82, 204, 0.3)',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-10 sm:h-10">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="9" x2="15" y2="9"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
                <line x1="9" y1="12" x2="15" y2="12"/>
              </svg>
              {/* Эффект блеска */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.3) 50%, transparent 70%)',
                  animation: 'shimmer 2s infinite',
                }}
              />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2 tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Mosoptika
            </h1>
            <p className="text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              Войдите для продолжения работы
            </p>
          </div>

          {/* Форма */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Сообщение об ошибке */}
            {error && (
              <div 
                className="p-4 rounded-xl text-sm flex items-start gap-3 animate-slide-in"
                style={{ 
                  backgroundColor: 'rgba(222, 53, 11, 0.08)',
                  color: 'var(--error)',
                  border: '1px solid rgba(222, 53, 11, 0.2)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Поле логина */}
            <div>
              <label className="block text-sm font-semibold mb-2.5" style={{ color: 'var(--text-primary)' }}>
                Имя пользователя
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Введите логин"
                  autoComplete="username"
                  required
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl transition-all focus:outline-none text-sm"
                  style={{ 
                    backgroundColor: 'var(--bg-secondary)',
                    border: '2px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--accent)';
                    e.target.style.boxShadow = '0 0 0 4px var(--accent-light)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            {mode === "login" ? (
              <>
                {/* Поле пароля (можно оставить пустым для приглашённого пользователя) */}
                <div>
                  <label className="block text-sm font-semibold mb-2.5" style={{ color: 'var(--text-primary)' }}>
                    Пароль
                  </label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Введите пароль (или оставьте пустым)"
                      autoComplete="current-password"
                      required={false}
                      className="w-full pl-12 pr-4 py-3.5 rounded-xl transition-all focus:outline-none text-sm"
                      style={{ 
                        backgroundColor: 'var(--bg-secondary)',
                        border: '2px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = 'var(--accent)';
                        e.target.style.boxShadow = '0 0 0 4px var(--accent-light)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = 'var(--border)';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-semibold mb-2.5" style={{ color: 'var(--text-primary)' }}>
                    Придумайте пароль
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Новый пароль"
                      autoComplete="new-password"
                      required
                      className="w-full pl-4 pr-4 py-3.5 rounded-xl transition-all focus:outline-none text-sm"
                      style={{ 
                        backgroundColor: 'var(--bg-secondary)',
                        border: '2px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = 'var(--accent)';
                        e.target.style.boxShadow = '0 0 0 4px var(--accent-light)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = 'var(--border)';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2.5" style={{ color: 'var(--text-primary)' }}>
                    Повторите пароль
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={newPassword2}
                      onChange={(e) => setNewPassword2(e.target.value)}
                      placeholder="Повтор пароля"
                      autoComplete="new-password"
                      required
                      className="w-full pl-4 pr-4 py-3.5 rounded-xl transition-all focus:outline-none text-sm"
                      style={{ 
                        backgroundColor: 'var(--bg-secondary)',
                        border: '2px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = 'var(--accent)';
                        e.target.style.boxShadow = '0 0 0 4px var(--accent-light)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = 'var(--border)';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Кнопка входа */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-xl text-white text-base font-semibold disabled:opacity-50 transition-all relative overflow-hidden group"
              style={{ 
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                boxShadow: '0 4px 16px rgba(0, 82, 204, 0.3)',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 82, 204, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 82, 204, 0.3)';
              }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Вход...
                  </>
                ) : (
                  <>
                    {mode === "login" ? "Войти в систему" : "Сохранить пароль"}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-1 transition-transform">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </>
                )}
              </span>
              {/* Эффект при наведении */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.2) 0%, transparent 70%)',
                }}
              />
            </button>
          </form>

          {/* Футер */}
          <div className="mt-8 pt-6 text-center" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Mosoptika v2.0 • 2026
            </p>
          </div>
        </div>

        {/* Дополнительная информация */}
        <div className="mt-6 text-center">
          <p className="text-xs sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Защищенное соединение • Все данные зашифрованы
          </p>
        </div>
      </div>
    </div>
  );
}
