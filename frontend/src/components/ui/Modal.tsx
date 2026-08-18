import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    className?: string;
}

/**
 * Radix Dialog underneath: portal, focus trap, scroll lock, Esc and
 * overlay-click close — same public API as the old hand-rolled Modal.
 */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className }) => (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
            <DialogPrimitive.Content
                aria-describedby={undefined}
                className={cn(
                    'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2',
                    'rounded-lg border bg-background shadow-lg duration-200',
                    'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
                    'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
                    'flex flex-col max-h-[calc(100vh-2rem)]',
                    className
                )}
            >
                {/* Header — fixed, never scrolls */}
                <div className="relative flex flex-col space-y-1.5 text-center sm:text-left px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
                    <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight">
                        {title}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Yopish</span>
                    </DialogPrimitive.Close>
                </div>
                {/* Body — scrolls when content is taller than viewport */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {children}
                </div>
            </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
);
