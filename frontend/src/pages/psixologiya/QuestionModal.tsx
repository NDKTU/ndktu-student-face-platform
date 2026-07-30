import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  QUESTION_TYPES,
  uploadImage,
  type QuestionDraft,
  type QuestionOption,
  type QuestionType,
} from '@/shared/api/psixologiya';
import { Button } from '@/shared/ui/Button';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { useToast } from '@/shared/ui/Toast';

/** Какие поля `content` и `options` осмысленны для типа вопроса. */
const SHAPE: Record<
  QuestionType,
  { text: boolean; image: boolean; scale: boolean; options: 'text' | 'image' | 'multi' | null }
> = {
  text: { text: true, image: false, scale: false, options: 'text' },
  true_false: { text: true, image: false, scale: false, options: null },
  scale: { text: true, image: false, scale: true, options: null },
  image_stimulus: { text: true, image: true, scale: false, options: 'text' },
  image_choice: { text: true, image: false, scale: false, options: 'image' },
  multi_choice: { text: true, image: false, scale: false, options: 'multi' },
};

export const EMPTY_QUESTION: QuestionDraft = {
  type: 'text',
  content: { text: '' },
  options: [],
  order: 1,
  category: '',
};

export function QuestionModal({
  mode,
  initial,
  onSave,
  onCancel,
}: {
  mode: 'add' | 'edit';
  initial: QuestionDraft;
  onSave: (draft: QuestionDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('psixologiya');
  const { t: tc } = useTranslation('common');
  const toast = useToast();

  const [draft, setDraft] = useState<QuestionDraft>(initial);
  const [uploading, setUploading] = useState(false);

  const shape = SHAPE[draft.type];

  function patchContent(change: Partial<QuestionDraft['content']>) {
    setDraft((d) => ({ ...d, content: { ...d.content, ...change } }));
  }

  function changeType(type: QuestionType) {
    // Поля, которых у нового типа нет, стираем: иначе в JSONB останутся ключи,
    // которые бэкенд не читает, а редактор не показывает.
    setDraft((d) => ({
      ...d,
      type,
      content: { text: d.content.text ?? '', ...(SHAPE[type].scale ? { min: 1, max: 5 } : {}) },
      options: SHAPE[type].options === null ? [] : d.options,
    }));
  }

  function setOption(index: number, change: Partial<QuestionOption>) {
    setDraft((d) => ({
      ...d,
      options: d.options.map((opt, i) => (i === index ? { ...opt, ...change } : opt)),
    }));
  }

  function addOption() {
    setDraft((d) => ({ ...d, options: [...d.options, { text: '', value: d.options.length + 1 }] }));
  }

  function removeOption(index: number) {
    setDraft((d) => ({ ...d, options: d.options.filter((_, i) => i !== index) }));
  }

  async function upload(file: File, apply: (url: string) => void) {
    setUploading(true);
    try {
      apply(await uploadImage(file));
    } catch (e) {
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (shape.text && !draft.content.text?.trim()) {
      toast(t('question.textRequired'));
      return;
    }
    if (shape.image && !draft.content.image_url) {
      toast(t('question.imageRequired'));
      return;
    }
    if (shape.scale && Number(draft.content.max ?? 0) <= Number(draft.content.min ?? 0)) {
      toast(t('question.scaleRange'));
      return;
    }
    if (shape.options !== null && draft.options.length === 0) {
      toast(t('question.optionsRequired'));
      return;
    }
    onSave(draft);
  }

  return (
    <Modal
      title={mode === 'add' ? t('question.add') : t('question.edit')}
      size="lg"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button disabled={uploading} onClick={submit}>
            {uploading ? t('question.uploading') : tc('save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        <ModalField label={t('question.type')}>
          <select
            value={draft.type}
            onChange={(e) => changeType(e.target.value as QuestionType)}
            className={modalInputClass}
          >
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`type.${type}`)}
              </option>
            ))}
          </select>
        </ModalField>
        <ModalField label={t('question.order')} hint={t('question.orderHint')}>
          <input
            type="number"
            min={1}
            value={draft.order}
            onChange={(e) => setDraft((d) => ({ ...d, order: Number(e.target.value) || 1 }))}
            className={modalInputClass}
          />
        </ModalField>
      </div>

      <ModalField label={t('question.category')} hint={t('question.categoryHint')}>
        <input
          value={draft.category}
          onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
          className={modalInputClass}
        />
      </ModalField>

      {shape.text && (
        <ModalField label={t('question.text')}>
          <textarea
            rows={2}
            value={draft.content.text ?? ''}
            onChange={(e) => patchContent({ text: e.target.value })}
            className={`${modalInputClass} h-auto py-2`}
          />
        </ModalField>
      )}

      {draft.type === 'multi_choice' && (
        <ModalField label={t('question.description')}>
          <input
            value={draft.content.description ?? ''}
            onChange={(e) => patchContent({ description: e.target.value })}
            className={modalInputClass}
          />
        </ModalField>
      )}

      {shape.image && (
        <ModalField label={t('question.image')}>
          <div className="flex items-center gap-3">
            {draft.content.image_url && (
              <img
                src={draft.content.image_url}
                alt=""
                className="size-16 flex-none rounded-9 border border-line object-cover"
              />
            )}
            <input
              type="file"
              accept="image/*"
              aria-label={t('question.upload')}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file, (url) => patchContent({ image_url: url }));
              }}
              className="text-12-5 text-ink-muted"
            />
          </div>
        </ModalField>
      )}

      {shape.scale && (
        <>
          <div className="grid grid-cols-2 gap-3.5">
            <ModalField label={t('question.min')}>
              <input
                type="number"
                value={draft.content.min ?? 1}
                onChange={(e) => patchContent({ min: Number(e.target.value) })}
                className={modalInputClass}
              />
            </ModalField>
            <ModalField label={t('question.max')}>
              <input
                type="number"
                value={draft.content.max ?? 5}
                onChange={(e) => patchContent({ max: Number(e.target.value) })}
                className={modalInputClass}
              />
            </ModalField>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <ModalField label={t('question.minLabel')}>
              <input
                value={draft.content.min_label ?? ''}
                onChange={(e) => patchContent({ min_label: e.target.value })}
                className={modalInputClass}
              />
            </ModalField>
            <ModalField label={t('question.maxLabel')}>
              <input
                value={draft.content.max_label ?? ''}
                onChange={(e) => patchContent({ max_label: e.target.value })}
                className={modalInputClass}
              />
            </ModalField>
          </div>
        </>
      )}

      {shape.options !== null && (
        <ModalField label={t('question.options')}>
          <div className="flex flex-col gap-2">
            {draft.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                {shape.options === 'text' && (
                  <input
                    value={opt.text ?? ''}
                    aria-label={t('question.optionText')}
                    placeholder={t('question.optionText')}
                    onChange={(e) => setOption(i, { text: e.target.value })}
                    className={`${modalInputClass} flex-1`}
                  />
                )}

                {(shape.options === 'image' || shape.options === 'multi') && (
                  <>
                    {opt.image_url && (
                      <img
                        src={opt.image_url}
                        alt=""
                        className="size-10 flex-none rounded-8 border border-line object-cover"
                      />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      aria-label={t('question.upload')}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void upload(file, (url) => setOption(i, { image_url: url }));
                      }}
                      className="w-[150px] flex-none text-11-5 text-ink-muted"
                    />
                  </>
                )}

                {shape.options === 'multi' && (
                  <input
                    value={opt.description ?? ''}
                    aria-label={t('question.optionDescription')}
                    placeholder={t('question.optionDescription')}
                    onChange={(e) => setOption(i, { description: e.target.value })}
                    className={`${modalInputClass} flex-1`}
                  />
                )}

                <input
                  type="number"
                  value={String(opt.value)}
                  aria-label={t('question.optionValue')}
                  onChange={(e) => setOption(i, { value: Number(e.target.value) })}
                  className={`${modalInputClass} w-[80px] flex-none`}
                />
                <Button
                  variant="secondary"
                  className="h-[38px] flex-none px-2.5 text-danger"
                  onClick={() => removeOption(i)}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button variant="secondary" className="self-start" onClick={addOption}>
              + {t('question.addOption')}
            </Button>
          </div>
        </ModalField>
      )}
    </Modal>
  );
}
