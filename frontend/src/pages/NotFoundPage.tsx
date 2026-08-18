import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home } from 'lucide-react';

const NotFoundPage = () => {
    const { t } = useTranslation();

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
            <p className="font-display text-8xl font-bold tracking-tight text-primary">404</p>
            <div>
                <h1 className="text-xl font-semibold text-foreground">{t('Sahifa topilmadi')}</h1>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    {t("Siz izlagan sahifa mavjud emas yoki ko'chirilgan bo'lishi mumkin.")}
                </p>
            </div>
            <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
                <Home className="h-4 w-4" />
                {t('Bosh sahifaga qaytish')}
            </Link>
        </div>
    );
};

export default NotFoundPage;
