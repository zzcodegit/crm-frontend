import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../contexts/AuthContext";
import ChatCallOverlay from "./ChatCallOverlay";
import {
  chatCallClient,
  type CallStreamsSnapshot,
  type CallUiState,
} from "../utils/chatCallClient";

const CALL_NOTIFY_PERMISSION_KEY = "crm_call_notify_permission_asked";

function useIncomingCallRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      void ctxRef.current?.close();
      ctxRef.current = null;
      return;
    }

    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const beep = () => {
      if (ctx.state === "closed") return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.5);
    };

    void ctx.resume().then(beep).catch(() => undefined);
    intervalRef.current = window.setInterval(() => void ctx.resume().then(beep).catch(() => undefined), 1600);

    return () => {
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      void ctx.close();
      ctxRef.current = null;
    };
  }, [active]);
}

function incomingCallLabel(state: CallUiState): string {
  if (state.status === "incoming") {
    const who = state.from.display_name || state.from.username || "Пользователь";
    return state.media === "video" ? `Видеозвонок: ${who}` : `Звонок: ${who}`;
  }
  if (state.status === "incoming_group") {
    const who = state.from.display_name || state.from.username || "Участник";
    return state.media === "video" ? `Групповой видеозвонок: ${who}` : `Групповой звонок: ${who}`;
  }
  return "Входящий звонок";
}

function showIncomingCallNotification(callId: string, label: string) {
  if (typeof document === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification("Mosoptika: входящий звонок", {
      body: label,
      tag: `crm-call-${callId}`,
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* ignore */
  }
}

/**
 * Постоянное WebSocket-подключение для звонков (на всех страницах CRM, не только в открытом чате).
 */
export default function ChatCallConnection() {
  const { user, loading } = useAuth();
  const [callState, setCallState] = useState<CallUiState>({ status: "idle" });
  const [callStreams, setCallStreams] = useState<CallStreamsSnapshot>({
    local: null,
    remote: new Map(),
  });
  const [mounted, setMounted] = useState(false);
  const lastNotifyCallIdRef = useRef<string | null>(null);

  const isIncoming = callState.status === "incoming" || callState.status === "incoming_group";
  useIncomingCallRingtone(isIncoming);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (user.chat_notifications_enabled === false) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted" || Notification.permission === "denied") return;
    let asked = false;
    try {
      asked = localStorage.getItem(CALL_NOTIFY_PERMISSION_KEY) === "1";
    } catch {
      asked = false;
    }
    if (asked) return;
    try {
      localStorage.setItem(CALL_NOTIFY_PERMISSION_KEY, "1");
    } catch {
      /* ignore */
    }
    void Notification.requestPermission().catch(() => undefined);
  }, [loading, user?.id, user?.chat_notifications_enabled]);

  useEffect(() => {
    if (loading || !user) {
      chatCallClient.disconnect();
      return;
    }
    if (user.chat_notifications_enabled === false) {
      chatCallClient.disconnect();
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) return;

    const unsubState = chatCallClient.subscribeState(setCallState);
    chatCallClient.setStreamsListener(setCallStreams);
    void chatCallClient.connect(token);

    return () => {
      unsubState();
      chatCallClient.setStreamsListener(null);
    };
  }, [loading, user?.id, user?.chat_notifications_enabled]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; signal?: Record<string, unknown> } | null;
      if (data?.type !== "crm-incoming-call" || !data.signal) return;
      if (chatCallClient.getState().status !== "idle") return;
      chatCallClient.ingestSignal(data.signal as { type: string; [key: string]: unknown });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!isIncoming) {
      lastNotifyCallIdRef.current = null;
      return;
    }
    const callId = callState.callId;
    if (!callId || lastNotifyCallIdRef.current === callId) return;
    lastNotifyCallIdRef.current = callId;

    const label = incomingCallLabel(callState);
    try {
      navigator.vibrate?.([200, 120, 200, 120, 200]);
    } catch {
      /* ignore */
    }

    showIncomingCallNotification(callId, label);
  }, [isIncoming, callState]);

  if (!mounted || loading || !user) return null;
  if (user.chat_notifications_enabled === false) return null;

  return createPortal(
    <ChatCallOverlay
      state={callState}
      streams={callStreams}
      onAccept={() => void chatCallClient.acceptCall()}
      onDecline={() => chatCallClient.declineCall()}
      onHangup={() => chatCallClient.hangup()}
      onToggleMute={() => chatCallClient.toggleMute()}
      onToggleCamera={() => chatCallClient.toggleCamera()}
    />,
    document.body,
  );
}
