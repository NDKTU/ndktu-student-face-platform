import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HomeworkDraft, LessonDraft } from '@/features/kurslar/model/courses.store';
import type { Resource, VideoType } from '@/entities/course/model/types';
import { uploadCourseFile } from '@/shared/api/kurslar';
import { Button } from '@/shared/ui/Button';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { useToast } from '@/shared/ui/Toast';

/**
 * Форма урока: видео, вложения и домашнее задание.
 *
 * Видео и вложения — это ссылки: файл уходит в `/resource/upload` сразу при
 * выборе и возвращается URL-ом, а в материале хранится только он.
 */

/** Совпадает с VIDEO_MAX_BYTES на бэкенде: nginx-ный 413 клиенту не прочитать. */
const VIDEO_MAX_MB = 150;
const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime,video/x-m4v';
const FILE_ACCEPT = '.pdf,.docx,.xlsx,.pptx,image/*';

/** «1024» байт → «1 KB»: тот же формат, что приходит с сервера. */
function toSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EMPTY_HOMEWORK: HomeworkDraft = { title: '', desc: '', deadline: '', maxBall: '100' };

// Подпись поля вне ModalField: он оборачивает содержимое в <label>, и тогда
// клик по кнопке рядом переводил бы фокус в чужой инпут.
const LABEL_CLASS = 'mb-1.5 block text-12-5 font-semibold text-ink-muted';
const DASHED_BUTTON =
  'flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-11 border border-dashed border-line-strong bg-transparent py-2.5 text-13 font-bold text-brand hover:bg-brand-soft';

