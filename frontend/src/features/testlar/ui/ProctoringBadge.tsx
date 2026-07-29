import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/features/auth/model/session.store';
import { uploadCheatingEvidence } from '@/shared/api/testlar';
import { FACE_DETECTION_SERVICE_URL } from '@/shared/config/env';
import { useVideoMonitoring } from '../lib/useVideoMonitoring';

/** После стольких нарушений тест прерывается. */
const MAX_WARNINGS = 3;

/** Пауза между засчитанными нарушениями: сервис шлёт кадры каждую секунду. */
const WARNING_COOLDOWN_MS = 3000;

interface ProctoringBadgeProps {
  quizId: number;
  token: string | null;
  referenceImageUrl: string | null;
  /** Вызывается на третьем нарушении: тест завершается с пометкой. */
  onCheatingDetected: (reason: string, imageUrl: string | null) => void;
}

/**
 * Индикатор видеонаблюдения поверх теста.
 *
 * Одно нарушение — не повод прерывать работу: в кадр может на секунду попасть
 * кто-то посторонний. Поэтому нарушения копятся, между ними выдерживается
 * пауза, и только третье завершает тест.
 */
export function ProctoringBadge({
  quizId,
  token,
  referenceImageUrl,
  onCheatingDetected,
}: ProctoringBadgeProps) {
  const { t } = useTranslation('testlar');
  const userId = useSessionStore((s) => s.user?.id ?? null);

  const [warnings, setWarnings] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const warningsRef = useRef(0);
  const lastWarningAt = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);

  const registerViolation = useCallback(
    (reason: string, frame: string) => {
      if (finishedRef.current) return;

      const now = Date.now();
      if (now - lastWarningAt.current < WARNING_COOLDOWN_MS) return;
      lastWarningAt.current = now;

      const next = warningsRef.current + 1;
      warningsRef.current = next;
      setWarnings(next);
      setShowWarning(true);

      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShowWarning(false), 4000);

      if (next < MAX_WARNINGS) return;

      finishedRef.current = true;
      // Кадр сохраняем до завершения: после него попытка закрыта, и доказательство
      // прикрепить будет уже не к чему.
      void (async () => {
        let url: string | null = null;
        if (userId !== null) {
          url = await uploadCheatingEvidence(quizId, userId, frame).catch(() => null);
        }
        onCheatingDetected(reason, url);
      })();
    },
    [quizId, userId, onCheatingDetected],
  );

  const { state, start, stop, videoRef } = useVideoMonitoring({
    serviceUrl: FACE_DETECTION_SERVICE_URL,
    token,
    referenceImageUrl,
    frameInterval: 500,
    onMultipleFaces: (frame) => registerViolation('multiple_faces', frame),
    onDifferentPerson: (frame) => registerViolation('different_person', frame),
  });

  useEffect(() => {
    void start();
    return stop;
  }, [start, stop]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const broken = state.error !== null;

  return (
    <div className="fixed right-5 bottom-5 z-[80] flex flex-col items-end gap-2">
      {showWarning && (
        <div className="w-[280px] rounded-14 border border-danger-soft bg-danger-soft px-3.5 py-3 shadow-card">
          <div className="text-11 font-bold tracking-[0.04em] text-danger uppercase">
            {t('proctoring.warningTitle', { count: warnings, max: MAX_WARNINGS })}
          </div>
          <div className="mt-1 text-12-5 leading-[1.4] text-ink-secondary">
            {t('proctoring.warningText', { max: MAX_WARNINGS })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2.5 rounded-12 border border-line bg-surface px-3.5 py-2.5 shadow-card">
        {/* Кадры снимаются с этого элемента; показываем его маленьким, чтобы
            студент видел, что именно уходит на проверку. */}
        <video
          ref={videoRef}
          className="size-[46px] flex-none rounded-9 bg-canvas object-cover"
          muted
          playsInline
        />
        <div className="leading-[1.25]">
          <div className="text-12 font-bold text-ink">
            {broken
              ? t('proctoring.offline')
              : state.isConnected
                ? t('proctoring.online')
                : t('proctoring.connecting')}
          </div>
          <div className="text-11 text-ink-subtle">
            {broken
              ? state.error
              : t('proctoring.faces', { count: state.lastFaceCount })}
          </div>
        </div>
        {warnings > 0 && (
          <span className="grid size-[22px] flex-none place-items-center rounded-full bg-danger text-11 font-bold text-white">
            {warnings}
          </span>
        )}
      </div>
    </div>
  );
}
