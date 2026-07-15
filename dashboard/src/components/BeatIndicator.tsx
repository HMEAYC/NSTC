import { useState, useEffect, useRef } from "react";

interface BeatIndicatorProps {
  bpm: number;
  beatTimes: number[];
  rhythmSync?: number;
}

export default function BeatIndicator({ bpm, beatTimes, rhythmSync }: BeatIndicatorProps) {
  const [pulse, setPulse] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (bpm <= 0) return;
    const intervalMs = (60 / bpm) * 1000;
    intervalRef.current = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 120);
    }, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [bpm]);

  const syncColor = rhythmSync !== undefined
    ? rhythmSync > 0.6 ? "text-green-600" : rhythmSync > 0.3 ? "text-yellow-600" : "text-red-500"
    : "text-gray-400";

  return (
    <div className="flex items-center gap-4 py-2">
      {/* Pulsing dot */}
      <div className="relative flex items-center justify-center" style={{ width: 40, height: 40 }}>
        <div
          className={`absolute rounded-full bg-blue-500 transition-transform duration-100 ${
            pulse ? "scale-125 opacity-100" : "scale-100 opacity-60"
          }`}
          style={{ width: 24, height: 24 }}
        />
        <span className="relative text-white text-xs font-bold">{bpm}</span>
      </div>

      {/* Sync bar */}
      {rhythmSync !== undefined && (
        <div className="flex-1 max-w-xs">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400">節拍同步</span>
            <span className={`font-semibold ${syncColor}`}>
              {(rhythmSync * 100).toFixed(0)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${rhythmSync * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
