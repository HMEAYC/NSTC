import { useEffect, useRef, useCallback, useState } from "react";

export interface IMUFrame {
  type?: "imu" | "analysis" | "status";
  ts: number;
  device_id?: string;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
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
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;
      const delay = Math.min(1000 * 2 ** retriesRef.current, 30000);
      retriesRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [sessionId, onMessage]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { status, send };
}
