import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import type { EntityDraft } from '@/features/tuzilma/model/structure.store';
import type { EduForm } from '@/entities/university/model/types';
import { getPostCandidates, type PostCandidate, type StructuralPost } from '@/shared/api/xodimlar';
import { getSardorCandidates, type SardorCandidate } from '@/shared/api/tuzilma';
import { displayName } from '@/shared/lib/displayName';

/**
 * Поля формы для каждого уровня. Одна модалка обслуживает все четыре
 * сущности — набор полей задаётся конфигом, а не четырьмя копиями формы.
 */
type FieldName = 'name' | 'post' | 'kod' | 'shakl' | 'kurs' | 'sardor';

const FIELDS_BY_LEVEL: Record<number, readonly FieldName[]> = {
  0: ['name', 'post'],
  1: ['name', 'post'],
  2: ['name', 'kod', 'shakl'],
  3: ['name', 'kurs', 'sardor'],
};

/** Какой пост назначается на этом уровне и как подписано поле. */
const POST_BY_LEVEL: Record<number, { post: StructuralPost; labelKey: string }> = {
  0: { post: 'dekan', labelKey: 'field.dekan' },
  1: { post: 'kafedra_mudiri', labelKey: 'field.mudir' },
};

const EDU_FORMS: readonly EduForm[] = ['Kunduzgi', 'Sirtqi'];
const KURS_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface EntityModalProps {
  level: number;
  mode: 'add' | 'edit';
  initial: EntityDraft;
  onSave: (draft: EntityDraft) => void;
  onCancel: () => void;
}

export function EntityModal({ level, mode, initial, onSave, onCancel }: EntityModalProps) {
  const { t } = useTranslation('tuzilma');
  const { t: tc } = useTranslation('common');
  const [draft, setDraft] = useState<EntityDraft>(initial);

  const levelKey = (['faculty', 'department', 'speciality', 'group'] as const)[level]!;
  const levelName = t(`level.${levelKey}.single`);
  const title =
    mode === 'add'
      ? t('modal.addTitle', { level: levelName })
      : t('modal.editTitle', { level: levelName });

  function set(name: FieldName, value: string) {
    setDraft((d) => ({ ...d, [name]: value }));
  }

  return (
    <Modal
      title={title}
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
      {FIELDS_BY_LEVEL[level]!.map((field) => {
        if (field === 'post') {
          const config = POST_BY_LEVEL[level]!;
          return (
            <PostField
              key={field}
              post={config.post}
              label={t(config.labelKey)}
              userId={draft.post ?? ''}
              currentName={draft.postName ?? ''}
              onChange={(userId, fullName) =>
                setDraft((d) => ({ ...d, post: userId, postName: fullName }))
              }
            />
          );
        }

        if (field === 'sardor') {
          return (
            <SardorField
              key={field}
              label={t('field.sardor')}
              studentId={draft.sardor ?? ''}
              currentName={draft.postName ?? draft.sardor ?? ''}
              onChange={(studentId, fullName) =>
                setDraft((d) => ({ ...d, sardor: studentId, postName: fullName }))
              }
            />
          );
        }

        return (
          <ModalField
            key={field}
            label={t(`field.${field}`)}
            hint={field === 'name' ? t('modal.nameHint', { preview: displayName(draft.name ?? '') }) : undefined}
          >
            {field === 'shakl' ? (
              <select
                value={draft.shakl ?? 'Kunduzgi'}
                onChange={(e) => set('shakl', e.target.value)}
                className={modalInputClass}
              >
                {EDU_FORMS.map((form) => (
                  <option key={form} value={form}>
                    {form}
                  </option>
                ))}
              </select>
            ) : field === 'kurs' ? (
              <select
                value={draft.kurs ?? '1'}
                onChange={(e) => set('kurs', e.target.value)}
                className={modalInputClass}
              >
                {KURS_OPTIONS.map((k) => (
                  <option key={k} value={String(k)}>
                    {k}-kurs
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={draft[field] ?? ''}
                onChange={(e) =>
                  set(field, field === 'kod' ? e.target.value.replace(/\D/g, '') : e.target.value)
                }
                inputMode={field === 'kod' ? 'numeric' : 'text'}
                maxLength={field === 'kod' ? 16 : field === 'name' && level === 0 ? 50 : undefined}
                className={modalInputClass}
              />
            )}
          </ModalField>
        );
      })}
    </Modal>
  );
}

/**
 * Выбор человека на структурный пост.
 */
function PostField({
  post,
  label,
  userId,
  currentName,
  onChange,
}: {
  post: StructuralPost;
  label: string;
  userId: string;
  currentName: string;
  onChange: (userId: string, fullName: string) => void;
}) {
  const { t } = useTranslation('tuzilma');
  const [candidates, setCandidates] = useState<PostCandidate[] | null>(null);

  useEffect(() => {
    let alive = true;
    getPostCandidates(post).then(
      (rows) => alive && setCandidates(rows),
      () => alive && setCandidates([]),
    );
    return () => {
      alive = false;
    };
  }, [post]);

  const options = candidates ?? [];
  const holderMissing = userId !== '' && !options.some((c) => String(c.userId) === userId);

  return (
    <ModalField
      label={label}
      hint={
        candidates && options.length === 0 && !holderMissing
          ? t('modal.noCandidates', { role: post })
          : undefined
      }
    >
      <select
        value={userId}
        disabled={candidates === null}
        onChange={(e) => {
          const picked = options.find((c) => String(c.userId) === e.target.value);
          onChange(e.target.value, picked?.fullName ?? '');
        }}
        className={modalInputClass}
      >
        <option value="">{t('modal.unassigned')}</option>
        {holderMissing && <option value={userId}>{currentName}</option>}
        {options.map((candidate) => (
          <option key={candidate.userId} value={candidate.userId}>
            {candidate.fullName}
          </option>
        ))}
      </select>
    </ModalField>
  );
}

/**
 * Выбор старосты группы из списка студентов.
 */
function SardorField({
  label,
  studentId,
  currentName,
  onChange,
}: {
  label: string;
  studentId: string;
  currentName: string;
  onChange: (studentId: string, fullName: string) => void;
}) {
  const { t } = useTranslation('tuzilma');
  const [candidates, setCandidates] = useState<SardorCandidate[] | null>(null);

  useEffect(() => {
    let alive = true;
    getSardorCandidates().then(
      (rows) => alive && setCandidates(rows),
      () => alive && setCandidates([]),
    );
    return () => {
      alive = false;
    };
  }, []);

  const options = candidates ?? [];
  const holderMissing = studentId !== '' && !options.some((c) => String(c.id) === studentId);

  return (
    <ModalField
      label={label}
      hint={
        candidates && options.length === 0 && !holderMissing
          ? t('modal.noCandidates', { role: 'sardor' })
          : undefined
      }
    >
      <select
        value={studentId}
        disabled={candidates === null}
        onChange={(e) => {
          const picked = options.find((c) => String(c.id) === e.target.value);
          onChange(e.target.value, picked?.fullName ?? '');
        }}
        className={modalInputClass}
      >
        <option value="">{t('modal.unassigned')}</option>
        {holderMissing && <option value={studentId}>{currentName}</option>}
        {options.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.fullName}
          </option>
        ))}
      </select>
    </ModalField>
  );
}
