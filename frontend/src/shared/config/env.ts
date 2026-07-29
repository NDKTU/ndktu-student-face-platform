/**
 * Адрес WebSocket распознавания лица.
 *
 * По умолчанию — тот же origin: nginx проксирует /v1/video/stream на контейнер
 * face-detection, поэтому отдельный хост задавать не нужно. Переменная
 * пригодится, только если сервис вынесут наружу.
 */
function sameOriginWs(): string {
  if (typeof window === 'undefined') return 'ws:///v1/video/stream';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/v1/video/stream`;
}

export const FACE_DETECTION_SERVICE_URL =
  import.meta.env.VITE_FACE_DETECTION_SERVICE_URL || sameOriginWs();
