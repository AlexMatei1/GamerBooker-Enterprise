// Local preview events only: same-origin BroadcastChannel + optional sound/haptics.
export type RealtimeEventType =
  | "ORDER_CREATED"
  | "ORDER_STATUS_CHANGED"
  | "STATION_STATUS_CHANGED"
  | "STAFF_CALL"
  | "SESSION_EXTENDED"
  | "PC_LOCK_EVENT"
  | "HEARTBEAT";

export interface RealtimeEventPayload {
  type: RealtimeEventType;
  venueId?: string;
  userId?: string;
  stationId?: string;
  timestamp: string;
  data: Record<string, any>;
}

type Listener = (payload: RealtimeEventPayload) => void;
type StatusListener = (
  status: "connected" | "connecting" | "disconnected",
) => void;

class MobileRealtimeClient {
  private listeners: Map<string, Set<Listener>> = new Map();
  private statusListeners: Set<StatusListener> = new Set();
  private status: "connected" | "connecting" | "disconnected" = "disconnected";
  private audioCtx: AudioContext | null = null;

  constructor() {
    this.connect();
  }

  private initAudio() {
    if (!this.audioCtx && typeof window !== "undefined") {
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  playSound(type: "ding" | "ready" | "curfew") {
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === "ready") {
        // Bright upbeat ready chord
        osc.type = "triangle";
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === "ding") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, now); // C5
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch {
      // Audio autoplay policy fallback
    }
  }

  triggerHaptic(pattern: number[] = [40, 50, 40]) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignored
      }
    }
  }

  private previewChannel: BroadcastChannel | null = null;
  connect() {
    if (typeof BroadcastChannel === "undefined" || this.previewChannel) return;
    this.previewChannel = new BroadcastChannel("gamerbooker-local-preview-v1");
    this.previewChannel.onmessage = ({ data }) => {
      if (data?.previewOnly === true && typeof data.type === "string")
        this.dispatch(data);
    };
    this.setStatus("connected"); // Local same-origin preview channel, never a server connection.
  }

  private setStatus(status: "connected" | "connecting" | "disconnected") {
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }

  getStatus() {
    return this.status;
  }

  onStatusChange(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  subscribe(
    eventType: RealtimeEventType | "*",
    listener: Listener,
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  private dispatch(payload: RealtimeEventPayload) {
    if (payload.type === "HEARTBEAT") return;

    if (payload.type === "ORDER_STATUS_CHANGED") {
      this.playSound("ready");
      this.triggerHaptic([60, 80, 60]);
    } else if (
      payload.type === "SESSION_EXTENDED" ||
      payload.type === "STATION_STATUS_CHANGED"
    ) {
      this.playSound("ding");
      this.triggerHaptic([30, 40]);
    }

    this.listeners.get(payload.type)?.forEach((fn) => fn(payload));
    this.listeners.get("*")?.forEach((fn) => fn(payload));
  }

  /** Local preview only: no HTTP, SSE, server mutation or cross-origin delivery. */
  broadcastLocal(event: {
    type: RealtimeEventType;
    venueId?: string;
    userId?: string;
    stationId?: string;
    data: Record<string, any>;
  }): boolean {
    const payload = {
      ...event,
      timestamp: new Date().toISOString(),
      previewOnly: true,
    };
    this.dispatch(payload);
    this.previewChannel?.postMessage(payload);
    return true;
  }
}

export const realtime = new MobileRealtimeClient();
