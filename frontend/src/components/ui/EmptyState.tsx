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
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 text-center', className)}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {icon ?? <Inbox className="h-6 w-6" />}
        </div>
        <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {action && <div className="mt-2">{action}</div>}
    </div>
    );
};
