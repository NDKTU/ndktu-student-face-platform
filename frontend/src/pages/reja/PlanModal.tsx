import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EduForm } from '@/entities/university/model/types';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';

const FORMS: EduForm[] = ['Kunduzgi', 'Sirtqi'];

export interface PlanDraft {
  specialityId: number;
  year: string;
  shakl: EduForm;
}

interface PlanModalProps {
  initial: PlanDraft;
  specialities: { id: number; label: string }[];
  onCreate: (draft: PlanDraft) => void;
  onCancel: () => void;
}

/** «Yangi o'quv reja» — создаёт пустой план на 1–8 семестр. */
export function PlanModal({ initial, specialities, onCreate, onCancel }: PlanModalProps) {
  const { t } = useTranslation('reja');
  const { t: tc } = useTranslation('common');
  const [draft, setDraft] = useState<PlanDraft>(initial);

  return (
    <Modal
      title={t('planModal.title')}
      subtitle={t('planModal.subtitle')}
      onClose={onCancel}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => onCreate(draft)}>{t('planModal.create')}</Button>
        </>
      }
    >
      <ModalField label={t('field.speciality')}>
        <select
          value={draft.specialityId}
          // value у <select> всегда строка, а id мутахассислика — число.
          onChange={(e) => setDraft((d) => ({ ...d, specialityId: Number(e.target.value) }))}
          className={modalInputClass}
        >
          {specialities.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </ModalField>

      <div className="grid grid-cols-2 gap-3.5">
        <ModalField label={t('field.year')}>
          <input
            value={draft.year}
            onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value }))}
            placeholder={t('placeholder.year')}
            className={modalInputClass}
          />
        </ModalField>
        <ModalField label={t('field.shakl')}>
          <select
            value={draft.shakl}
            onChange={(e) => setDraft((d) => ({ ...d, shakl: e.target.value as EduForm }))}
            className={modalInputClass}
          >
            {FORMS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </ModalField>
      </div>
    </Modal>
  );
}
