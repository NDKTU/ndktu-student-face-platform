import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface HierarchyHeaderProps {
    title: string;
    description?: string;
    onBack: () => void;
    actions?: React.ReactNode;
}

export const HierarchyHeader = ({ title, description, onBack, actions }: HierarchyHeaderProps) => (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} aria-label="Orqaga qaytish">
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
                <h1 className="page-title truncate">{title}</h1>
                {description && <p className="page-description mt-1">{description}</p>}
            </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
);
