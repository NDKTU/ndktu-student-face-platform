import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    className?: string;
}

/** Единый заголовок страницы: один размер, один шрифт, слот для кнопок справа. */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions, className }) => (
    <div className={cn('page-header', className)}>
        <div>
            <h1 className="page-title">{title}</h1>
            {description && <p className="page-description mt-1">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
);
