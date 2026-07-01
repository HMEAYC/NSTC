import { useEffect, useRef, useCallback } from "react";

export function useWebSocket(sessionId: string) {
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(`ws://localhost:8080/ws/${sessionId}`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // TODO: dispatch data to store/chart
      console.log("IMU data received:", data);
    };
    wsRef.current = ws;
  }, [sessionId]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  return { ws: wsRef.current };
}
