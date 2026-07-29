import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Toast';

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

export interface RejaFanDraft {
  fan: string;
  semestr: string;
  kredit: string;
  oqituvchi: string;
}

/** Преподаватель кафедры: в списке — полное имя, в плане хранится краткое. */
export interface TeacherOption {
  short: string;
  display: string;
}

interface RejaFanModalProps {
  mode: 'add' | 'edit';
  initial: RejaFanDraft;
  /** Названия фанов из каталога — подсказки для поиска по вводу. */
  suggestions: string[];
  teachers: TeacherOption[];
  onSave: (draft: RejaFanDraft) => void;
  onCancel: () => void;
}

/** «O'quv rejaga fan qo'shish» — строка плана: фан, семестр, кредит, преподаватель. */
export function RejaFanModal({
  mode,
  initial,
  suggestions,
  teachers,
  onSave,
  onCancel,
}: RejaFanModalProps) {
  const { t } = useTranslation('reja');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const listId = useId();
  const [draft, setDraft] = useState<RejaFanDraft>(initial);

  function set<K extends keyof RejaFanDraft>(key: K, value: RejaFanDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submit() {
    if (!draft.fan.trim()) {
      toast(t('validation.fanRequired'));
      return;
    }
    onSave(draft);
  }

  return (
    <Modal
      title={mode === 'add' ? t('fanModal.add') : t('fanModal.edit')}
      onClose={onCancel}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit}>{tc('save')}</Button>
        </>
      }
    >
      <ModalField label={`${t('field.fan')} *`}>
        <input
          value={draft.fan}
          onChange={(e) => set('fan', e.target.value)}
          placeholder={t('placeholder.fan')}
          list={listId}
          className={modalInputClass}
          autoFocus
        />
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </ModalField>

      <div className="grid grid-cols-2 gap-3.5">
        <ModalField label={t('field.semestr')}>
          <select
            value={draft.semestr}
            onChange={(e) => set('semestr', e.target.value)}
            className={modalInputClass}
          >
            {SEMESTERS.map((n) => (
              <option key={n} value={n}>
                {t('semester', { n })}
              </option>
            ))}
          </select>
        </ModalField>
        <ModalField label={t('field.kredit')}>
          <input
            type="number"
            min={1}
            value={draft.kredit}
            onChange={(e) => set('kredit', e.target.value)}
            className={modalInputClass}
          />
        </ModalField>
      </div>

      <ModalField label={t('field.oqituvchi')}>
        <select
          value={draft.oqituvchi}
          onChange={(e) => set('oqituvchi', e.target.value)}
          className={modalInputClass}
        >
          {teachers.map((teacher) => (
            <option key={teacher.short} value={teacher.short}>
              {teacher.display}
            </option>
          ))}
        </select>
      </ModalField>
    </Modal>
  );
}
