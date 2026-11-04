// Real-time Event Hub using native browser EventSource (SSE) + Web Audio API
export type RealtimeEventType =
  | 'ORDER_CREATED'
  | 'ORDER_STATUS_CHANGED'
  | 'STATION_STATUS_CHANGED'
  | 'STAFF_CALL'
  | 'SESSION_EXTENDED'
  | 'PC_LOCK_EVENT'
  | 'HEARTBEAT';

export interface RealtimeEventPayload {
  type: RealtimeEventType;
  venueId?: string;
  userId?: string;
  stationId?: string;
  timestamp: string;
  data: Record<string, any>;
}

type Listener = (payload: RealtimeEventPayload) => void;
type StatusListener = (status: 'connected' | 'connecting' | 'disconnected') => void;

class RealtimeClient {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, Set<Listener>> = new Map();
  private statusListeners: Set<StatusListener> = new Set();
  private status: 'connected' | 'connecting' | 'disconnected' = 'disconnected';
  private reconnectTimer: any = null;
  private audioCtx: AudioContext | null = null;

  constructor() {
    this.connect();
  }

  private initAudio() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Synthesize crisp sound effects via Web Audio API without needing external mp3 files
   */
  playSound(type: 'order' | 'alert' | 'success') {
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'order') {
        // High-low cheerful chime (E5 -> G5)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'alert') {
        // Double pulse attention alert
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.setValueAtTime(680, now + 0.1);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'success') {
        // Soft positive blip
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch {
      // Audio autoplay policy fallback
    }
  }

  connect() {
    if (typeof window === 'undefined') return;
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.setStatus('connecting');

    // Works with both direct backend port 3000 and Vite proxy /v1
    const sseUrl = '/v1/events/stream';

    try {
      this.eventSource = new EventSource(sseUrl);

      this.eventSource.onopen = () => {
        this.setStatus('connected');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.eventSource.onmessage = (e) => {
        try {
          const payload: RealtimeEventPayload = JSON.parse(e.data);
          this.dispatch(payload);
        } catch {
          // heartbeat or non-json message
        }
      };

      this.eventSource.onerror = () => {
        this.setStatus('disconnected');
        this.eventSource?.close();
        this.eventSource = null;
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 3500);
        }
      };
    } catch {
      this.setStatus('disconnected');
    }
  }

  private setStatus(status: 'connected' | 'connecting' | 'disconnected') {
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

  subscribe(eventType: RealtimeEventType | '*', listener: Listener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  private dispatch(payload: RealtimeEventPayload) {
    if (payload.type === 'HEARTBEAT') return;

    // Trigger sound cues
    if (payload.type === 'ORDER_CREATED') {
      this.playSound('order');
    } else if (payload.type === 'STAFF_CALL') {
      this.playSound('alert');
    } else if (payload.type === 'SESSION_EXTENDED' || payload.type === 'STATION_STATUS_CHANGED') {
      this.playSound('success');
    }

    // Notify specific type listeners
    this.listeners.get(payload.type)?.forEach((fn) => fn(payload));
    // Notify wildcard listeners
    this.listeners.get('*')?.forEach((fn) => fn(payload));
  }

  async broadcast(event: {
    type: RealtimeEventType;
    venueId?: string;
    userId?: string;
    stationId?: string;
    data: Record<string, any>;
  }): Promise<boolean> {
    try {
      const res = await fetch('/v1/events/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const realtime = new RealtimeClient();
