import { useEffect, useRef, useCallback, useState } from "react";

export interface IMUFrame {
  type?: "imu" | "analysis" | "status" | "music" | "music_start" | "rhythm_update" | "freeze_update";
  ts: number;
  device_id?: string;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}

export interface MusicInfo {
  bpm: number;
  beatTimes: number[];
  stopTimes: number[];
  duration: number;
  element: string | null;
  url: string | null;
}

export interface RhythmUpdate {
  type: "rhythm_update";
  sync_rate: number;
  bpm: number;
  peak_count: number;
  beat_count: number;
}

export interface FreezeUpdate {
  type: "freeze_update";
  stop_time: number;
  reaction_time: number;
  stability_score: number;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export function useWebSocket(
  sessionId: string,
  onMessage: (data: IMUFrame) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [music, setMusic] = useState<MusicInfo | null>(null);
  const [rhythm, setRhythm] = useState<RhythmUpdate | null>(null);
  const [freeze, setFreeze] = useState<FreezeUpdate | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setStatus("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/${sessionId}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setStatus("connected");
      retriesRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const frame: IMUFrame = JSON.parse(event.data);
        if (!frame.type || frame.type === "imu") {
          onMessage(frame);
        } else if (frame.type === "music") {
          const m = frame as unknown as MusicInfo & { session_id: string };
          setMusic({
            bpm: m.bpm,
            beatTimes: m.beatTimes ?? (frame as any).music_beat_times ?? [],
            stopTimes: m.stopTimes ?? (frame as any).music_stop_times ?? [],
            duration: m.duration ?? (frame as any).music_duration ?? 0,
            element: m.element ?? (frame as any).music_element ?? null,
            url: m.url ?? (frame as any).music_url ?? null,
          });
        } else if (frame.type === "rhythm_update") {
          setRhythm(frame as unknown as RhythmUpdate);
        } else if (frame.type === "freeze_update") {
          setFreeze(frame as unknown as FreezeUpdate);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;
      const MAX_RETRIES = 30;
      if (retriesRef.current >= MAX_RETRIES) {
        return;
      }
      const base = Math.min(1000 * 2 ** retriesRef.current, 30000);
      const jitter = Math.random() * 1000;
      const delay = base + jitter;
      retriesRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      if (wsRef.current) ws.close();
    };
    wsRef.current = ws;
  }, [sessionId, onMessage]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(timerRef.current);
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const sendMusicStart = useCallback(() => {
    send({ type: "music_start", ts: Date.now() });
  }, [send]);

  return { status, send, music, rhythm, freeze, sendMusicStart };
}
