import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useFanlarStore,
  type FanDraft,
  type FanRow,
} from '@/features/fanlar/model/fanlar.store';
import { useFanlar } from '@/features/fanlar/lib/useFanlar';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { DataTable, TableCard, type Column } from '@/shared/ui/DataTable';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Button } from '@/shared/ui/Button';
import { RowMenu } from '@/shared/ui/RowMenu';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { useToast } from '@/shared/ui/Toast';
import { FanModal } from './FanModal';

const EMPTY_DRAFT: FanDraft = { fan: '', kafedra: '', kredit: '3', kod: '', tavsif: '' };

type ModalState = { mode: 'add' | 'edit'; id?: number; draft: FanDraft };

export function FanlarPage() {
  const { t } = useTranslation('fanlar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const { status, error, reload } = useFanlar();

  const fans = useFanlarStore((s) => s.fans);
  const add = useFanlarStore((s) => s.add);
  const update = useFanlarStore((s) => s.update);
  const remove = useFanlarStore((s) => s.remove);

  const [query, setQuery] = useState('');
  const [kafedra, setKafedra] = useState('');
  const [modal, setModal] = useState<ModalState | null>(null);
  const [confirm, setConfirm] = useState<{ id: number; name: string } | null>(null);

  // Список кафедр для фильтра и формы — уникальные значения из каталога.
  const kafedraOptions = useMemo(
    () => Array.from(new Set(fans.map((f) => f.kafedra))).sort((a, b) => a.localeCompare(b)),
    [fans],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fans.filter((f) => {
      if (kafedra && f.kafedra !== kafedra) return false;
      if (!q) return true;
      return f.fan.toLowerCase().includes(q) || f.kafedra.toLowerCase().includes(q);
    });
  }, [fans, query, kafedra]);

  const columns: Column<FanRow>[] = [
    {
      key: 'fan',
      label: t('column.fan'),
      render: (r) => r.fan,
      cellClass: 'text-14 font-semibold text-ink',
    },
    {
      key: 'kafedra',
      label: t('column.kafedra'),
      padX: 16,
      render: (r) => r.kafedra,
      cellClass: 'text-13 text-ink-muted',
    },
    {
      key: 'kredit',
      label: t('column.kredit'),
      align: 'center',
      width: 90,
      padX: 16,
      render: (r) => r.kredit,
      cellClass: 'text-14 font-bold text-ink',
    },
    {
      key: 'oqituvchi',
      label: t('column.oqituvchi'),
      width: 190,
      render: (r) => r.oqituvchi,
      cellClass: 'text-13-5 text-ink-secondary',
    },
    {
      key: 'actions',
      label: '',
      width: 56,
      padX: 8,
      align: 'center',
      render: (r) => (
        <div className="flex justify-end">
          <RowMenu
            items={[
              { label: t('action.edit'), onClick: () => openEdit(r) },
              { label: t('action.delete'), danger: true, onClick: () => setConfirm({ id: r.id, name: r.fan }) },
            ]}
          />
        </div>
      ),
      cellClass: '',
    },
  ];

  function openEdit(r: FanRow) {
    setModal({
      mode: 'edit',
      id: r.id,
      draft: { fan: r.fan, kafedra: r.kafedra, kredit: String(r.kredit), kod: r.kod, tavsif: r.tavsif },
    });
  }

  function reportError(e: unknown) {
    toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
  }

  async function handleSave(draft: FanDraft) {
    if (!modal) return;
    try {
      if (modal.mode === 'add') {
        await add(draft);
        toast(tc('created'));
      } else if (modal.id) {
        await update(modal.id, draft);
        toast(tc('saved'));
      }
      setModal(null);
    } catch (e) {
      // Форму не закрываем: введённое не должно пропасть из-за сбоя сети.
      reportError(e);
    }
  }

  async function handleDelete() {
    if (!confirm) return;
    try {
      await remove(confirm.id);
      toast(tc('deleted'));
    } catch (e) {
      reportError(e);
    }
    setConfirm(null);
  }

  return (
    <>
      <CrumbBar crumbs={[{ label: t('title') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle', { count: fans.length })}
          actions={
            <Button
              className="h-[42px] rounded-11 px-4"
              onClick={() => setModal({ mode: 'add', draft: EMPTY_DRAFT })}
            >
              + {t('add')}
            </Button>
          }
        />

        {status === 'loading' || status === 'idle' ? (
          <LoadingState />
        ) : status === 'error' ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative min-w-[240px] flex-1">
                <SearchIcon />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('search')}
                  className="h-[42px] w-full rounded-11 border border-line bg-surface pr-3.5 pl-[38px] text-14 text-ink outline-none placeholder:text-ink-faint focus:border-brand"
                />
              </div>
              <select
                value={kafedra}
                onChange={(e) => setKafedra(e.target.value)}
                className="h-[42px] min-w-[200px] rounded-11 border border-line bg-surface px-3.5 text-14 text-ink-secondary outline-none focus:border-brand"
              >
                <option value="">{t('allKafedra')}</option>
                {kafedraOptions.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>

            <TableCard>
              {filtered.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <h3 className="m-0 text-16 font-bold text-ink">{t('empty.title')}</h3>
                  <p className="mx-auto mt-2 max-w-[340px] text-13-5 text-ink-subtle">
                    {t('empty.text')}
                  </p>
                </div>
              ) : (
                <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} />
              )}
            </TableCard>
          </>
        )}
      </div>

      {modal && (
        <FanModal
          mode={modal.mode}
          initial={modal.draft}
          kafedraOptions={kafedraOptions}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={t('action.delete')}
          text={t('confirmDelete', { name: confirm.name })}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg
      className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  );
}
