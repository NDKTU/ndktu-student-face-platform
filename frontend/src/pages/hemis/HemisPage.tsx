import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHemisStore, type HemisStep } from '@/features/hemis/model/hemis.store';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import * as hemisApi from '@/shared/api/hemis';
import * as reytingApi from '@/shared/api/reyting';
import type { HemisProfile, HemisPreview } from '@/shared/api/hemis';
import type { RefOption } from '@/shared/api/reyting';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Button } from '@/shared/ui/Button';
import { ModalField, modalInputClass } from '@/shared/ui/Modal';

const STEPS: HemisStep[] = ['credentials', 'preview', 'done'];

/** Порядок полей профиля на экране сверки. */
const FIELDS: (keyof HemisProfile)[] = [
  'fullName',
  'studentIdNumber',
  'faculty',
  'group',
  'specialty',
  'level',
  'semester',
  'educationForm',
  'educationType',
  'paymentForm',
  'educationLang',
  'studentStatus',
  'gender',
  'birthDate',
  'phone',
  'address',
  'university',
];

export function HemisPage() {
  const { t } = useTranslation('hemis');

  const step = useHemisStore((s) => s.step);
  const busy = useHemisStore((s) => s.busy);
  const error = useHemisStore((s) => s.error);
  const preview = useHemisStore((s) => s.preview);
  const result = useHemisStore((s) => s.result);
  const reset = useHemisStore((s) => s.reset);

  // Уходя с экрана, стираем пароль: он не должен пережить переход в другой
  // раздел, даже в памяти стора.
  useEffect(() => reset, [reset]);

  return (
    <>
      <CrumbBar crumbs={[{ label: t('title') }]} />

      <div className="mx-auto w-full max-w-[1100px] px-8 pt-7 pb-12">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />

        <div className="mb-5 flex items-center gap-2">
          {STEPS.map((key, index) => {
            const current = STEPS.indexOf(step);
            const state = index < current ? 'done' : index === current ? 'now' : 'next';
            return (
              <div key={key} className="flex items-center gap-2">
                <span
                  className={`grid size-[26px] place-items-center rounded-full text-12 font-bold ${
                    state === 'now'
                      ? 'bg-brand text-white'
                      : state === 'done'
                        ? 'bg-success-soft text-success'
                        : 'bg-surface-muted text-ink-subtle'
                  }`}
                >
                  {index + 1}
                </span>
                <span
                  className={`text-13 font-semibold ${
                    state === 'next' ? 'text-ink-subtle' : 'text-ink'
                  }`}
                >
                  {t(`step.${key}`)}
                </span>
                {index < STEPS.length - 1 && <span className="w-6 border-t border-line" />}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 rounded-12 border border-danger bg-danger-soft px-4 py-3 text-13-5 text-danger">
            {error}
          </div>
        )}

        {step === 'credentials' && <CredentialsStep busy={busy} />}
        {step === 'preview' && preview && <PreviewStep preview={preview} busy={busy} />}
        {step === 'done' && (
          <div className="rounded-18 border border-line bg-surface px-6 py-14 text-center shadow-card">
            <div className="mx-auto mb-4 grid size-[54px] place-items-center rounded-full bg-success-soft text-success">
              <CheckIcon />
            </div>
            <h3 className="m-0 text-16 font-bold text-ink">{t('done.title')}</h3>
            <p className="mx-auto mt-2 text-13-5 text-ink-subtle">{result ?? ''}</p>
            <Button className="mt-5" onClick={reset}>
              {t('done.again')}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function CredentialsStep({ busy }: { busy: boolean }) {
  const { t } = useTranslation('hemis');
  const setCredentials = useHemisStore((s) => s.setCredentials);
  const loadPreview = useHemisStore((s) => s.loadPreview);

  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);

  const empty = !login.trim() || !password;

  function submit() {
    setTouched(true);
    if (empty) return;
    setCredentials(login.trim(), password);
    void loadPreview();
  }

  return (
    <div className="max-w-[480px] rounded-18 border border-line bg-surface p-6 shadow-card">
      <p className="mt-0 mb-5 text-13 text-ink-subtle">{t('form.hint')}</p>

      <ModalField label={t('form.login')}>
        <input
          value={login}
          autoComplete="off"
          onChange={(e) => setLogin(e.target.value)}
          className={modalInputClass}
        />
      </ModalField>
      <ModalField label={t('form.password')}>
        <input
          type="password"
          value={password}
          autoComplete="off"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className={modalInputClass}
        />
      </ModalField>

      {touched && empty && (
        <p className="mt-1 mb-0 text-12-5 text-danger">{t('form.required')}</p>
      )}

      <Button className="mt-4 w-full" disabled={busy} onClick={submit}>
        {busy ? t('form.loading') : t('form.submit')}
      </Button>
    </div>
  );
}

function PreviewStep({ preview, busy }: { preview: HemisPreview; busy: boolean }) {
  const { t } = useTranslation('hemis');
  const { has } = usePermissions();

  const facultyId = useHemisStore((s) => s.facultyId);
  const groupId = useHemisStore((s) => s.groupId);
  const setFacultyId = useHemisStore((s) => s.setFacultyId);
  const setGroupId = useHemisStore((s) => s.setGroupId);
  const sync = useHemisStore((s) => s.sync);
  const reset = useHemisStore((s) => s.reset);

  const [faculties, setFaculties] = useState<RefOption[]>([]);
  const [groups, setGroups] = useState<RefOption[]>([]);

  const canPickFaculty = has('read:faculty');
  const canPickGroup = has('read:group');

  useEffect(() => {
    if (canPickFaculty) reytingApi.getFacultyOptions().then(setFaculties, () => setFaculties([]));
  }, [canPickFaculty]);

  useEffect(() => {
    if (!canPickGroup) return;
    // Список групп запрашиваем с фильтром по факультету: их тысячи, и
    // отфильтровать на клиенте значило бы сначала все их скачать.
    hemisApi.getGroupOptions(facultyId).then(setGroups, () => setGroups([]));
  }, [canPickGroup, facultyId]);

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <div className="flex flex-col gap-4">
        <div className="rounded-16 border border-line bg-surface p-5 shadow-card">
          <h3 className="mt-0 mb-3 text-14 font-bold text-ink">{t('preview.status')}</h3>
          <span
            className={`inline-block rounded-8 px-2.5 py-1 text-12 font-bold ${
              preview.userExists ? 'bg-brand-soft text-brand' : 'bg-warning-soft text-warning'
            }`}
          >
            {preview.userExists ? t('preview.willUpdate') : t('preview.willCreate')}
          </span>
        </div>

        <div className="rounded-16 border border-line bg-surface p-5 shadow-card">
          <h3 className="mt-0 mb-1 text-14 font-bold text-ink">{t('preview.override')}</h3>
          <p className="mt-0 mb-4 text-12 text-ink-subtle">{t('preview.overrideHint')}</p>

          {canPickFaculty && (
            <ModalField label={t('preview.faculty')}>
              <select
                aria-label={t('preview.faculty')}
                value={facultyId ?? ''}
                onChange={(e) => setFacultyId(e.target.value === '' ? null : Number(e.target.value))}
                className={modalInputClass}
              >
                <option value="">{t('preview.auto')}</option>
                {faculties.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </ModalField>
          )}
          {!preview.facultyExists && facultyId === null && (
            <p className="mt-1 mb-3 text-11-5 text-warning">{t('preview.facultyMissing')}</p>
          )}

          {canPickGroup && (
            <ModalField label={t('preview.group')}>
              <select
                aria-label={t('preview.group')}
                value={groupId ?? ''}
                onChange={(e) => setGroupId(e.target.value === '' ? null : Number(e.target.value))}
                className={modalInputClass}
              >
                <option value="">{t('preview.auto')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </ModalField>
          )}
          {!preview.groupExists && groupId === null && (
            <p className="mt-1 mb-0 text-11-5 text-brand">
              {t('preview.groupMissing', { name: preview.suggestedGroup })}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={reset}>
            {t('preview.back')}
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => void sync()}>
            {busy ? t('preview.syncing') : t('preview.sync')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-16 border border-line bg-surface p-5 shadow-card">
          <h3 className="mt-0 mb-4 text-14 font-bold text-ink">{t('preview.profile')}</h3>
          <dl className="m-0 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {FIELDS.map((key) => (
              <div key={key} className="min-w-0">
                <dt className="text-11-5 text-ink-subtle">{t(`field.${key}`)}</dt>
                <dd className="m-0 truncate text-13-5 font-semibold text-ink">
                  {preview.profile[key] || '—'}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-16 border border-line bg-surface p-5 shadow-card">
          <h3 className="mt-0 mb-3 text-14 font-bold text-ink">{t('preview.results')}</h3>
          {preview.existingResults.length === 0 ? (
            <p className="m-0 text-13-5 text-ink-subtle">{t('preview.noResults')}</p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <Th>{t('result.quiz')}</Th>
                  <Th>{t('result.subject')}</Th>
                  <Th className="w-[80px] text-center">{t('result.grade')}</Th>
                  <Th className="w-[120px]">{t('result.date')}</Th>
                </tr>
              </thead>
              <tbody>
                {preview.existingResults.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-b-0">
                    <td className="py-2 pr-3 text-13 text-ink">{row.quiz || '—'}</td>
                    <td className="py-2 pr-3 text-13 text-ink-muted">{row.subject || '—'}</td>
                    <td className="py-2 pr-3 text-center text-13 font-bold text-ink">
                      {row.grade ?? '—'}
                    </td>
                    <td className="py-2 text-13 text-ink-muted">{row.createdAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`pb-2 text-11 font-bold tracking-[0.03em] text-ink-subtle uppercase ${className}`}>
      {children}
    </th>
  );
}

function CheckIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}
