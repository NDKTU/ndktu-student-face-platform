import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MethodDraft } from '@/shared/api/psixologiya';
import { Button } from '@/shared/ui/Button';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';

export const EMPTY_METHOD: MethodDraft = { name: '', description: '', instruction: {} };

/**
 * Методика вместе с настройками скоринга.
 *
 * `instruction` правится как JSON: его читает `scoring.py`, и набор ключей там
 * зависит от того, как методика считается (`sum` или `category`). Форма с
 * фиксированными полями означала бы, что каждая новая схема подсчёта требует
 * правки фронтенда.
 */
export function MethodModal({
  mode,
  initial,
  onSave,
  onCancel,
}: {
  mode: 'add' | 'edit';
  initial: MethodDraft;
  onSave: (draft: MethodDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('psixologiya');
  const { t: tc } = useTranslation('common');

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [json, setJson] = useState(() => JSON.stringify(initial.instruction ?? {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  function parse(): Record<string, unknown> | null {
    const text = json.trim();
    if (!text) return {};
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setJsonError(t('instruction.invalid', { message: 'object' }));
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch (e) {
      setJsonError(t('instruction.invalid', { message: e instanceof Error ? e.message : String(e) }));
      return null;
    }
  }

  function format() {
    const parsed = parse();
    if (!parsed) return;
    setJsonError(null);
    setJson(JSON.stringify(parsed, null, 2));
  }

  function submit() {
    const instruction = parse();
    if (!instruction) return;
    setJsonError(null);
    onSave({ name: name.trim(), description: description.trim(), instruction });
  }

  return (
    <Modal
      title={mode === 'add' ? t('method.add') : t('method.edit')}
      size="lg"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button disabled={!name.trim()} onClick={submit}>
            {tc('save')}
          </Button>
        </>
      }
    >
      <ModalField label={t('method.name')}>
        <input value={name} onChange={(e) => setName(e.target.value)} className={modalInputClass} />
      </ModalField>

      <ModalField label={t('method.description')}>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${modalInputClass} h-auto py-2`}
        />
      </ModalField>

      <ModalField label={t('instruction.title')} hint={t('instruction.hint')}>
        <textarea
          rows={12}
          value={json}
          spellCheck={false}
          onChange={(e) => {
            setJson(e.target.value);
            setJsonError(null);
          }}
          className={`${modalInputClass} h-auto py-2 font-mono text-12-5`}
        />
      </ModalField>

      <div className="flex items-center justify-between gap-3">
        <span className="text-12 text-danger">{jsonError ?? ''}</span>
        <Button variant="secondary" className="h-[34px] flex-none px-3" onClick={format}>
          {t('instruction.format')}
        </Button>
      </div>
    </Modal>
  );
}
