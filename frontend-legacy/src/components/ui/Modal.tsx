import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/utils';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    className?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className }) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(20,22,40,.45)] p-0 md:items-center md:p-4"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className={cn(
                    'relative flex w-full max-w-lg flex-col border border-border bg-card shadow-pop',
                    'max-h-[92vh] rounded-t-[18px] rounded-b-none md:max-h-[calc(100vh-2rem)] md:rounded-[18px]',
                    '[animation:dcpop_.18s_ease]',
                    className,
                )}
            >
                {/* Header — fixed, never scrolls */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#EEF0F6] px-6 py-[18px]">
                    <h2 className="text-[17px] font-bold leading-none tracking-[-0.01em] text-foreground">{title}</h2>
                    <button
                        onClick={onClose}
                        aria-label="Yopish"
                        className="grid h-8 w-8 flex-none place-items-center rounded-[9px] text-muted-foreground transition-colors hover:bg-[#F4F5FA] hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <X className="h-[18px] w-[18px]" />
                    </button>
                </div>
                {/* Body — scrolls when content is taller than viewport */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {children}
                </div>
            </div>
        </div>
    );
};