export function LessonModal({
  mode,
  initial,
  onSave,
  onCancel,
}: {
  mode: 'add' | 'edit';
  initial: LessonDraft;
  onSave: (draft: LessonDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('kurslar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();

  const [draft, setDraft] = useState<LessonDraft>(initial);
  const [uploading, setUploading] = useState(false);
  const videoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function set<K extends keyof LessonDraft>(key: K, value: LessonDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setUy<K extends keyof HomeworkDraft>(key: K, value: HomeworkDraft[K]) {
    setDraft((d) => (d.uy ? { ...d, uy: { ...d.uy, [key]: value } } : d));
  }

  /** Общая для видео и вложений загрузка: проверка размера, запрос, ошибка. */
  async function upload(file: File, maxMb: number): Promise<string | null> {
    if (file.size > maxMb * 1024 * 1024) {
      // Проверяем до запроса: иначе пользователь ждёт всю загрузку, чтобы
      // получить непереводимый «HTTP 413» от nginx.
      toast(t('darsModal.tooBig', { mb: maxMb }));
      return null;
    }
    setUploading(true);
    try {
      const { url } = await uploadCourseFile(file);
      return url;
    } catch (e) {
      toast(`${t('toast.uploadFailed')}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function pickVideo(file: File) {
    const url = await upload(file, VIDEO_MAX_MB);
    if (url) set('videoSrc', url);
  }

  async function pickResource(file: File) {
    const url = await upload(file, VIDEO_MAX_MB);
    if (!url) return;
    const added: Resource = { name: file.name, url, size: toSize(file.size), bytes: file.size };
    setDraft((d) => ({ ...d, attachments: [...d.attachments, added] }));
  }

  function submit() {
    if (!draft.title.trim()) {
      toast(t('validation.titleRequired'));
      return;
    }
    if (!draft.videoSrc.trim()) {
      toast(t('validation.videoRequired'));
      return;
    }
    if (draft.uy) {
      if (!draft.uy.title.trim()) {
        toast(t('validation.uyTitleRequired'));
        return;
      }
      if (!draft.uy.deadline) {
        toast(t('validation.uyDeadlineRequired'));
        return;
      }
    }
    onSave(draft);
  }

  return (
    <Modal
      title={mode === 'add' ? t('darsModal.add') : t('darsModal.edit')}
      onClose={onCancel}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit} disabled={uploading}>
            {tc('save')}
          </Button>
        </>
      }
    >
      <ModalField label={t('darsModal.title')}>
        <input
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder={t('darsModal.titlePlaceholder')}
          className={modalInputClass}
          autoFocus
        />
      </ModalField>

      <div>
        <span className={LABEL_CLASS}>{t('darsModal.videoSource')}</span>
        <div className="flex gap-1 rounded-11 border border-line bg-surface p-1">
          {(['youtube', 'upload'] as VideoType[]).map((type) => (
            <button
              key={type}
              type="button"
              // Ссылку не стираем: промах по вкладке должен быть обратим.
              onClick={() => set('videoType', type)}
              className={`flex h-[38px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-9 border-none text-13 font-bold ${
                draft.videoType === type
                  ? 'bg-brand text-white'
                  : 'bg-transparent text-ink-secondary hover:bg-brand-soft'
              }`}
            >
              {type === 'youtube' ? <PlayIcon /> : <UploadIcon />}
              {t(type === 'youtube' ? 'darsModal.youtubeTab' : 'darsModal.uploadTab')}
            </button>
          ))}
        </div>

        {draft.videoType === 'youtube' ? (
          <input
            value={draft.videoSrc}
            onChange={(e) => set('videoSrc', e.target.value)}
            placeholder={t('darsModal.urlPlaceholder')}
            className={`${modalInputClass} mt-2.5`}
          />
        ) : (
          <div className="mt-2.5 flex items-center gap-2.5">
            <input
              ref={videoInput}
              type="file"
              accept={VIDEO_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void pickVideo(file);
              }}
            />
            <Button
              variant="secondary"
              className="h-[42px] flex-none rounded-11"
              disabled={uploading}
              onClick={() => videoInput.current?.click()}
            >
              <UploadIcon />
              {uploading ? t('darsModal.uploading') : t('darsModal.pickVideo')}
            </Button>
            <span className="min-w-0 flex-1 truncate text-12-5 text-ink-subtle">
              {draft.videoSrc}
            </span>
          </div>
        )}
      </div>

      <ModalField label={t('darsModal.dur')}>
        <input
          value={draft.dur}
          onChange={(e) => set('dur', e.target.value)}
          inputMode="numeric"
          placeholder={t('darsModal.durPlaceholder')}
          className={`${modalInputClass} w-[120px]`}
        />
      </ModalField>

      <ModalField label={t('darsModal.desc')}>
        <textarea
          value={draft.desc}
          onChange={(e) => set('desc', e.target.value)}
          rows={3}
          placeholder={t('darsModal.descPlaceholder')}
          className={`${modalInputClass} h-auto py-2.5`}
        />
      </ModalField>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className={`${LABEL_CLASS} mb-0`}>{t('darsModal.resources')}</span>
          <input
            ref={fileInput}
            type="file"
            accept={FILE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void pickResource(file);
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            className="cursor-pointer border-none bg-transparent p-0 text-13 font-bold text-brand hover:underline disabled:cursor-not-allowed disabled:text-ink-subtle"
          >
            + {t('darsModal.addResource')}
          </button>
        </div>

        <div className="border-t border-surface-sunken pt-2.5">
          {draft.attachments.length === 0 ? (
            <div className="py-2 text-13 text-ink-subtle">{t('darsModal.noResources')}</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {draft.attachments.map((r, i) => (
                <div
                  key={r.url}
                  className="flex items-center gap-3 rounded-10 bg-surface-raised px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-13 font-semibold text-ink">
                    {r.name}
                  </span>
                  <span className="flex-none text-12 text-ink-subtle">{r.size}</span>
                  <button
                    type="button"
                    aria-label={t('darsModal.removeResource')}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        attachments: d.attachments.filter((_, j) => j !== i),
                      }))
                    }
                    className="grid size-6 flex-none cursor-pointer place-items-center rounded-8 border-none bg-transparent text-ink-subtle hover:bg-danger-soft hover:text-danger"
                  >
                    <CloseIcon />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {draft.uy ? (
        <div className="rounded-14 border border-line bg-surface-raised p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-13-5 font-bold text-ink">{t('uy.title')}</span>
            <button
              type="button"
              onClick={() => set('uy', null)}
              className="cursor-pointer border-none bg-transparent p-0 text-12-5 font-bold text-danger hover:underline"
            >
              {t('darsModal.removeUy')}
            </button>
          </div>

          <ModalField label={t('uy.name')}>
            <input
              value={draft.uy.title}
              onChange={(e) => setUy('title', e.target.value)}
              placeholder={t('uy.namePlaceholder')}
              className={modalInputClass}
            />
          </ModalField>

          <div className="mt-3 grid grid-cols-2 gap-3.5">
            <ModalField label={t('uy.deadline')}>
              <input
                type="date"
                value={draft.uy.deadline}
                onChange={(e) => setUy('deadline', e.target.value)}
                className={modalInputClass}
              />
            </ModalField>
            <ModalField label={t('uy.maxBall')}>
              <input
                value={draft.uy.maxBall}
                onChange={(e) => setUy('maxBall', e.target.value)}
                inputMode="numeric"
                className={modalInputClass}
              />
            </ModalField>
          </div>

          <div className="mt-3">
            <ModalField label={t('uy.desc')}>
              <textarea
                value={draft.uy.desc}
                onChange={(e) => setUy('desc', e.target.value)}
                rows={2}
                placeholder={t('uy.descPlaceholder')}
                className={`${modalInputClass} h-auto py-2.5`}
              />
            </ModalField>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => set('uy', EMPTY_HOMEWORK)} className={DASHED_BUTTON}>
          + {t('darsModal.addUy')}
        </button>
      )}
    </Modal>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
