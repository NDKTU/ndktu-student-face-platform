import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTasksStore } from '@/features/vazifalar/model/tasks.store';
import type { TaskDetail, TaskSubmissionRow } from '@/entities/task/model/types';
import { Button } from '@/shared/ui/Button';
import { ModalField, modalInputClass } from '@/shared/ui/Modal';
import { useToast } from '@/shared/ui/Toast';
import { SUB_TONE } from './adminVazifaTones';

/** Проверка одной сдачи: ответ студента + панель выставления оценки. */
export function AdminSubmissionGrade({
  task,
  submission,
  onBack,
  onGraded,
}: {
  task: TaskDetail;
  submission: TaskSubmissionRow;
  onBack: () => void;
  onGraded: (nextId: number | null) => void;
}) {
  const { t } = useTranslation('vazifalar');
  const toast = useToast();
  const grade = useTasksStore((s) => s.grade);

  const [ball, setBall] = useState(submission.ball != null ? String(submission.ball) : '');
  const [feedback, setFeedback] = useState(submission.feedback);

  const tone = SUB_TONE[submission.status];

  // Следующая непроверенная сдача (для «Saqlash va keyingisi»).
  const gradable = task.subs.filter((s) => s.status !== 'topshirilmagan');
  const idx = gradable.findIndex((s) => s.id === submission.id);
  const next = gradable.slice(idx + 1).find((s) => s.status !== 'baholangan') ?? null;

  async function save(goNext: boolean) {
    const parsed = parseInt(ball, 10);
    if (Number.isNaN(parsed)) {
      toast(t('admin.grade.invalid'));
      return;
    }
    try {
      await grade(task.id, submission.id, Math.max(0, Math.min(100, parsed)), feedback.trim());
      toast(t('admin.grade.saved'));
      if (goNext && next) onGraded(next.id);
      else onGraded(null);
    } catch (e) {
      // Экран не закрываем: оценку нужно суметь выставить повторно.
      toast(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 rounded-18 border border-line bg-surface p-6 shadow-card">
        <div className="flex items-start gap-3.5">
          <span className="grid size-[46px] flex-none place-items-center rounded-full bg-brand-soft text-14 font-bold text-brand">
            {submission.initials}
          </span>
          <div>
            <h1 className="m-0 text-20 leading-[1.2] font-extrabold tracking-[-0.02em] text-ink">
              {submission.fish}
            </h1>
            <div className="mt-1 text-13 text-ink-subtle">
              {task.title} · {task.guruh} · {task.oqituvchi}
            </div>
          </div>
        </div>
        <span className="rounded-20 px-2.5 py-1 text-11-5 font-bold" style={{ background: tone.bg, color: tone.fg }}>
          {t(`admin.subStatus.${submission.status}`)}
        </span>
      </div>

      <div className="grid items-start gap-[18px] lg:grid-cols-2">
        <section className="rounded-18 border border-line bg-surface p-6 shadow-card">
          <div className="text-14 font-bold text-ink">{t('admin.grade.studentAnswer')}</div>
          {submission.submittedAt && (
            <div className="mt-1 text-12 text-ink-subtle">
              {t('admin.grade.submittedAt', { date: submission.submittedAt })}
            </div>
          )}
          <div className="mt-3 flex flex-col gap-2.5">
            {submission.files.map((file) => (
              <div key={file.name} className="flex items-center gap-3 rounded-11 border border-surface-sunken bg-surface-raised px-3.5 py-2.5">
                <span className="rounded-8 bg-danger-soft px-2 py-1 text-11 font-bold text-danger uppercase">{file.type}</span>
                <span className="flex-1 truncate text-13-5 font-semibold text-ink">{file.name}</span>
                <button
                  type="button"
                  onClick={() => toast(`${t('admin.grade.view')}: ${file.name}`)}
                  className="cursor-pointer border-none bg-transparent p-0 text-12-5 font-bold text-brand hover:underline"
                >
                  {t('admin.grade.view')}
                </button>
              </div>
            ))}
            {submission.text && (
              <div className="rounded-11 bg-surface-raised px-3.5 py-2.5 text-13-5 text-ink-secondary">
                {submission.text}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-18 border border-line bg-surface p-6 shadow-card">
          <div className="text-14 font-bold text-ink">{t('admin.grade.panel')}</div>

          {submission.status === 'baholangan' && submission.ball != null && (
            <div className="mt-3 rounded-11 bg-success-tint px-3.5 py-2.5 text-13 font-bold text-success">
              {t('admin.grade.current', { ball: submission.ball })}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-3.5">
            <ModalField label={t('admin.grade.ball')}>
              <input
                value={ball}
                onChange={(e) => setBall(e.target.value)}
                inputMode="numeric"
                className={modalInputClass}
              />
            </ModalField>
            <ModalField label={t('admin.grade.izoh')}>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
                className={`${modalInputClass} h-auto py-2.5`}
              />
            </ModalField>
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            <Button className="w-full justify-center" onClick={() => void save(true)} disabled={!next}>
              {t('admin.grade.saveNext')}
            </Button>
            <Button variant="secondary" className="w-full justify-center" onClick={() => void save(false)}>
              {t('admin.grade.save')}
            </Button>
            <button
              type="button"
              onClick={onBack}
              className="cursor-pointer border-none bg-transparent py-1 text-13 font-semibold text-ink-muted hover:text-brand"
            >
              {t('admin.grade.back')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
