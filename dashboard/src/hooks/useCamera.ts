import { useEffect, useRef, useCallback, useState } from "react";

export type CameraStatus = "inactive" | "requesting" | "streaming" | "error";

export interface PoseResult {
  person_id: number;
  bbox: [number, number, number, number];
  keypoints: [number, number][];
  movement: number;
}

export interface PoseUpdate {
  type: "pose_update";
  poses: PoseResult[];
  frame_count: number;
  fps: number;
  person_count: number;
  cv_metrics?: CVMetrics;
}

export interface CVMetrics {
  engagement: number;
  formation_stability: number;
  spatial_utilization: number;
  gait_symmetry: number;
  balance_sway: number;
  limb_coordination: number;
}

export interface CvUpdate {
  type: "cv_update";
  metrics: CVMetrics;
}

export function useCamera(
  send: (data: unknown) => void,
  sendBinary: (data: ArrayBuffer) => void,
  wsConnected: boolean,
) {
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("inactive");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const sendRef = useRef(send);
  const sendBinaryRef = useRef(sendBinary);
  sendRef.current = send;
  sendBinaryRef.current = sendBinary;

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }
    setCameraStatus("inactive");
    sendRef.current({ type: "camera_stop" });
  }, []);

  const startCamera = useCallback(async () => {
    if (!wsConnected) return;
    setCameraStatus("requesting");

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "environment" },
        audio: false,
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setCameraStatus("streaming");

      sendRef.current({ type: "camera_start", fps: 10 });

      const video = document.createElement("video");
      video.srcObject = mediaStream;
      video.setAttribute("playsinline", "true");
      await video.play();
      videoElRef.current = video;

      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d")!;

      intervalRef.current = setInterval(() => {
        if (!videoElRef.current) return;
        ctx.drawImage(videoElRef.current, 0, 0, 640, 480);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              blob.arrayBuffer().then((buf) => {
                sendBinaryRef.current(buf);
              });
            }
          },
          "image/jpeg",
          0.6
        );
      }, 100);
    } catch (err) {
      console.error("Camera access failed:", err);
      setCameraStatus("error");
    }
  }, [wsConnected]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return { cameraStatus, startCamera, stopCamera, stream };
}
