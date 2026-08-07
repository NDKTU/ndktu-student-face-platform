import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import { SensitiveSection } from '@/entities/access/ui/SensitiveSection';
import type { Employee } from '@/entities/employee/model/types';
import { getEmployeeSensitive, resetEmployeePassword } from '@/shared/api/xodimlar';
import { Button } from '@/shared/ui/Button';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { useToast } from '@/shared/ui/Toast';

type Tab = 'umumiy' | 'maxfiy' | 'tizim';

interface EmployeeDetailProps {
  employee: Employee;
  onEdit: () => void;
}

export function EmployeeDetail({ employee, onEdit }: EmployeeDetailProps) {
  const { t } = useTranslation('xodimlar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const { canViewEmployeeSensitive, has } = usePermissions();
  const [tab, setTab] = useState<Tab>('umumiy');
  // null — модалка закрыта; строка — открыта и хранит введённый пароль.
  const [resetPwd, setResetPwd] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    if (!resetPwd?.trim() || resetting) return;
    setResetting(true);
    try {
      await resetEmployeePassword(employee.userId, resetPwd);
      toast(t('action.resetDone'));
      setResetPwd(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  }


  return (
    <>
    <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
      <div className="mb-5 rounded-18 border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start gap-[18px]">
          <div
            className="grid size-[58px] flex-none place-items-center rounded-full text-18 font-extrabold text-white"
            style={{ background: employee.color }}
            aria-hidden="true"
          >
            {employee.initials}
          </div>

          <div className="min-w-[220px] flex-1">
            <h1 className="m-0 text-23 leading-[1.15] font-extrabold tracking-[-0.02em] text-ink">
              {employee.fish}
            </h1>
            <div className="mt-1.5 text-13-5 text-ink-subtle">
              {employee.lavozim} · {employee.unit}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {employee.roleLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-20 px-[11px] py-1 text-12 font-bold"
                  style={{ background: `${employee.color}1A`, color: employee.color }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex-none">
            <Button variant="secondary" onClick={onEdit}>
              <EditIcon />
              {t('action.edit')}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-18 border border-line bg-surface shadow-card">
        <div className="flex gap-6 border-b border-surface-sunken px-6" role="tablist">
          {(['umumiy', 'maxfiy', 'tizim'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex cursor-pointer items-center gap-1.5 border-none border-b-2 bg-transparent px-0 py-3.5 text-13-5 font-bold ${
                tab === key
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-faint hover:text-ink-muted'
              }`}
            >
              {key === 'maxfiy' && <LockIcon />}
              {t(`tab.${key}`)}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'umumiy' && (
            <FieldGrid
              rows={[
                [t('field.gender'), employee.gender],
                [t('field.birth'), employee.birth],
                [t('field.workPhone'), employee.workPhone],
                [t('field.workEmail'), employee.workEmail],
                [t('field.hire'), employee.hire],
              ]}
            />
          )}

          {/* У сотрудников правило строже, чем у студентов: персональные данные
              видит только super_admin. Решает сервер — здесь 403 просто рисуется. */}
          {tab === 'maxfiy' && (
            <SensitiveSection
              id={employee.id}
              load={getEmployeeSensitive}
              title={t('section.maxfiy')}
              denied={{ title: t('denied.title'), text: t('denied.text') }}
              allowed={canViewEmployeeSensitive}
              gridClass="gap-x-8 gap-y-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]"
              rows={(d) => [
                [t('field.jshshir'), d.jshshir],
                [t('field.passport'), d.passport],
                [t('field.personalPhone'), d.personalPhone],
                [t('field.address'), d.address],
              ]}
            />
          )}

          {tab === 'tizim' && (
            <>
              <FieldGrid
                rows={[
                  [t('field.login'), employee.login],
                  [t('field.role'), employee.roleLabels.join(', ')],
                ]}
              />
              <div className="mt-5 border-t border-surface-sunken pt-5">
                {/* Без права кнопку прячем: сервер всё равно ответит 403, а
                    кнопка, которая всегда падает, хуже её отсутствия. */}
                {has('reset:user_password') && (
                  <Button variant="secondary" onClick={() => setResetPwd('')}>
                    <ResetIcon />
                    {t('action.resetPassword')}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>

    {resetPwd !== null && (
      <Modal
        title={t('reset.title')}
        subtitle={t('reset.subtitle')}
        onClose={() => setResetPwd(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetPwd(null)}>
              {tc('cancel')}
            </Button>
            <Button disabled={!resetPwd.trim() || resetting} onClick={() => void handleReset()}>
              {t('reset.submit')}
            </Button>
          </>
        }
      >
        <ModalField label={t('reset.field')}>
          <input
            type="password"
            value={resetPwd}
            onChange={(e) => setResetPwd(e.target.value)}
            placeholder="••••••••"
            className={modalInputClass}
          />
        </ModalField>
      </Modal>
    )}
    </>
  );
}

function FieldGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="m-0 grid gap-x-8 gap-y-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-11-5 font-semibold text-ink-subtle">{label}</dt>
          <dd className="m-0 mt-1 text-13-5 font-semibold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
