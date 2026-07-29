import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useVideoMonitoring } from './useVideoMonitoring';

/**
 * Самая рискованная часть прохождения теста: живая камера и открытый сокет.
 * Проверяем то, что ломается молча, — адрес подключения, разбор ответа и
 * освобождение камеры.
 */

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;

  url: string;
  readyState = 1;
  sent: string[] = [];
  closed = false;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }
}

const stopTrack = vi.fn();

function fakeStream() {
  return { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
}

const getUserMedia = vi.fn();

beforeEach(() => {
  FakeWebSocket.instances = [];
  stopTrack.mockClear();
  getUserMedia.mockReset().mockResolvedValue(fakeStream());

  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

  // jsdom не проигрывает видео и не сообщает о готовности метаданных сам.
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: () => Promise.resolve(),
  });
  vi.spyOn(HTMLVideoElement.prototype, 'addEventListener').mockImplementation(
    ((_: string, handler: EventListenerOrEventListenerObject) => {
      (handler as EventListener)(new Event('loadedmetadata'));
    }) as typeof HTMLVideoElement.prototype.addEventListener,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const config = (over: Partial<Parameters<typeof useVideoMonitoring>[0]> = {}) => ({
  serviceUrl: 'ws://localhost/v1/video/stream',
  onMultipleFaces: vi.fn(),
  ...over,
});

describe('useVideoMonitoring', () => {
  it('токен и эталонное фото уходят в адрес сокета', async () => {
    const { result } = renderHook(() =>
      useVideoMonitoring(config({ token: 'ws-token', referenceImageUrl: '/uploads/me.png' })),
    );

    await act(() => result.current.start());

    const socket = FakeWebSocket.instances[0]!;
    // Без токена сервис распознавания отклонит подключение, без фото — не с чем
    // будет сравнивать лицо.
    expect(socket.url).toContain('token=ws-token');
    expect(socket.url).toContain('image_url=%2Fuploads%2Fme.png');
  });

  it('«в кадре двое» доходит до вызывающего вместе с кадром', async () => {
    const onMultipleFaces = vi.fn();
    const { result } = renderHook(() => useVideoMonitoring(config({ onMultipleFaces })));

    await act(() => result.current.start());
    const socket = FakeWebSocket.instances[0]!;

    act(() => {
      socket.onopen?.();
      socket.onmessage?.({ data: JSON.stringify({ face_count: 2, has_two_faces: true }) });
    });

    expect(onMultipleFaces).toHaveBeenCalledOnce();
    expect(onMultipleFaces.mock.calls[0]![0]).toMatch(/^data:image\/jpeg/);
    await waitFor(() => expect(result.current.state.lastFaceCount).toBe(2));
  });

  it('нечитаемое сообщение не роняет наблюдение', async () => {
    const { result } = renderHook(() => useVideoMonitoring(config()));
    await act(() => result.current.start());
    const socket = FakeWebSocket.instances[0]!;

    act(() => {
      socket.onopen?.();
      expect(() => socket.onmessage?.({ data: 'not json' })).not.toThrow();
    });
    expect(result.current.state.isConnected).toBe(true);
  });

  it('stop гасит камеру, а не только сокет', async () => {
    const { result } = renderHook(() => useVideoMonitoring(config()));
    await act(() => result.current.start());

    act(() => result.current.stop());

    // Без остановки дорожек индикатор записи горел бы до перезагрузки вкладки.
    expect(stopTrack).toHaveBeenCalled();
    expect(FakeWebSocket.instances[0]!.closed).toBe(true);
    expect(result.current.state.isActive).toBe(false);
  });

  it('повторный start не заводит вторую камеру', async () => {
    const { result } = renderHook(() => useVideoMonitoring(config()));

    await act(() => result.current.start());
    await act(() => result.current.start());

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('отказ в доступе к камере превращается в понятную ошибку', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    const onError = vi.fn();
    const { result } = renderHook(() => useVideoMonitoring(config({ onError })));

    await act(() => result.current.start());

    expect(result.current.state.hasPermission).toBe(false);
    expect(result.current.state.error).toBe('Kameraga ruxsat berilmadi');
    expect(onError).toHaveBeenCalledWith('Kameraga ruxsat berilmadi');
  });
});
