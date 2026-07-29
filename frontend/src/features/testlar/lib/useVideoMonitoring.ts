import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Видеонаблюдение на время теста.
 *
 * Кадры с камеры уходят в сервис распознавания лиц по WebSocket, он отвечает,
 * сколько лиц в кадре и тот ли это человек. Порт из прежнего интерфейса почти
 * без изменений: реализация обкатана, и переписывать её ради стиля значило бы
 * заново собирать те же грабли с жизненным циклом камеры.
 */

export interface VideoMonitoringConfig {
  serviceUrl: string;
  /** Токен для сервиса распознавания; выдаётся вместе с попыткой. */
  token?: string | null;
  /** Эталонное фото студента, с которым сравнивают кадры. */
  referenceImageUrl?: string | null;
  onMultipleFaces: (imageData: string) => void;
  onDifferentPerson?: (imageData: string) => void;
  onError?: (error: string) => void;
  /** Как часто отправлять кадр, мс. */
  frameInterval?: number;
}

export interface VideoMonitoringState {
  isActive: boolean;
  hasPermission: boolean;
  isConnected: boolean;
  lastFaceCount: number;
  isDifferentPerson: boolean;
  isReferenceCaptured: boolean;
  error: string | null;
}

const IDLE: VideoMonitoringState = {
  isActive: false,
  hasPermission: false,
  isConnected: false,
  lastFaceCount: 0,
  isDifferentPerson: false,
  isReferenceCaptured: false,
  error: null,
};

export function useVideoMonitoring(config: VideoMonitoringConfig) {
  const [state, setState] = useState<VideoMonitoringState>(IDLE);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastFrameRef = useRef<string>('');
  const startingRef = useRef(false);

  // Колбэки меняются на каждый рендер вызывающего, а слушатели сокета живут
  // всё прохождение — держим конфиг в ref, иначе они замкнутся на устаревшие.
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const captureFrame = useCallback((): string => {
    if (!videoRef.current || !canvasRef.current) return '';
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    return canvasRef.current.toDataURL('image/jpeg', 0.8);
  }, []);

  const start = useCallback(async () => {
    // Повторный вызов во время запуска завёл бы вторую камеру и второй сокет.
    if (startingRef.current || wsRef.current || streamRef.current) return;
    startingRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;

      // Элемент может быть отрисован вызывающим через <video ref=…>; если нет —
      // заводим свой, невидимый.
      if (!videoRef.current) {
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        videoRef.current = video;
      }
      videoRef.current.srcObject = stream;

      await new Promise<void>((resolve) => {
        const handler = () => {
          videoRef.current?.removeEventListener('loadedmetadata', handler);
          resolve();
        };
        videoRef.current?.addEventListener('loadedmetadata', handler);
      });
      await videoRef.current.play().catch(() => undefined);

      setState((prev) => ({ ...prev, hasPermission: true, isActive: true, error: null }));

      if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
      // На части мобильных браузеров размеры остаются нулевыми даже после
      // loadedmetadata — тогда кадр вышел бы пустым.
      canvasRef.current.width = videoRef.current.videoWidth || 640;
      canvasRef.current.height = videoRef.current.videoHeight || 480;

      const url = new URL(configRef.current.serviceUrl);
      if (configRef.current.token) url.searchParams.append('token', configRef.current.token);
      if (configRef.current.referenceImageUrl) {
        url.searchParams.append('image_url', configRef.current.referenceImageUrl);
      }

      const ws = new WebSocket(url.toString());

      ws.onopen = () => {
        setState((prev) => ({ ...prev, isConnected: true }));
        const interval = configRef.current.frameInterval ?? 1000;
        frameTimerRef.current = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN || !videoRef.current) return;
          const jpeg = captureFrame();
          lastFrameRef.current = jpeg;
          ws.send(jpeg);
        }, interval);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            face_count?: number;
            has_two_faces?: boolean;
            is_different_person?: boolean;
            is_reference_captured?: boolean;
          };

          setState((prev) => ({
            ...prev,
            lastFaceCount: data.face_count ?? 0,
            isDifferentPerson: data.is_different_person ?? false,
            isReferenceCaptured: data.is_reference_captured ?? false,
          }));

          // Кадр берём тот, что отправляли: он и есть доказательство.
          const frame = lastFrameRef.current || captureFrame();
          if (data.has_two_faces) configRef.current.onMultipleFaces(frame);
          else if (data.is_different_person) configRef.current.onDifferentPerson?.(frame);
        } catch {
          // Нечитаемое сообщение не должно ронять наблюдение.
        }
      };

      ws.onerror = () => {
        const message = 'Yuzni aniqlash xizmatiga ulanib bo‘lmadi';
        setState((prev) => ({ ...prev, isConnected: false, error: message }));
        configRef.current.onError?.(message);
      };

      ws.onclose = () => setState((prev) => ({ ...prev, isConnected: false }));

      wsRef.current = ws;
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Kameraga ruxsat berilmadi'
          : error instanceof Error
            ? error.message
            : 'Kamerani ishga tushirib bo‘lmadi';

      setState((prev) => ({ ...prev, hasPermission: false, isActive: false, error: message }));
      configRef.current.onError?.(message);
    } finally {
      startingRef.current = false;
    }
  }, [captureFrame]);

  const stop = useCallback(() => {
    if (frameTimerRef.current) {
      clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;

    // Камеру надо погасить явно: без остановки дорожек индикатор записи
    // останется гореть до перезагрузки вкладки.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;
    setState((prev) => ({ ...prev, isActive: false, isConnected: false, lastFaceCount: 0 }));
  }, []);

  useEffect(() => stop, [stop]);

  return { state, start, stop, videoRef };
}
