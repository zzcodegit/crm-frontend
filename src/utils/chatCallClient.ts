export type CallMedia = "audio" | "video";

export type CallPeer = {
  user_id: number;
  username: string;
  display_name: string;
};

export type CallStreamsSnapshot = {
  local: MediaStream | null;
  remote: Map<number, MediaStream>;
};

export type CallUiState =
  | { status: "idle" }
  | {
      status: "outgoing";
      callId: string;
      kind: "private" | "group";
      dialogId: number;
      title: string;
      media: CallMedia;
    }
  | {
      status: "incoming";
      callId: string;
      kind: "private";
      dialogId: number;
      from: CallPeer;
      sdp?: string;
      media: CallMedia;
    }
  | {
      status: "incoming_group";
      callId: string;
      dialogId: number;
      from: CallPeer;
      participants: CallPeer[];
      title: string;
      media: CallMedia;
    }
  | {
      status: "active";
      callId: string;
      kind: "private" | "group";
      dialogId: number;
      title: string;
      peers: CallPeer[];
      media: CallMedia;
      muted: boolean;
      cameraOff: boolean;
      startedAt: number;
    };

type SignalMessage = {
  type: string;
  [key: string]: unknown;
};

function wsBaseUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}`;
}

function peerLabel(p: CallPeer): string {
  return p.display_name || p.username || `ID ${p.user_id}`;
}

function parseVideoFlag(data: SignalMessage): boolean {
  return data.video === true;
}

/** Целевой битрейт исходящего видео (бит/с). */
const VIDEO_MAX_BITRATE = 2_500_000;
const VIDEO_MAX_FRAMERATE = 30;
const AUDIO_MAX_BITRATE = 128_000;

const VIDEO_CAPTURE_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: "user",
  width: { ideal: 1280, min: 640 },
  height: { ideal: 720, min: 480 },
  frameRate: { ideal: 30, max: 30 },
};

const AUDIO_CAPTURE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export class ChatCallClient {
  private ws: WebSocket | null = null;
  private myUserId = 0;
  private iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  private localStream: MediaStream | null = null;
  private remoteStreams = new Map<number, MediaStream>();
  private privatePc: RTCPeerConnection | null = null;
  private peerPcs = new Map<number, RTCPeerConnection>();
  private remoteAudio = new Map<number, HTMLAudioElement>();
  private callVideo = false;
  private state: CallUiState = { status: "idle" };
  private stateListeners = new Set<(s: CallUiState) => void>();
  private callEndedListeners = new Set<(info: { dialogId: number; kind: "private" | "group" }) => void>();
  private onStreams: ((s: CallStreamsSnapshot) => void) | null = null;
  private activeCallId: string | null = null;
  private activeDialogId = 0;
  private activeTitle = "";
  private connectToken: string | null = null;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;

  /** @deprecated Используйте subscribeState */
  setStateListener(fn: ((s: CallUiState) => void) | null) {
    if (!fn) return;
    this.subscribeState(fn);
  }

  subscribeState(fn: (s: CallUiState) => void): () => void {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => this.stateListeners.delete(fn);
  }

  subscribeCallEnded(fn: (info: { dialogId: number; kind: "private" | "group" }) => void): () => void {
    this.callEndedListeners.add(fn);
    return () => this.callEndedListeners.delete(fn);
  }

  private notifyCallEnded(info: { dialogId: number; kind: "private" | "group" }) {
    for (const fn of this.callEndedListeners) {
      try {
        fn(info);
      } catch {
        /* ignore */
      }
    }
  }

  private captureCallContext(): { dialogId: number; kind: "private" | "group" } | null {
    const st = this.state;
    if (st.status === "idle") {
      if (this.activeDialogId > 0) {
        return { dialogId: this.activeDialogId, kind: "private" };
      }
      return null;
    }
    if (st.status === "incoming_group") {
      return { dialogId: st.dialogId, kind: "group" };
    }
    return { dialogId: st.dialogId, kind: st.kind };
  }

  setStreamsListener(fn: ((s: CallStreamsSnapshot) => void) | null) {
    this.onStreams = fn;
    fn?.(this.getStreams());
  }

  getState(): CallUiState {
    return this.state;
  }

  getStreams(): CallStreamsSnapshot {
    return { local: this.localStream, remote: new Map(this.remoteStreams) };
  }

  private setState(next: CallUiState) {
    this.state = next;
    for (const fn of this.stateListeners) {
      try {
        fn(next);
      } catch {
        /* ignore */
      }
    }
  }

  private notifyStreams() {
    this.onStreams?.(this.getStreams());
  }

  async connect(token: string) {
    this.connectToken = token;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    try {
      const res = await fetch("/api/chat/calls/ice-servers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { iceServers?: RTCIceServer[] };
        if (data.iceServers?.length) this.iceServers = data.iceServers;
      }
    } catch {
      /* default STUN */
    }

    const url = `${wsBaseUrl()}/api/chat/calls/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.reconnectTimer != null) {
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.pingTimer != null) window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => {
        this.send({ type: "ping" });
      }, 25000);
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as SignalMessage;
        void this.handleSignal(data);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.pingTimer != null) {
        window.clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      if (this.connectToken) {
        this.reconnectTimer = window.setTimeout(() => {
          if (this.connectToken) void this.connect(this.connectToken);
        }, 3000);
      }
    };
  }

  disconnect() {
    this.connectToken = null;
    if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.pingTimer != null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    void this.cleanupCall();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private send(payload: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private mediaAccessErrorMessage(err: unknown, video: boolean): string {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return video
        ? "Нет доступа к камере и микрофону. Разрешите их для сайта в браузере и в настройках системы."
        : "Нет доступа к микрофону. Разрешите его для сайта в браузере и в настройках системы.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return video ? "Камера или микрофон не найдены." : "Микрофон не найден.";
    }
    return video ? "Не удалось включить камеру и микрофон." : "Не удалось включить микрофон.";
  }

  private async ensureMedia(video: boolean): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(video ? "Камера и микрофон недоступны" : "Микрофон недоступен в этом браузере");
    }
    if (this.localStream) {
      const hasVideo = this.localStream.getVideoTracks().length > 0;
      if (video === hasVideo) return this.localStream;
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.callVideo = video;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CAPTURE_CONSTRAINTS,
        video: video ? VIDEO_CAPTURE_CONSTRAINTS : false,
      });
    } catch (err) {
      throw new Error(this.mediaAccessErrorMessage(err, video));
    }
    this.notifyStreams();
    return this.localStream;
  }

  private handleCallMediaError(err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка доступа к устройствам";
    window.alert(msg);
    void this.cleanupCall();
  }

  private attachRemoteStream(userId: number, stream: MediaStream) {
    this.remoteStreams.set(userId, stream);
    const audio = stream.getAudioTracks()[0];
    if (audio) {
      let el = this.remoteAudio.get(userId);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        this.remoteAudio.set(userId, el);
      }
      el.srcObject = stream;
      void el.play().catch(() => undefined);
    }
    this.notifyStreams();
  }

  private mergeRemoteTrack(userId: number, track: MediaStreamTrack) {
    let stream = this.remoteStreams.get(userId);
    if (!stream) {
      stream = new MediaStream();
      this.remoteStreams.set(userId, stream);
    }
    if (!stream.getTracks().some((t) => t.id === track.id)) {
      stream.addTrack(track);
    }
    this.attachRemoteStream(userId, stream);
  }

  private preferVideoCodecs(pc: RTCPeerConnection) {
    if (typeof RTCRtpReceiver === "undefined" || typeof RTCRtpReceiver.getCapabilities !== "function") return;
    const caps = RTCRtpReceiver.getCapabilities("video");
    if (!caps?.codecs?.length) return;
    const preference = ["VP9", "H264", "VP8"];
    const rank = (mime: string) => {
      const upper = mime.toUpperCase();
      const idx = preference.findIndex((p) => upper.includes(p));
      return idx === -1 ? 99 : idx;
    };
    const sorted = [...caps.codecs].sort((a, b) => rank(a.mimeType) - rank(b.mimeType));
    for (const tr of pc.getTransceivers()) {
      if (tr.receiver.track?.kind === "video" || tr.sender.track?.kind === "video") {
        try {
          tr.setCodecPreferences(sorted);
        } catch {
          /* браузер может не поддержать набор кодеков */
        }
      }
    }
  }

  private async tuneOutgoingMedia(pc: RTCPeerConnection) {
    for (const sender of pc.getSenders()) {
      const track = sender.track;
      if (!track) continue;
      if (track.kind === "video" && this.callVideo) {
        try {
          await track.applyConstraints({
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: VIDEO_MAX_FRAMERATE, max: VIDEO_MAX_FRAMERATE },
          });
        } catch {
          /* ignore */
        }
        try {
          const params = sender.getParameters();
          if (!params.encodings?.length) params.encodings = [{}];
          for (const enc of params.encodings) {
            enc.maxBitrate = VIDEO_MAX_BITRATE;
            enc.maxFramerate = VIDEO_MAX_FRAMERATE;
            enc.scaleResolutionDownBy = 1;
          }
          params.degradationPreference = "maintain-resolution";
          await sender.setParameters(params);
        } catch {
          /* ignore */
        }
      }
      if (track.kind === "audio") {
        try {
          const params = sender.getParameters();
          if (!params.encodings?.length) params.encodings = [{}];
          for (const enc of params.encodings) {
            enc.maxBitrate = AUDIO_MAX_BITRATE;
          }
          await sender.setParameters(params);
        } catch {
          /* ignore */
        }
      }
    }
  }

  private attachMediaTuning(pc: RTCPeerConnection) {
    const run = () => void this.tuneOutgoingMedia(pc);
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "connected") run();
    });
    pc.addEventListener("iceconnectionstatechange", () => {
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") run();
    });
    window.setTimeout(run, 400);
    window.setTimeout(run, 2000);
  }

  private createPc(remoteUserId: number): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      bundlePolicy: "max-bundle",
    });
    this.attachMediaTuning(pc);
    pc.onicecandidate = (ev) => {
      if (!ev.candidate || !this.activeCallId) return;
      this.send({
        type: "webrtc_ice",
        call_id: this.activeCallId,
        to_user_id: remoteUserId,
        candidate: ev.candidate.toJSON(),
      });
    };
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      if (ev.track.kind === "video" || ev.track.kind === "audio") {
        for (const t of stream.getTracks()) this.mergeRemoteTrack(remoteUserId, t);
        if (!stream.getTracks().includes(ev.track)) this.mergeRemoteTrack(remoteUserId, ev.track);
      }
    };
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }
    if (this.callVideo) this.preferVideoCodecs(pc);
    return pc;
  }

  private rtcOfferOptions(): RTCOfferOptions {
    return {
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.callVideo,
    };
  }

  private async cleanupCall() {
    const endedCtx = this.captureCallContext();
    this.privatePc?.close();
    this.privatePc = null;
    for (const pc of this.peerPcs.values()) pc.close();
    this.peerPcs.clear();
    for (const a of this.remoteAudio.values()) a.srcObject = null;
    this.remoteAudio.clear();
    this.remoteStreams.clear();
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.callVideo = false;
    this.activeCallId = null;
    this.activeDialogId = 0;
    this.activeTitle = "";
    this.setState({ status: "idle" });
    this.notifyStreams();
    if (endedCtx && endedCtx.dialogId > 0) {
      this.notifyCallEnded(endedCtx);
    }
  }

  private activeMedia(): CallMedia {
    return this.callVideo ? "video" : "audio";
  }

  private setActivePeers(peers: CallPeer[], kind: "private" | "group", title: string) {
    const videoTrack = this.localStream?.getVideoTracks()[0];
    this.setState({
      status: "active",
      callId: this.activeCallId!,
      kind,
      dialogId: this.activeDialogId,
      title,
      peers,
      media: this.activeMedia(),
      muted: this.localStream?.getAudioTracks()[0]?.enabled === false,
      cameraOff: videoTrack ? !videoTrack.enabled : false,
      startedAt: Date.now(),
    });
  }

  async startPrivateCall(dialogId: number, targetUserId: number, title: string, video = false) {
    if (this.state.status !== "idle") return;
    try {
      await this.ensureMedia(video);
    } catch (err) {
      this.handleCallMediaError(err);
      return;
    }
    const pc = this.createPc(targetUserId);
    this.privatePc = pc;
    const offer = await pc.createOffer(this.rtcOfferOptions());
    await pc.setLocalDescription(offer);
    void this.tuneOutgoingMedia(pc);
    this.activeDialogId = dialogId;
    this.activeTitle = title;
    this.send({
      type: "call_invite",
      dialog_id: dialogId,
      target_user_id: targetUserId,
      sdp: offer.sdp,
      video,
    });
    this.setState({
      status: "outgoing",
      callId: "",
      kind: "private",
      dialogId,
      title,
      media: video ? "video" : "audio",
    });
  }

  async startGroupCall(dialogId: number, title: string, video = false) {
    if (this.state.status !== "idle") return;
    try {
      await this.ensureMedia(video);
    } catch (err) {
      this.handleCallMediaError(err);
      return;
    }
    this.activeDialogId = dialogId;
    this.activeTitle = title;
    this.send({ type: "group_call_start", dialog_id: dialogId, video });
    this.setState({
      status: "outgoing",
      callId: "",
      kind: "group",
      dialogId,
      title,
      media: video ? "video" : "audio",
    });
  }

  async acceptCall() {
    const st = this.state;
    if (st.status === "incoming") {
      try {
        await this.ensureMedia(st.media === "video");
      } catch (err) {
        this.handleCallMediaError(err);
        return;
      }
      const remoteId = st.from.user_id;
      const pc = this.createPc(remoteId);
      this.privatePc = pc;
      if (st.sdp) {
        await pc.setRemoteDescription({ type: "offer", sdp: st.sdp });
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      void this.tuneOutgoingMedia(pc);
      this.activeCallId = st.callId;
      this.activeDialogId = st.dialogId;
      this.activeTitle = peerLabel(st.from);
      this.send({ type: "call_accept", call_id: st.callId, sdp: answer.sdp });
      this.setActivePeers([st.from], "private", this.activeTitle);
      return;
    }
    if (st.status === "incoming_group") {
      try {
        await this.ensureMedia(st.media === "video");
      } catch (err) {
        this.handleCallMediaError(err);
        return;
      }
      this.activeCallId = st.callId;
      this.activeDialogId = st.dialogId;
      this.activeTitle = st.title;
      this.send({ type: "group_call_join", call_id: st.callId });
    }
  }

  declineCall() {
    const st = this.state;
    if (st.status === "incoming" || st.status === "incoming_group") {
      this.send({ type: "call_decline", call_id: st.callId });
      void this.cleanupCall();
    }
  }

  hangup() {
    if (this.activeCallId) {
      this.send({ type: "call_hangup", call_id: this.activeCallId });
    }
    void this.cleanupCall();
  }

  toggleMute(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    if (this.state.status === "active") {
      this.setState({ ...this.state, muted: !track.enabled });
    }
    return !track.enabled;
  }

  toggleCamera(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    if (this.state.status === "active") {
      this.setState({ ...this.state, cameraOff: !track.enabled });
    }
    this.notifyStreams();
    return !track.enabled;
  }

  private async connectToPeer(peer: CallPeer, polite: boolean) {
    if (peer.user_id === this.myUserId || this.peerPcs.has(peer.user_id)) return;
    const pc = this.createPc(peer.user_id);
    this.peerPcs.set(peer.user_id, pc);
    if (!polite) {
      const offer = await pc.createOffer(this.rtcOfferOptions());
      await pc.setLocalDescription(offer);
      void this.tuneOutgoingMedia(pc);
      this.send({
        type: "webrtc_offer",
        call_id: this.activeCallId,
        to_user_id: peer.user_id,
        sdp: offer.sdp,
      });
    }
  }

  /** Обработка сигнала с WebSocket или service worker (push). */
  ingestSignal(data: SignalMessage) {
    void this.handleSignal(data);
  }

  private async handleSignal(data: SignalMessage) {
    const type = data.type;

    if (type === "connected") {
      this.myUserId = Number(data.user_id) || 0;
      return;
    }

    if (type === "call_error") {
      window.alert(String(data.message || "Ошибка звонка"));
      if (this.state.status !== "idle") void this.cleanupCall();
      return;
    }

    if (type === "call_ringing") {
      this.activeCallId = String(data.call_id || "");
      if (this.state.status === "outgoing") {
        this.setState({ ...this.state, callId: this.activeCallId });
      }
      return;
    }

    if (type === "incoming_call") {
      const from = data.from as CallPeer;
      if (!from || typeof from.user_id !== "number") return;
      const media: CallMedia = parseVideoFlag(data) ? "video" : "audio";
      this.setState({
        status: "incoming",
        callId: String(data.call_id || ""),
        kind: "private",
        dialogId: Number(data.dialog_id) || 0,
        from,
        sdp: typeof data.sdp === "string" ? data.sdp : undefined,
        media,
      });
      return;
    }

    if (type === "incoming_group_call") {
      const from = data.from as CallPeer;
      if (!from || typeof from.user_id !== "number") return;
      const participants = (data.participants as CallPeer[]) || [];
      const dialogName = typeof data.dialog_name === "string" ? data.dialog_name : "Групповой звонок";
      const media: CallMedia = parseVideoFlag(data) ? "video" : "audio";
      this.activeTitle = dialogName;
      this.setState({
        status: "incoming_group",
        callId: String(data.call_id || ""),
        dialogId: Number(data.dialog_id) || 0,
        from,
        participants,
        title: dialogName,
        media,
      });
      return;
    }

    if (type === "call_accepted") {
      const sdp = data.sdp as string;
      if (this.privatePc && sdp) {
        await this.privatePc.setRemoteDescription({ type: "answer", sdp });
        void this.tuneOutgoingMedia(this.privatePc);
      }
      const from = data.from as CallPeer;
      this.activeCallId = String(data.call_id || this.activeCallId || "");
      this.setActivePeers([from], "private", peerLabel(from));
      return;
    }

    if (type === "call_active") {
      this.activeCallId = String(data.call_id || "");
      return;
    }

    if (type === "call_declined") {
      window.alert("Абонент отклонил звонок");
      void this.cleanupCall();
      return;
    }

    if (type === "call_ended") {
      void this.cleanupCall();
      return;
    }

    if (type === "group_call_started") {
      this.activeCallId = String(data.call_id || "");
      if (typeof data.dialog_name === "string") this.activeTitle = data.dialog_name;
      if (parseVideoFlag(data)) this.callVideo = true;
      const me: CallPeer = { user_id: this.myUserId, username: "", display_name: "Вы" };
      this.setActivePeers([me], "group", this.activeTitle);
      return;
    }

    if (type === "group_call_joined") {
      this.activeCallId = String(data.call_id || "");
      const participants = (data.participants as CallPeer[]) || [];
      for (const p of participants) {
        await this.connectToPeer(p, this.myUserId > p.user_id);
      }
      const me: CallPeer = { user_id: this.myUserId, username: "", display_name: "Вы" };
      this.setActivePeers([me, ...participants], "group", this.activeTitle);
      return;
    }

    if (type === "peer_joined") {
      const peer = data.peer as CallPeer;
      if (!peer || !this.activeCallId) return;
      await this.connectToPeer(peer, this.myUserId > peer.user_id);
      if (this.state.status === "active") {
        const peers = [...this.state.peers.filter((p) => p.user_id !== peer.user_id), peer];
        this.setActivePeers(peers, "group", this.state.title);
      }
      return;
    }

    if (type === "peer_left") {
      const uid = Number(data.user_id);
      this.peerPcs.get(uid)?.close();
      this.peerPcs.delete(uid);
      const audio = this.remoteAudio.get(uid);
      if (audio) audio.srcObject = null;
      this.remoteAudio.delete(uid);
      this.remoteStreams.delete(uid);
      this.notifyStreams();
      if (this.state.status === "active" && this.state.kind === "group") {
        this.setActivePeers(
          this.state.peers.filter((p) => p.user_id !== uid),
          "group",
          this.state.title,
        );
      }
      return;
    }

    if (type === "webrtc_offer") {
      const fromUserId = Number(data.from_user_id);
      const sdp = data.sdp as string;
      const callId = String(data.call_id || "");
      if (!fromUserId || !sdp) return;
      this.activeCallId = callId;
      let pc = this.peerPcs.get(fromUserId);
      if (!pc) {
        pc = this.createPc(fromUserId);
        this.peerPcs.set(fromUserId, pc);
      }
      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      void this.tuneOutgoingMedia(pc);
      this.send({
        type: "webrtc_answer",
        call_id: callId,
        to_user_id: fromUserId,
        sdp: answer.sdp,
      });
      return;
    }

    if (type === "webrtc_answer") {
      const fromUserId = Number(data.from_user_id);
      const sdp = data.sdp as string;
      const pc = this.peerPcs.get(fromUserId) ?? this.privatePc;
      if (pc && sdp) {
        await pc.setRemoteDescription({ type: "answer", sdp });
        void this.tuneOutgoingMedia(pc);
      }
      return;
    }

    if (type === "webrtc_ice") {
      const fromUserId = Number(data.from_user_id);
      const candidate = data.candidate as RTCIceCandidateInit;
      const pc = this.peerPcs.get(fromUserId) ?? this.privatePc;
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(candidate);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

export const chatCallClient = new ChatCallClient();
