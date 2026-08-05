import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCourseOptionsStore } from '@/features/kurslar/model/courseOptions.store';
import type { CourseDraft } from '@/features/kurslar/model/courses.store';
import { Button } from '@/shared/ui/Button';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { useToast } from '@/shared/ui/Toast';

/**
 * Форма курса: преподаватель, фан, группа.
 *
 * Название курса на бэкенде обязательное, но в интерфейсе его нет — оно
 * собирается из выбранных фана и группы. Показывают всё равно `subject.name`,
 * так что отдельное поле только просило бы ввести то же самое второй раз.
 */

/** `name` в схеме курса — max 255; длинный фан с группой её перебирает. */
const NAME_MAX = 255;

export function CourseModal({
  mode,
  initial,
  /** У курса больше одной группы: селект один, и трогать их нельзя. */
  multiGroup = false,
  onSave,
  onCancel,
}: {
  mode: 'add' | 'edit';
  initial: CourseDraft;
  multiGroup?: boolean;
  onSave: (name: string, draft: CourseDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('kurslar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();

  const subjects = useCourseOptionsStore((s) => s.subjects);
  const teachers = useCourseOptionsStore((s) => s.teachers);
  const groups = useCourseOptionsStore((s) => s.groups);

  const [draft, setDraft] = useState<CourseDraft>(initial);

  function set<K extends keyof CourseDraft>(key: K, value: CourseDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function pickGroup(id: number | null) {
    // Факультет курса на макете не спрашивают, но колонка «Fakultet» и шапка
    // курса его читают — берём с выбранной группы, раз он там уже есть.
    const group = groups.find((g) => g.id === id);
    setDraft((d) => ({ ...d, groupId: id, facultyId: group?.facultyId ?? null }));
  }

  function submit() {
    if (draft.teacherId === null) {
      toast(t('validation.teacherRequired'));
      return;
    }
    if (draft.subjectId === null) {
      toast(t('validation.subjectRequired'));
      return;
    }
    if (!multiGroup && draft.groupId === null) {
      toast(t('validation.groupRequired'));
      return;
    }

    const fan = subjects.find((s) => s.id === draft.subjectId)?.name ?? '';
    const guruh = groups.find((g) => g.id === draft.groupId)?.name ?? '';
    const name = (guruh ? `${fan} · ${guruh}` : fan).slice(0, NAME_MAX);

    onSave(name, draft);
  }

  return (
    <Modal
      title={mode === 'add' ? t('courseModal.add') : t('courseModal.edit')}
      subtitle={t('courseModal.subtitle')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit}>
            {mode === 'add' ? t('courseModal.submit') : tc('save')}
          </Button>
        </>
      }
    >
      <ModalField label={t('courseModal.teacher')}>
        <select
          value={draft.teacherId ?? ''}
          onChange={(e) => set('teacherId', e.target.value ? Number(e.target.value) : null)}
          className={modalInputClass}
        >
          <option value="">{t('courseModal.pickTeacher')}</option>
          {teachers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </ModalField>

      <ModalField label={t('courseModal.subject')}>
        <select
          value={draft.subjectId ?? ''}
          onChange={(e) => set('subjectId', e.target.value ? Number(e.target.value) : null)}
          className={modalInputClass}
        >
          <option value="">{t('courseModal.pickSubject')}</option>
          {subjects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </ModalField>

      <ModalField
        label={t('courseModal.group')}
        hint={multiGroup ? t('courseModal.multiGroupHint') : undefined}
      >
        <select
          value={draft.groupId ?? ''}
          onChange={(e) => pickGroup(e.target.value ? Number(e.target.value) : null)}
          disabled={multiGroup}
          className={`${modalInputClass} disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle`}
        >
          <option value="">{t('courseModal.pickGroup')}</option>
          {groups.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </ModalField>
    </Modal>
  );
}
