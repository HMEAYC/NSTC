import { useRef, useCallback, useState } from "react";
import type { IMUFrame } from "./useWebSocket";

export type MetricLevel = "low" | "medium" | "high";
export type RatingLabel = "smooth" | "average" | "jerky" | "stable" | "moderate" | "unstable";

export interface LiveMetrics {
  activityLevel: number;
  activityCategory: MetricLevel;
  smoothness: number;
  smoothnessLabel: RatingLabel;
  stabilityIndex: number;
  stabilityLabel: RatingLabel;
  avgErrorMs: number;
  reactionTime: number;
  freezeStability: number;
  displacementCm: number;
  sampleCount: number;
  windowSeconds: number;
  history: number[];
}

const WINDOW_SIZE = 100;
const MAX_HISTORY = 60;

export function useLiveMetrics() {
  const bufferRef = useRef<IMUFrame[]>([]);
  const historyRef = useRef<number[]>([]);
  const [metrics, setMetrics] = useState<LiveMetrics>({
    activityLevel: 0,
    activityCategory: "low",
    smoothness: 0,
    smoothnessLabel: "smooth",
    stabilityIndex: 1,
    stabilityLabel: "stable",
    avgErrorMs: 0,
    reactionTime: 0,
    freezeStability: 0,
    displacementCm: 0,
    sampleCount: 0,
    windowSeconds: 0,
    history: [],
  });

  const onMessage = useCallback((frame: IMUFrame) => {
    const buf = bufferRef.current;
    buf.push(frame);
    if (buf.length > WINDOW_SIZE) buf.shift();
    if (buf.length < 10) return;

    const mag = (f: IMUFrame) => Math.sqrt(f.ax * f.ax + f.ay * f.ay + f.az * f.az);
    const mags = buf.map(mag);

    const sumSq = mags.reduce((s, m) => s + m * m, 0);
    const rms = Math.sqrt(sumSq / mags.length);
    const mean = mags.reduce((s, m) => s + m, 0) / mags.length;
    const variance = mags.reduce((s, m) => s + (m - mean) ** 2, 0) / mags.length;
    const std = Math.sqrt(variance);
    const cv = mean > 0.01 ? std / mean : 0;

    const activityLevel = rms;
    const smoothness = cv;
    const stabilityIndex = Math.max(0, Math.min(1, 1 - cv));

    const windowSeconds = buf.length > 1
      ? (buf[buf.length - 1].ts - buf[0].ts) / 1000
      : 0;

    const h = historyRef.current;
    h.push(activityLevel);
    if (h.length > MAX_HISTORY) h.shift();

    setMetrics({
      activityLevel: Math.round(activityLevel * 100) / 100,
      activityCategory: activityLevel < 0.3 ? "low" : activityLevel < 0.8 ? "medium" : "high",
      smoothness: Math.round(smoothness * 100) / 100,
      smoothnessLabel: cv < 0.3 ? "smooth" : cv < 0.6 ? "average" : "jerky",
      stabilityIndex: Math.round(stabilityIndex * 100) / 100,
      stabilityLabel: stabilityIndex >= 0.7 ? "stable" : stabilityIndex >= 0.4 ? "moderate" : "unstable",
      avgErrorMs: 0,
      reactionTime: 0,
      freezeStability: 0,
      displacementCm: 0,
      sampleCount: buf.length,
      windowSeconds: Math.round(windowSeconds * 10) / 10,
      history: [...h],
    });
  }, []);

  return { metrics, onMessage };
}
