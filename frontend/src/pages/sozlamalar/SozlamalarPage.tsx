import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Button } from '@/shared/ui/Button';
import { Toggle } from '@/shared/ui/Toggle';
import { useToast } from '@/shared/ui/Toast';

const FIELD_CLASS =
  'h-[42px] w-full rounded-11 border border-line bg-surface-raised px-3.5 text-14 text-ink outline-none focus:border-brand focus:bg-surface focus:shadow-focus';

export function SozlamalarPage() {
  const { t } = useTranslation('sozlamalar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();

  const [general, setGeneral] = useState({
    name: t('defaults.name'),
    abbr: t('defaults.abbr'),
    founded: t('defaults.founded'),
  });
  const [flags, setFlags] = useState({ twoFA: true, email: true, digest: false });

  return (
    <>
      <CrumbBar crumbs={[{ label: t('title') }]} />

      <div className="mx-auto w-full max-w-[760px] px-8 pt-7 pb-12">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />

        <section className="mb-5 rounded-16 border border-line bg-surface p-6 shadow-card">
          <h3 className="mt-0 mb-[18px] text-15 font-bold text-ink">{t('general.title')}</h3>
          <div className="flex flex-col gap-4">
            <label className="block">
              <span className="mb-1.5 block text-12-5 font-semibold text-ink-muted">
                {t('general.name')}
              </span>
              <input
                value={general.name}
                onChange={(e) => setGeneral((g) => ({ ...g, name: e.target.value }))}
                className={FIELD_CLASS}
              />
            </label>
            <div className="flex gap-4">
              <label className="flex-1">
                <span className="mb-1.5 block text-12-5 font-semibold text-ink-muted">
                  {t('general.abbr')}
                </span>
                <input
                  value={general.abbr}
                  onChange={(e) => setGeneral((g) => ({ ...g, abbr: e.target.value }))}
                  className={FIELD_CLASS}
                />
              </label>
              <label className="flex-1">
                <span className="mb-1.5 block text-12-5 font-semibold text-ink-muted">
                  {t('general.founded')}
                </span>
                <input
                  value={general.founded}
                  onChange={(e) => setGeneral((g) => ({ ...g, founded: e.target.value }))}
                  className={FIELD_CLASS}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-16 border border-line bg-surface px-6 py-2 shadow-card">
          {(['twoFA', 'email', 'digest'] as const).map((key, i) => (
            <div
              key={key}
              className={`flex items-center justify-between py-4 ${i < 2 ? 'border-b border-canvas' : ''}`}
            >
              <div>
                <div className="text-14 font-bold text-ink">{t(`toggles.${key}.title`)}</div>
                <div className="mt-0.5 text-12-5 text-ink-subtle">{t(`toggles.${key}.sub`)}</div>
              </div>
              <Toggle
                checked={flags[key]}
                onChange={(next) => setFlags((f) => ({ ...f, [key]: next }))}
                label={t(`toggles.${key}.title`)}
              />
            </div>
          ))}
        </section>

        <div className="mt-6 flex justify-end">
          <Button onClick={() => toast(t('saved'))}>{tc('save')}</Button>
        </div>
      </div>
    </>
  );
}
