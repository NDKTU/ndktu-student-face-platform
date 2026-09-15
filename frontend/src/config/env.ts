/**
 * Environment configuration for the frontend
 */

const sameOriginWs = () => {
    if (typeof window === 'undefined') return 'ws:///v1/video/stream';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/v1/video/stream`;
};

// Face Detection Service URL (WebSocket). Defaults to same-origin /v1/video/stream
// so an nginx reverse proxy can route it to the face-detection container.
export const FACE_DETECTION_SERVICE_URL =
    import.meta.env.VITE_FACE_DETECTION_SERVICE_URL || sameOriginWs();

// Backend API URL. Defaults to same-origin /api so nginx can route it to the backend.
export const API_BASE_URL =
    import.meta.env.VITE_API_URL || '/api';

// Enable Face Detection during Quiz (set to false to disable proctoring)
export const ENABLE_QUIZ_PROCTORING =
    import.meta.env.VITE_ENABLE_QUIZ_PROCTORING !== 'false';
