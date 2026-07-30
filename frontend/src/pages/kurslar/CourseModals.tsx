import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import type { TopicDraft, LessonDraft } from '@/features/kurslar/model/courses.store';
import type { VideoType } from '@/entities/course/model/types';

export function TopicModal({
  mode,
  initial,
  onSave,
  onCancel,
}: {
  mode: 'add' | 'edit';
  initial: TopicDraft;
  onSave: (draft: TopicDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('kurslar');
  const { t: tc } = useTranslation('common');
  const [draft, setDraft] = useState(initial);

  return (
    <Modal
      title={mode === 'add' ? t('mavzuModal.add') : t('mavzuModal.edit')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => onSave(draft)}>{tc('save')}</Button>
        </>
      }
    >
      <ModalField label={t('mavzuModal.name')}>
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className={modalInputClass}
        />
      </ModalField>
      <ModalField label={t('mavzuModal.order')}>
        <input
          value={draft.order}
          onChange={(e) => setDraft((d) => ({ ...d, order: e.target.value }))}
          inputMode="numeric"
          className={modalInputClass}
        />
      </ModalField>
    </Modal>
  );
}

const VIDEO_TYPES: VideoType[] = ['youtube', 'upload'];

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
  const [draft, setDraft] = useState(initial);

  function set<K extends keyof LessonDraft>(key: K, value: LessonDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    <Modal
      title={mode === 'add' ? t('darsModal.add') : t('darsModal.edit')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => onSave(draft)}>{tc('save')}</Button>
        </>
      }
    >
      <ModalField label={t('darsModal.title')}>
        <input
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          className={modalInputClass}
        />
      </ModalField>

      <div className="grid grid-cols-2 gap-3.5">
        <ModalField label={t('darsModal.videoType')}>
          <select
            value={draft.videoType}
            onChange={(e) => set('videoType', e.target.value as VideoType)}
            className={modalInputClass}
          >
            {VIDEO_TYPES.map((v) => (
              <option key={v} value={v}>
                {t(`video.${v}`)}
              </option>
            ))}
          </select>
        </ModalField>
        <ModalField label={t('darsModal.dur')}>
          <input
            value={draft.dur}
            onChange={(e) => set('dur', e.target.value)}
            inputMode="numeric"
            className={modalInputClass}
          />
        </ModalField>
      </div>

      <ModalField label={t('darsModal.desc')}>
        <textarea
          value={draft.desc}
          onChange={(e) => set('desc', e.target.value)}
          rows={3}
          className={`${modalInputClass} h-auto py-2.5`}
        />
      </ModalField>

      {/* Поля домашнего задания отсюда убраны: на бэкенде задания живут своей
          таблицей и привязаны к курсу, а не к материалу, — их ведёт раздел
          «Vazifalar». Вместо них — ссылка на само видео. */}
      <ModalField label={t('darsModal.videoSrc')}>
        <input
          value={draft.videoSrc}
          onChange={(e) => set('videoSrc', e.target.value)}
          placeholder="https://youtu.be/... yoki /uploads/..."
          className={modalInputClass}
        />
      </ModalField>
    </Modal>
  );
}
