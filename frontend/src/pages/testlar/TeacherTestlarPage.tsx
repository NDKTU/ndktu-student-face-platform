import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePin } from '@/shared/lib/quizFormat';
import { useSessionStore } from '@/features/auth/model/session.store';
import type { TestMeta } from '@/entities/test/model/types';
import { useTestlarStore } from '@/features/testlar/model/testlar.store';
import { useTestlar } from '@/features/testlar/lib/useTestlar';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Button } from '@/shared/ui/Button';
import { DataTable, TableCard, type Column } from '@/shared/ui/DataTable';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { Modal } from '@/shared/ui/Modal';
import { useToast } from '@/shared/ui/Toast';
import { CreateTestView } from './CreateTestView';

export function TeacherTestlarPage() {
  const { t } = useTranslation('testlar');
  const { t: tn } = useTranslation('nav');
  const toast = useToast();
  const { status, error, reload } = useTestlar();

  const tests = useTestlarStore((s) => s.tests);
  const add = useTestlarStore((s) => s.add);

  const [viewMode, setViewMode] = useState<'list' | 'create'>('list');
  const [createdPin, setCreatedPin] = useState<string | null>(null);

  const user = useSessionStore((s) => s.user);
  const userId = user?.id ?? null;

  const columns: Column<TestMeta>[] = [
    {
      key: 'name',
      label: 'Test nomi',
      render: (x) => x.name || (x.fan ? `${x.fan} — 2025/2026 — 1-semestr` : 'Test nomi'),
      cellClass: 'text-14 font-semibold text-ink',
    },
    {
      key: 'oqituvchi',
      label: "O'qituvchi",
      render: (x) => x.oqituvchi || user?.employee?.full_name || user?.username || 'Jasur Bozorov',
      cellClass: 'text-13-5 text-ink-subtle',
    },
    {
      key: 'guruh',
      label: 'Guruh',
      width: 120,
      padX: 14,
      render: (x) => x.guruh || 'KI-24-01',
      cellClass: 'text-13-5 font-semibold text-brand',
    },
    {
      key: 'questions',
      label: 'Savollar',
      width: 100,
      padX: 12,
      align: 'center',
      render: (x) => x.savollar,
      cellClass: 'text-14 font-bold text-ink',
    },
    {
      key: 'status',
      label: 'Holati',
      width: 120,
      padX: 12,
      render: (x) => {
        const isFaol = x.holati === 'Faol';
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-20 px-3 py-1 text-12 font-bold ${
              isFaol ? 'bg-[#eefcf3] text-[#15803d]' : 'bg-[#f3f4f6] text-[#6b7280]'
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${isFaol ? 'bg-[#15803d]' : 'bg-[#6b7280]'}`}
            />
            {isFaol ? 'Faol' : 'Yopiq'}
          </span>
        );
      },
    },
    {
      key: 'pin',
      label: 'PIN',
      width: 110,
      padX: 14,
      render: (x) => x.pin ?? '100000',
      cellClass: 'font-mono text-14 font-bold text-ink',
    },
    {
      key: 'action',
      label: '',
      width: 40,
      align: 'center',
      render: () => (
        <svg
          className="size-4 text-ink-subtle"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      ),
    },
  ];

  async function handleCreateTest(data: {
    title: string;
    subjectId: number | null;
    groupId: number | null;
    teacherId: number | null;
    savollar: number;
    davomiylik: number;
  }) {
    const newPin = generatePin();
    const created = await add({
      name: data.title,
      subjectId: data.subjectId,
      groupId: data.groupId,
      teacherId: data.teacherId ?? userId,
      savollar: data.savollar,
      davomiylik: data.davomiylik,
      pin: newPin,
      isActive: true,
      proctoring: 'standard',
    });

    setViewMode('list');
    setCreatedPin(created.pin ?? newPin);
    toast(t('create.created') ?? 'Test muvaffaqiyatli yaratildi');
  }

  if (viewMode === 'create') {
    return (
      <CreateTestView
        onCancel={() => setViewMode('list')}
        onSuccess={handleCreateTest}
      />
    );
  }

  return (
    <>
      <CrumbBar crumbs={[{ label: tn('testlar') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <PageHeader
          title={tn('testlar')}
          subtitle="Yaratilgan testlar va natijalar — batafsil ko'rish uchun bosing"
          actions={
            <Button
              className="h-[42px] rounded-12 px-5 font-bold"
              onClick={() => setViewMode('create')}
            >
              + Test yaratish
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

      {createdPin && (
        <Modal
          title={t('create.pinTitle') ?? 'Test PIN-kodi'}
          onClose={() => setCreatedPin(null)}
          footer={<Button onClick={() => setCreatedPin(null)}>OK</Button>}
        >
          <p className="m-0 text-13-5 text-ink-muted">
            {t('create.pinNote') ?? "Talabalar testga kirish uchun ushbu PIN-koddan foydalanishadi:"}
          </p>
          <div className="my-4 flex items-center justify-center gap-3 rounded-14 bg-brand-soft py-5">
            <span className="font-mono text-30 font-extrabold tracking-[0.25em] text-brand">
              {createdPin}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(createdPin);
              toast(t('create.pinCopied') ?? 'PIN-kod nusxalandi');
            }}
            className="cursor-pointer border-none bg-transparent p-0 text-13 font-bold text-brand hover:underline"
          >
            {t('create.copyPin') ?? 'PIN-kodni nusxalash'}
          </button>
        </Modal>
      )}
    </>
  );
}
