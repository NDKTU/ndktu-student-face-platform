import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/features/auth/lib/useCurrentUser';
import { useSessionStore } from '@/features/auth/model/session.store';
import { changeCredentials } from '@/shared/api/auth';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { Button } from '@/shared/ui/Button';
import { modalInputClass } from '@/shared/ui/Modal';
import { useToast } from '@/shared/ui/Toast';

const MIN_PASSWORD_LENGTH = 6;

export function ProfilPage() {
  const { t } = useTranslation('profil');
  const me = useCurrentUser();
  const user = useSessionStore((s) => s.user);
  const signOut = useSessionStore((s) => s.signOut);
  const toast = useToast();

  const [password, setPassword] = useState({ old: '', next: '', repeat: '' });
  const [busy, setBusy] = useState(false);

  // Анкета — то, что отдал `/user/me`. Пустые поля не показываем: строка
  // «Kafedra — —» ничего не сообщает, а место занимает.
  const employee = user?.employee ?? null;
  const student = user?.student ?? null;
  const org = employee?.teacher?.kafedra?.name ?? student?.faculty ?? '';

  const rows = (
    [
      [t('username'), me.username],
      ...(employee
        ? [
            [t('phone'), employee.phone_number ?? ''],
            [t('kafedra'), employee.teacher?.kafedra?.name ?? ''],
          ]
        : []),
      ...(student
        ? [
            [t('group'), student.group?.name ?? ''],
            [t('faculty'), student.faculty ?? ''],
            [t('specialty'), student.specialty ?? ''],
            [t('level'), student.level ?? ''],
            [t('semester'), student.semester ?? ''],
            [t('educationForm'), student.education_form ?? ''],
            [t('paymentForm'), student.payment_form ?? ''],
            [t('gpa'), student.avg_gpa === null ? '' : String(student.avg_gpa)],
          ]
        : []),
    ] as [string, string][]
  ).filter(([, value]) => value !== '');

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (!password.old || !password.next || !password.repeat) {
      toast(t('password.empty'));
      return;
    }
    if (password.next !== password.repeat) {
      toast(t('password.mismatch'));
      return;
    }
    if (password.next.length < MIN_PASSWORD_LENGTH) {
      toast(t('password.tooShort'));
      return;
    }

    setBusy(true);
    try {
      await changeCredentials({ current_password: password.old, password: password.next });
      setPassword({ old: '', next: '', repeat: '' });
      toast(t('password.changed'));
      // Бэкенд удаляет `jti` из Redis при смене пароля — сессия уже мертва, и
      // следующий же запрос вернул бы 401. Выходим сами, пока можем объяснить
      // причину.
      signOut();
    } catch (error) {
      toast(error instanceof Error ? error.message : t('password.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <CrumbBar crumbs={[{ label: t('title') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <div className="mb-5 rounded-18 border border-line bg-surface p-6 shadow-card">
          <div className="flex flex-wrap items-start gap-[18px]">
            <div
              className="grid size-[58px] flex-none place-items-center rounded-15 text-18 font-extrabold text-white"
              style={{ background: me.roleColor }}
              aria-hidden="true"
            >
              {me.initials}
            </div>
            <div className="min-w-[220px] flex-1">
              <h1 className="m-0 text-23 leading-[1.15] font-extrabold tracking-[-0.02em] text-ink">
                {me.displayName}
              </h1>
              <div className="mt-1.5 text-13-5 text-ink-subtle">
                {[me.roleLabel, org].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
        </div>

        <div className="grid items-start gap-[18px] lg:grid-cols-2">
          <section className="rounded-18 border border-line bg-surface p-6 shadow-card">
            <h2 className="mt-0 mb-4 text-16 font-bold text-ink">{t('details')}</h2>
            <Rows rows={rows} />
          </section>

          <section className="rounded-18 border border-line bg-surface p-6 shadow-card">
            <h2 className="mt-0 mb-4 text-16 font-bold text-ink">{t('password.title')}</h2>
            <form onSubmit={(e) => void changePassword(e)} className="flex flex-col gap-3.5">
              {(
                [
                  ['old', t('password.old')],
                  ['next', t('password.new')],
                  ['repeat', t('password.repeat')],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="block">
                  <span className="mb-1.5 block text-12-5 font-semibold text-ink-muted">
                    {label}
                  </span>
                  <input
                    type="password"
                    autoComplete={field === 'old' ? 'current-password' : 'new-password'}
                    value={password[field]}
                    onChange={(e) => setPassword((p) => ({ ...p, [field]: e.target.value }))}
                    className={modalInputClass}
                  />
                </label>
              ))}
              <p className="m-0 text-12 text-ink-subtle">{t('password.reloginHint')}</p>
              <div className="flex justify-end">
                <Button type="submit" disabled={busy}>
                  {busy ? t('password.submitting') : t('password.submit')}
                </Button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}

function Rows({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="m-0 flex flex-col gap-3.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4">
          <dt className="text-12-5 font-semibold text-ink-subtle">{label}</dt>
          <dd className="m-0 text-right text-13-5 font-semibold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
