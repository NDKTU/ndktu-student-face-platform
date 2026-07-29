import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import type { EntityDraft } from '@/features/tuzilma/model/structure.store';
import type { EduForm } from '@/entities/university/model/types';

/**
 * Поля формы для каждого уровня. Одна модалка обслуживает все четыре
 * сущности — набор полей задаётся конфигом, а не четырьмя копиями формы.
 */
type FieldName = 'name' | 'dekan' | 'mudir' | 'kod' | 'shakl' | 'kurs' | 'sardor';

const FIELDS_BY_LEVEL: Record<number, readonly FieldName[]> = {
  0: ['name', 'dekan'],
  1: ['name', 'mudir'],
  2: ['name', 'kod', 'shakl'],
  3: ['name', 'kurs', 'sardor'],
};

const EDU_FORMS: readonly EduForm[] = ['Kunduzgi', 'Sirtqi'];

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
      {FIELDS_BY_LEVEL[level]!.map((field) => (
        <ModalField key={field} label={t(`field.${field}`)}>
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
          ) : (
            <input
              value={draft[field] ?? ''}
              onChange={(e) => set(field, e.target.value)}
              inputMode={field === 'kurs' || field === 'kod' ? 'numeric' : 'text'}
              className={modalInputClass}
            />
          )}
        </ModalField>
      ))}
    </Modal>
  );
}
