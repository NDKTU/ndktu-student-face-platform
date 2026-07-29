import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TEACHER_TEST_SUBJECTS } from '@/entities/test/mock/tests';
import type { TestMeta, TestStatus } from '@/entities/test/model/types';
import { useTestlarStore } from '@/features/testlar/model/testlar.store';
import { useTestlar } from '@/features/testlar/lib/useTestlar';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Button } from '@/shared/ui/Button';
import { DataTable, TableCard, type Column } from '@/shared/ui/DataTable';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { useToast } from '@/shared/ui/Toast';

const STATUS_TONE: Record<TestStatus, { bg: string; fg: string }> = {
  Faol: { bg: 'var(--color-success-tint)', fg: 'var(--color-success)' },
  Yopiq: { bg: 'var(--color-surface-alt)', fg: 'var(--color-ink-muted)' },
  Yopilgan: { bg: 'var(--color-surface-alt)', fg: 'var(--color-ink-muted)' },
};

export function TeacherTestlarPage() {
  const { t } = useTranslation('testlar');
  const { t: tn } = useTranslation('nav');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const { status, error, reload } = useTestlar();

  const tests = useTestlarStore((s) => s.tests);
  const add = useTestlarStore((s) => s.add);

  const [creating, setCreating] = useState(false);
  const [createdPin, setCreatedPin] = useState<string | null>(null);

  // Фильтровать нечего: сервер отдал только тесты этого преподавателя.
  const columns: Column<TestMeta>[] = [
    { key: 'name', label: t('teacher.column.name'), render: (x) => x.fan, cellClass: 'text-14 font-semibold text-ink' },
    { key: 'guruh', label: t('teacher.column.guruh'), width: 110, padX: 14, render: (x) => x.guruh, cellClass: 'text-13 font-semibold text-ink-secondary' },
    { key: 'questions', label: t('teacher.column.questions'), width: 100, padX: 12, align: 'center', render: (x) => x.savollar, cellClass: 'text-13 font-bold text-ink' },
    { key: 'duration', label: t('teacher.column.duration'), width: 90, padX: 12, align: 'center', render: (x) => `${x.davomiylik}′`, cellClass: 'text-13 text-ink-muted' },
    {
      key: 'status',
      label: t('teacher.column.status'),
      width: 110,
      padX: 12,
      render: (x) => {
        const tone = STATUS_TONE[x.holati];
        return (
          <span className="rounded-20 px-2.5 py-1 text-11-5 font-bold" style={{ background: tone.bg, color: tone.fg }}>
            {t(`status.${x.holati}`)}
          </span>
        );
      },
    },
    { key: 'pin', label: t('teacher.column.pin'), width: 90, padX: 14, render: (x) => x.pin ?? '—', cellClass: 'font-mono text-13 font-semibold text-brand' },
  ];

  async function createTest(draft: {
    subjectId: string;
    guruh: string;
    savollar: string;
    davomiylik: string;
  }) {
    const subject =
      TEACHER_TEST_SUBJECTS.find((s) => s.id === draft.subjectId) ?? TEACHER_TEST_SUBJECTS[0];
    const count = parseInt(draft.savollar, 10);
    if (Number.isNaN(count) || count < 1 || count > subject.count) {
      toast(t('create.invalidCount'));
      return;
    }

    try {
      // PIN генерирует сервер — он же его потом и проверяет.
      const created = await add({
        fan: subject.fan,
        guruh: draft.guruh.trim() || 'KI-24-01',
        savollar: count,
        davomiylik: parseInt(draft.davomiylik, 10) || 30,
        // Автора сервер подставит из токена — здесь его знать неоткуда.
        oqituvchi: '',
        subjectId: subject.id,
      });
      setCreating(false);
      setCreatedPin(created.pin ?? null);
      toast(t('create.created'));
    } catch (e) {
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <>
      <CrumbBar crumbs={[{ label: tn('testlar') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <PageHeader
          title={tn('testlar')}
          subtitle={t('studentSubtitle')}
          actions={
            <Button className="h-[42px] rounded-11 px-4" onClick={() => setCreating(true)}>
              + {t('create.button')}
            </Button>
          }
        />

        {status === 'loading' || status === 'idle' ? (
          <LoadingState />
        ) : status === 'error' ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : (
          <TableCard>
            <DataTable columns={columns} rows={tests} rowKey={(x) => x.id} />
          </TableCard>
        )}
      </div>

      {creating && (
        <CreateTestModal onCreate={(d) => void createTest(d)} onCancel={() => setCreating(false)} />
      )}

      {createdPin && (
        <Modal
          title={t('create.pinTitle')}
          onClose={() => setCreatedPin(null)}
          footer={<Button onClick={() => setCreatedPin(null)}>OK</Button>}
        >
          <p className="m-0 text-13-5 text-ink-muted">{t('create.pinNote')}</p>
          <div className="flex items-center justify-center gap-3 rounded-14 bg-brand-soft py-5">
            <span className="font-mono text-30 font-extrabold tracking-[0.25em] text-brand">
              {createdPin}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(createdPin);
              toast(t('create.pinCopied'));
            }}
            className="cursor-pointer border-none bg-transparent p-0 text-13 font-bold text-brand hover:underline"
          >
            {t('create.copyPin')}
          </button>
        </Modal>
      )}
    </>
  );
}

function CreateTestModal({
  onCreate,
  onCancel,
}: {
  onCreate: (draft: { subjectId: string; guruh: string; savollar: string; davomiylik: string }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('testlar');
  const { t: tc } = useTranslation('common');
  const [draft, setDraft] = useState({
    subjectId: TEACHER_TEST_SUBJECTS[0].id as string,
    guruh: 'KI-24-01',
    savollar: '20',
    davomiylik: '30',
  });

  return (
    <Modal
      title={t('create.title')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => onCreate(draft)}>{t('create.submit')}</Button>
        </>
      }
    >
      <ModalField label={t('create.fan')}>
        <select
          value={draft.subjectId}
          onChange={(e) => setDraft((d) => ({ ...d, subjectId: e.target.value }))}
          className={modalInputClass}
        >
          {TEACHER_TEST_SUBJECTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fan}
            </option>
          ))}
        </select>
      </ModalField>
      <ModalField label={t('create.guruh')}>
        <input
          value={draft.guruh}
          onChange={(e) => setDraft((d) => ({ ...d, guruh: e.target.value }))}
          className={modalInputClass}
        />
      </ModalField>
      <div className="grid grid-cols-2 gap-3.5">
        <ModalField label={t('create.questions')}>
          <input
            value={draft.savollar}
            onChange={(e) => setDraft((d) => ({ ...d, savollar: e.target.value }))}
            inputMode="numeric"
            className={modalInputClass}
          />
        </ModalField>
        <ModalField label={t('create.duration')}>
          <input
            value={draft.davomiylik}
            onChange={(e) => setDraft((d) => ({ ...d, davomiylik: e.target.value }))}
            inputMode="numeric"
            className={modalInputClass}
          />
        </ModalField>
      </div>
    </Modal>
  );
}
