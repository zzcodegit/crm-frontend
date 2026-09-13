import { useEffect, useRef, useState } from "react";
import type { CallStreamsSnapshot, CallUiState } from "../utils/chatCallClient";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function VideoTile({
  stream,
  label,
  mirror,
  large,
}: {
  stream: MediaStream | null;
  label: string;
  mirror?: boolean;
  large?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stream) {
      el.srcObject = stream;
      void el.play().catch(() => undefined);
    } else {
      el.srcObject = null;
    }
  }, [stream]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-black/80 flex items-center justify-center ${large ? "w-full h-full min-h-[200px]" : "aspect-video w-full"}`}
      style={{ border: "1px solid rgba(255,255,255,0.12)" }}
    >
      {stream && stream.getVideoTracks().some((t) => t.enabled) ? (
        <video
          ref={ref}
          playsInline
          autoPlay
          muted={mirror}
          disablePictureInPicture
          className={`w-full h-full object-cover ${mirror ? "scale-x-[-1]" : ""}`}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 p-4" style={{ color: "rgba(255,255,255,0.7)" }}>
          <span className="text-3xl">👤</span>
          <span className="text-xs text-center">{label}</span>
        </div>
      )}
      <div
        className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[11px] font-medium truncate"
        style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.65))", color: "#fff" }}
      >
        {label}
      </div>
    </div>
  );
}

export default function ChatCallOverlay({
  state,
  streams,
  onAccept,
  onDecline,
  onHangup,
  onToggleMute,
  onToggleCamera,
}: {
  state: CallUiState;
  streams: CallStreamsSnapshot;
  onAccept: () => void;
  onDecline: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (state.status !== "active") return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [state.status, state.status === "active" ? state.startedAt : 0]);

  if (state.status === "idle") return null;

  const elapsed =
    state.status === "active" ? Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000)) : 0;
  void tick;

  const isVideo =
    (state.status === "active" && state.media === "video") ||
    (state.status === "outgoing" && state.media === "video") ||
    (state.status === "incoming" && state.media === "video") ||
    (state.status === "incoming_group" && state.media === "video");

  const incoming = state.status === "incoming" || state.status === "incoming_group";

  let title = "";
  let subtitle = "";
  if (state.status === "outgoing") {
    title = state.media === "video" ? (state.kind === "group" ? "Групповой видеозвонок" : "Видеозвонок") : state.kind === "group" ? "Групповой звонок" : "Исходящий звонок";
    subtitle = state.title;
  } else if (state.status === "incoming") {
    title = state.media === "video" ? "Входящий видеозвонок" : "Входящий звонок";
    subtitle = state.from.display_name || state.from.username;
  } else if (state.status === "incoming_group") {
    title = state.media === "video" ? "Групповой видеозвонок" : "Групповой звонок";
    subtitle = `${state.from.display_name || state.from.username} начал звонок`;
  } else if (state.status === "active") {
    title = state.media === "video" ? (state.kind === "group" ? "Групповой видеозвонок" : "Видеозвонок") : state.kind === "group" ? "Групповой звонок" : "Разговор";
    subtitle =
      state.kind === "group"
        ? `${state.peers.length} участник${state.peers.length === 1 ? "" : state.peers.length < 5 ? "а" : "ов"}`
        : state.title;
  }

  const controls = (
    <div className={`flex gap-2 w-full ${isVideo && state.status === "active" ? "max-w-lg mx-auto" : ""}`}>
      {incoming ? (
        <>
          <button
            type="button"
            className="flex-1 py-3 rounded-2xl text-sm font-semibold"
            style={{ backgroundColor: "rgba(222,53,11,0.2)", color: "#ff6b6b", border: "1px solid rgba(222,53,11,0.4)" }}
            onClick={onDecline}
          >
            Отклонить
          </button>
          <button
            type="button"
            className="flex-1 py-3 rounded-2xl text-sm font-semibold"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)",
              color: "#fff",
            }}
            onClick={onAccept}
          >
            Принять
          </button>
        </>
      ) : (
        <>
          {state.status === "active" && (
            <>
              <button
                type="button"
                className="flex-1 py-3 rounded-2xl text-sm font-semibold"
                style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}
                onClick={onToggleMute}
              >
                {state.muted ? "🎤 Вкл." : "🔇 Выкл."}
              </button>
              {state.media === "video" && (
                <button
                  type="button"
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold"
                  style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}
                  onClick={onToggleCamera}
                >
                  {state.cameraOff ? "📷 Вкл." : "📷 Выкл."}
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className={`py-3 rounded-2xl text-sm font-semibold ${state.status === "active" ? "flex-1" : "w-full"}`}
            style={{ backgroundColor: "rgba(222,53,11,0.25)", color: "#ff6b6b", border: "1px solid rgba(222,53,11,0.45)" }}
            onClick={onHangup}
          >
            Завершить
          </button>
        </>
      )}
    </div>
  );

  if (isVideo && state.status === "active") {
    const remoteEntries = Array.from(streams.remote.entries());
    const isPrivate = state.kind === "private";
    const mainRemote = isPrivate ? remoteEntries[0] : null;

    return (
      <div
        className="fixed inset-0 z-[200] flex flex-col"
        style={{ backgroundColor: "#0a0e14" }}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{title}</div>
            <div className="text-xs truncate" style={{ color: "rgba(255,255,255,0.55)" }}>
              {subtitle} · {formatDuration(elapsed)}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 p-3 relative">
          {isPrivate && mainRemote ? (
            <VideoTile
              stream={mainRemote[1]}
              label={state.peers.find((p) => p.user_id === mainRemote[0])?.display_name || "Собеседник"}
              large
            />
          ) : (
            <div
              className="grid gap-2 h-full auto-rows-fr"
              style={{
                gridTemplateColumns: remoteEntries.length <= 1 ? "1fr" : remoteEntries.length <= 4 ? "1fr 1fr" : "repeat(3, 1fr)",
              }}
            >
              {remoteEntries.length === 0 ? (
                <VideoTile stream={null} label="Ожидание участников…" large />
              ) : (
                remoteEntries.map(([uid, stream]) => (
                  <VideoTile
                    key={uid}
                    stream={stream}
                    label={state.peers.find((p) => p.user_id === uid)?.display_name || `Участник ${uid}`}
                  />
                ))
              )}
            </div>
          )}

          <div className="absolute bottom-4 right-4 w-[min(140px,35vw)] shadow-2xl rounded-2xl overflow-hidden" style={{ border: "2px solid rgba(255,255,255,0.25)" }}>
            <VideoTile stream={streams.local} label="Вы" mirror />
          </div>
        </div>

        <div className="p-4 shrink-0" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          {controls}
        </div>
      </div>
    );
  }

  const showLocalPreview =
    isVideo && (state.status === "outgoing" || incoming) && streams.local;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full flex flex-col gap-5 ${isVideo ? "max-w-lg" : "max-w-md"} rounded-3xl p-6`}
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
        }}
      >
        {showLocalPreview ? (
          <VideoTile stream={streams.local} label="Предпросмотр" mirror />
        ) : (
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl mx-auto"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)",
              color: "#fff",
            }}
          >
            {incoming ? (isVideo ? "📹" : "📞") : state.status === "active" ? "🎧" : "📲"}
          </div>
        )}

        <div className="text-center min-w-0 w-full">
          <div className="text-lg font-bold truncate" style={{ color: "var(--text-primary)" }}>
            {title}
          </div>
          <div className="text-sm mt-1 truncate" style={{ color: "var(--text-secondary)" }}>
            {subtitle}
          </div>
          {state.status === "active" && (
            <div className="text-xs mt-2 tabular-nums" style={{ color: "var(--text-tertiary)" }}>
              {formatDuration(elapsed)}
              {state.muted ? " · микрофон выкл." : ""}
              {state.media === "video" && state.cameraOff ? " · камера выкл." : ""}
            </div>
          )}
          {state.status === "outgoing" && (
            <div className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
              Ожидание ответа…
            </div>
          )}
        </div>

        {controls}
      </div>
    </div>
  );
}
