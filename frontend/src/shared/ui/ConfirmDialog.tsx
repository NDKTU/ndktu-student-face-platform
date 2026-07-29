import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  title: string;
  text: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation('common');

  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel ?? t('delete')}
          </Button>
        </>
      }
    >
      <p className="m-0 text-13-5 leading-[1.55] text-ink-muted">{text}</p>
    </Modal>
  );
}
