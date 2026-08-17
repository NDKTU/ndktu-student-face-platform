import { useCallback, useEffect, useState } from 'react';
import { logger } from '@/utils/logger';

/**
 * Есть ли на этом компьютере веб-камера.
 *
 * Проверяется до начала теста, чтобы студент узнал о проблеме заранее, а не в тот
 * момент, когда прокторинг молча не запустился. Раньше тест с режимом `face`
 * просто проходил без надзора, и следа об этом не оставалось.
 *
 * Состояние `insecure` — отдельный и частый случай: браузер отдаёт список устройств
 * только на защищённом соединении. Если аудитория заходит по http, камера
 * не заработает ни у кого, и причина именно в этом, а не в оборудовании.
 */
export type CameraAvailability = 'checking' | 'available' | 'missing' | 'insecure' | 'error';

export function useCameraAvailability(enabled: boolean = true): {
    status: CameraAvailability;
    recheck: () => void;
} {
    const [status, setStatus] = useState<CameraAvailability>('checking');

    const check = useCallback(async () => {
        if (!enabled) return;

        try {
            // Оптимальная цепочка: на незащищённом соединении `mediaDevices`
            // отсутствует, и вызов возвращает undefined вместо списка устройств.
            const devices = await navigator.mediaDevices?.enumerateDevices?.();

            if (!devices) {
                setStatus('insecure');
                return;
            }

            // До выдачи разрешения браузер скрывает названия устройств, но сам
            // факт наличия видеовхода виден — этого достаточно.
            const hasCamera = devices.some((device) => device.kind === 'videoinput');
            setStatus(hasCamera ? 'available' : 'missing');
        } catch (error) {
            logger.error('Camera availability check failed', error);
            setStatus('error');
        }
    }, [enabled]);

    useEffect(() => {
        void check();

        // Камеру могут подключить, пока студент стоит перед модальным окном.
        const devices = navigator.mediaDevices;
        if (!devices?.addEventListener) return;

        const onChange = () => void check();
        devices.addEventListener('devicechange', onChange);
        return () => devices.removeEventListener('devicechange', onChange);
    }, [check]);

    return { status, recheck: check };
}
