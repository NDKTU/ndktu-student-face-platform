import React from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
    icon?: React.ReactNode;
    title?: string;
    description?: string;
    action?: React.ReactNode;
    className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    description,
    action,
    className,
}) => {
    const { t } = useTranslation();
    title = title ?? t("Ma'lumot topilmadi");
    description = description ?? t("Qidiruv mezonlariga mos yozuv yo'q.");
    return (
        <div className={cn('flex flex-col items-center justify-center gap-3 py-12 text-center w-full mx-auto', className)}>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/70 text-muted-foreground shadow-sm">
                {icon ?? <Inbox className="h-6 w-6" />}
            </div>
            <div className="max-w-md mx-auto text-center space-y-1">
                <p className="text-base font-semibold text-foreground">{title}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            {action && <div className="mt-2 flex justify-center">{action}</div>}
        </div>
    );
};
