import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import type { NavKey } from '@/entities/access/model/roles';

/**
 * Заглушка для разделов, которые ещё не портированы.
 * Нужна, чтобы навигация и проверка прав работали целиком уже сейчас —
 * без неё нельзя протестировать, что роли видят разные наборы разделов.
 */
export function PlaceholderPage() {
  const { nav } = useParams<{ nav: string }>();
  const { t } = useTranslation('nav');
  const { canAccess } = usePermissions();

  const key = nav as NavKey;
  const allowed = canAccess(key);
  const label = allowed ? t(key, { defaultValue: key }) : t('bosh');

  return (
    <>
      <CrumbBar crumbs={[{ label }]} />
      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
          <h1 className="m-0 text-23 font-extrabold tracking-[-0.02em] text-ink">{label}</h1>
          <p className="mx-auto mt-2 max-w-[420px] text-13-5 text-ink-subtle">
            {allowed ? t('placeholder.soon') : t('placeholder.denied')}
          </p>
        </div>
      </div>
    </>
  );
}
