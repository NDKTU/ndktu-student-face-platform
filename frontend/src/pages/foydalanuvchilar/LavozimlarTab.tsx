import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import { useLavozimlar } from '@/features/lavozimlar/lib/useLavozimlar';
import { useLavozimlarStore } from '@/features/lavozimlar/model/lavozimlar.store';
import type { Lavozim } from '@/shared/api/lavozimlar';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { PageHeader } from '@/shared/ui/PageHeader';
import { RowMenu } from '@/shared/ui/RowMenu';
import { TableCard } from '@/shared/ui/DataTable';
import { useToast } from '@/shared/ui/Toast';

/**
 * Справочник должностей — «Professor», «Dotsent», «Buxgalter».
 *
 * Соседняя вкладка к подразделениям и по той же причине: и то и другое —
 * атрибуты сотрудника, и смотрят на них из справочника людей.
 */
export function LavozimlarTab() {
  const { t } = useTranslation('xodimlar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const { lavozimlar, status, error, reload } = useLavozimlar();
  const add = useLavozimlarStore((s) => s.add);
  const rename = useLavozimlarStore((s) => s.rename);
  const remove = useLavozimlarStore((s) => s.remove);
  const { has, isAdmin } = usePermissions();
  const canWrite = isAdmin || has('create:job_title');

  const [modal, setModal] = useState<{ id?: number; name: string } | null>(null);
  const [confirm, setConfirm] = useState<Lavozim | null>(null);

  async function save() {
    if (!modal) return;
    const name = modal.name.trim();
    if (!name) return;
    try {
      if (modal.id === undefined) await add(name);
      else await rename(modal.id, name);
      setModal(null);
      toast(tc('saved'));
    } catch (e) {
      toast(e instanceof Error ? e.message : tc('saveError'));
    }
  }

  async function confirmRemove() {
    if (!confirm) return;
    try {
      await remove(confirm.id);
      toast(tc('deleted'));
    } catch (e) {
      toast(e instanceof Error ? e.message : tc('saveError'));
    } finally {
      setConfirm(null);
    }
  }

  const columns: Column<Lavozim>[] = [
    {
      key: 'name',
      label: t('lavozim.column.name'),
      render: (b) => b.name,
      cellClass: 'text-14 font-semibold text-ink',
    },
    {
      key: 'menu',
      label: '',
      width: 60,
      padX: 12,
      render: (b) =>
        canWrite ? (
          <RowMenu
            items={[
              { label: tc('edit'), onClick: () => setModal({ id: b.id, name: b.name }) },
              { label: tc('delete'), danger: true, onClick: () => setConfirm(b) },
            ]}
          />
        ) : null,
      cellClass: '',
    },
  ];

  return (
    <>
      <PageHeader
        title={t('lavozim.title')}
        subtitle={t('lavozim.subtitle', { count: lavozimlar.length })}
        actions={
          canWrite ? (
            <Button className="h-[46px] rounded-12 px-5" onClick={() => setModal({ name: '' })}>
              + {t('lavozim.add')}
            </Button>
          ) : null
        }
      />

      {status === 'loading' && <LoadingState />}
      {status === 'error' && <ErrorState message={error} onRetry={() => void reload()} />}
      {status === 'ready' && (
        <TableCard>
          {lavozimlar.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <h3 className="m-0 text-16 font-bold text-ink">{t('lavozim.empty.title')}</h3>
              <p className="mx-auto mt-2 max-w-[340px] text-13-5 text-ink-subtle">
                {t('lavozim.empty.text')}
              </p>
            </div>
          ) : (
            <DataTable columns={columns} rows={lavozimlar} rowKey={(b) => b.id} />
          )}
        </TableCard>
      )}

      {modal && (
        <Modal
          title={modal.id === undefined ? t('lavozim.add') : tc('edit')}
          onClose={() => setModal(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(null)}>
                {tc('cancel')}
              </Button>
              <Button onClick={() => void save()}>{tc('save')}</Button>
            </>
          }
        >
          <ModalField label={t('lavozim.column.name')}>
            <input
              autoFocus
              value={modal.name}
              onChange={(e) => setModal({ ...modal, name: e.target.value })}
              placeholder={t('lavozim.placeholder')}
              className={modalInputClass}
            />
          </ModalField>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          title={t('lavozim.deleteTitle')}
          text={t('lavozim.deleteText', { name: confirm.name })}
          onConfirm={() => void confirmRemove()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
