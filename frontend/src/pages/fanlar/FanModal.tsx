import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FanDraft } from '@/features/fanlar/model/fanlar.store';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Toast';

interface FanModalProps {
  mode: 'add' | 'edit';
  initial: FanDraft;
  kafedraOptions: string[];
  onSave: (draft: FanDraft) => void;
  onCancel: () => void;
}

/** Форма «Yangi fan» / редактирования фана. */
export function FanModal({ mode, initial, kafedraOptions, onSave, onCancel }: FanModalProps) {
  const { t } = useTranslation('fanlar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const [draft, setDraft] = useState<FanDraft>(initial);

  function set<K extends keyof FanDraft>(key: K, value: FanDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submit() {
    if (!draft.fan.trim()) {
      toast(t('validation.fanRequired'));
      return;
    }
    if (!draft.kafedra) {
      toast(t('validation.kafedraRequired'));
      return;
    }
    onSave(draft);
  }

  return (
    <Modal
      title={mode === 'add' ? t('modal.add') : t('modal.edit')}
      onClose={onCancel}
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
          className={modalInputClass}
          autoFocus
        />
      </ModalField>

      <ModalField label={`${t('field.kafedra')} *`}>
        <select
          value={draft.kafedra}
          onChange={(e) => set('kafedra', e.target.value)}
          className={modalInputClass}
        >
          <option value="">{t('placeholder.kafedra')}</option>
          {kafedraOptions.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </ModalField>

      <div className="grid grid-cols-2 gap-3.5">
        <ModalField label={t('field.kredit')}>
          <input
            type="number"
            min={1}
            value={draft.kredit}
            onChange={(e) => set('kredit', e.target.value)}
            className={modalInputClass}
          />
        </ModalField>
        <ModalField label={t('field.kod')}>
          <input
            value={draft.kod}
            onChange={(e) => set('kod', e.target.value)}
            placeholder={t('placeholder.kod')}
            className={modalInputClass}
          />
        </ModalField>
      </div>

      <ModalField label={t('field.tavsif')}>
        <textarea
          value={draft.tavsif}
          onChange={(e) => set('tavsif', e.target.value)}
          rows={3}
          placeholder={t('placeholder.tavsif')}
          className={`${modalInputClass} h-auto py-2.5`}
        />
      </ModalField>
    </Modal>
  );
}
