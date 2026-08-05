import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Toast';
import type { TopicDraft } from '@/features/kurslar/model/courses.store';

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
  const toast = useToast();
  const [draft, setDraft] = useState(initial);

  function submit() {
    if (!draft.name.trim()) {
      toast(t('validation.mavzuRequired'));
      return;
    }
    onSave(draft);
  }

  return (
    <Modal
      title={mode === 'add' ? t('mavzuModal.add') : t('mavzuModal.edit')}
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
      <ModalField label={t('mavzuModal.name')}>
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className={modalInputClass}
          autoFocus
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
