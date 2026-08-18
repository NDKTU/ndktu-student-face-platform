import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
    title?: string;
    description?: string;
    onRetry?: () => void;
    className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
    title,
    description,
    onRetry,
    className,
}) => {
    const { t } = useTranslation();
    title = title ?? t('Yuklashda xatolik');
    description = description ?? t("Ma'lumotlarni yuklab bo'lmadi. Internet aloqasini tekshirib, qayta urinib ko'ring.");
    return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 text-center', className)}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="h-6 w-6" />
        </div>
        <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
        </div>
        {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                {t('Qayta urinish')}
            </Button>
        )}
    </div>
    );
};
