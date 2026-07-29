import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import type { Employee, EmployeeDraft, EmployeeStatus } from '@/entities/employee/model/types';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Toast';

const STATUSES: EmployeeStatus[] = ['Faol', 'Bloklangan', "Ta'tilda"];
const GENDERS: Employee['gender'][] = ['Erkak', 'Ayol'];

interface EmployeeModalProps {
  mode: 'add' | 'edit';
  initial: EmployeeDraft;
  units: string[];
  /** Роли из БД: имя — то, что уходит на сервер, label — подпись. */
  roles: { name: string; label: string }[];
  onSave: (draft: EmployeeDraft) => void;
  onCancel: () => void;
}

/**
 * Форма сотрудника: четыре секции (Личное, Персональные данные, Работа, Учётка).
 * Секция «Персональные данные» — в отдельной запертой рамке и доступна на
 * редактирование только super_admin.
 */
export function EmployeeModal({ mode, initial, units, roles, onSave, onCancel }: EmployeeModalProps) {
  const { t } = useTranslation('xodimlar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();

  const canEditSensitive = usePermissions().canViewEmployeeSensitive;
  const [draft, setDraft] = useState<EmployeeDraft>(initial);

  function set<K extends keyof EmployeeDraft>(key: K, value: EmployeeDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submit() {
    if (!draft.fish?.trim()) {
      toast(t('validation.fishRequired'));
      return;
    }
    onSave(draft);
  }

  const field = (key: keyof EmployeeDraft, ph?: string) => (
    <input
      value={(draft[key] as string) ?? ''}
      onChange={(e) => set(key, e.target.value as never)}
      placeholder={ph}
      className={modalInputClass}
    />
  );

  return (
    <Modal
      title={mode === 'edit' ? t('modal.edit') : t('modal.add')}
      subtitle={t('modal.subtitle')}
      size="lg"
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
      {/* --- Личное --- */}
      <Section title={t('section.shaxsiy')}>
        <div className="flex gap-4">
          <button
            type="button"
            className="grid size-[68px] flex-none cursor-pointer place-items-center rounded-12 border border-dashed border-line-strong bg-surface-raised text-11 font-semibold text-ink-subtle hover:border-brand"
          >
            <PhotoIcon />
            <span className="mt-1 leading-tight">{t('photoUpload')}</span>
          </button>
          <ModalField label={t('field.fish')} className="flex-1">
            {field('fish', t('placeholder.fish'))}
          </ModalField>
        </div>
        <Row>
          <ModalField label={t('field.gender')}>
            <select
              value={draft.gender ?? 'Erkak'}
              onChange={(e) => set('gender', e.target.value as Employee['gender'])}
              className={modalInputClass}
            >
              {GENDERS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </ModalField>
          <ModalField label={t('field.birth')}>{field('birth', t('placeholder.date'))}</ModalField>
        </Row>
      </Section>

      {/* --- Персональные данные (locked) --- */}
      {canEditSensitive && (
        <div className="rounded-14 border border-line bg-surface-raised p-4">
          <div className="mb-3 flex items-center gap-2 text-12 font-bold tracking-[0.04em] text-ink-muted uppercase">
            <LockIcon />
            {t('section.maxfiy')}
          </div>
          <div className="flex flex-col gap-3.5">
            <Row>
              <ModalField label={t('field.jshshir')}>{field('jshshir', t('placeholder.jshshir'))}</ModalField>
              <ModalField label={t('field.passport')}>{field('passport', t('placeholder.passport'))}</ModalField>
            </Row>
            <Row>
              <ModalField label={t('field.personalPhone')}>{field('personalPhone', t('placeholder.personalPhone'))}</ModalField>
              <ModalField label={t('field.address')}>{field('address', t('placeholder.address'))}</ModalField>
            </Row>
          </div>
        </div>
      )}

      {/* --- Работа --- */}
      <Section title={t('section.ish')}>
        <Row>
          <ModalField label={t('field.lavozim')}>{field('lavozim', t('placeholder.lavozim'))}</ModalField>
          <ModalField label={t('field.unit')}>
            <select
              value={draft.unit ?? units[0]}
              onChange={(e) => set('unit', e.target.value)}
              className={modalInputClass}
            >
              {units.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </ModalField>
        </Row>
        <Row>
          <ModalField label={t('field.workPhone')}>{field('workPhone', t('placeholder.workPhone'))}</ModalField>
          <ModalField label={t('field.workEmail')}>{field('workEmail', t('placeholder.workEmail'))}</ModalField>
        </Row>
        <ModalField label={t('field.hire')}>{field('hire', t('placeholder.date'))}</ModalField>
      </Section>

      {/* --- Учётка --- */}
      <Section title={t('section.tizim')}>
        <div className="mb-1 flex items-center gap-2 rounded-11 bg-brand-soft px-3.5 py-2.5 text-12 font-semibold text-brand">
          <InfoIcon />
          {t('tizimNote')}
        </div>
        <Row>
          <ModalField label={t('field.login')}>{field('login', t('placeholder.login'))}</ModalField>
          <ModalField label={t('field.pwd')}>
            <input
              type="password"
              value={draft.pwd ?? ''}
              onChange={(e) => set('pwd', e.target.value)}
              placeholder="••••••••"
              className={modalInputClass}
            />
          </ModalField>
        </Row>
        <Row>
          <ModalField label={t('field.role')}>
            <select
              value={draft.roleNames?.[0] ?? ''}
              onChange={(e) => set('roleNames', e.target.value ? [e.target.value] : [])}
              className={modalInputClass}
            >
              <option value="">—</option>
              {roles.map((role) => (
                <option key={role.name} value={role.name}>
                  {role.label}
                </option>
              ))}
            </select>
          </ModalField>
          <ModalField label={t('field.holati')}>
            <select
              value={draft.holati ?? 'Faol'}
              onChange={(e) => set('holati', e.target.value as EmployeeStatus)}
              className={modalInputClass}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </ModalField>
        </Row>
      </Section>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5">
      <div className="text-12 font-bold tracking-[0.04em] text-ink-subtle uppercase">{title}</div>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">{children}</div>;
}

function PhotoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 16-5-5L5 21" />
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

function InfoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}
