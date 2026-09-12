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
 * Radix Dialog with modern backdrop-blur and spring scale entrance animations.
 */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className }) => (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-md transition-opacity duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
            <DialogPrimitive.Content
                aria-describedby={undefined}
                className={cn(
                    // Telefon: pastdan chiqadigan varaq (bottom sheet) — barmoq yetadigan
                    // joyda ochiladi va ekranning 90% igacha cho'ziladi.
                    'fixed inset-x-0 bottom-0 z-50 w-full max-h-[90dvh] rounded-t-2xl border-t border-border/80',
                    'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom',
                    // `md` dan yuqorida — avvalgi markazlashgan oyna.
                    'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[calc(100vw-2rem)] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2',
                    'md:rounded-2xl md:border md:max-h-[calc(100dvh-2rem)]',
                    'md:data-[state=open]:zoom-in-95 md:data-[state=closed]:zoom-out-95 md:data-[state=open]:slide-in-from-bottom-0 md:data-[state=closed]:slide-out-to-bottom-0',
                    'bg-background shadow-2xl shadow-black/15 duration-200',
                    'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
                    'flex flex-col outline-none pb-safe',
                    className
                )}
            >
                {/* Header — fixed, never scrolls */}
                <div className="relative flex flex-col space-y-1.5 text-center sm:text-left px-4 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b border-border/50 shrink-0">
                    <DialogPrimitive.Title className="text-lg font-bold leading-none tracking-tight text-foreground">
                        {title}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Close
                        aria-label="Yopish"
                        className="absolute right-4 top-4 rounded-xl p-1.5 text-muted-foreground opacity-70 transition-all duration-200 hover:opacity-100 hover:bg-muted hover:text-foreground hover:rotate-90 active:scale-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Yopish</span>
                    </DialogPrimitive.Close>
                </div>
                {/* Body — scrolls when content is taller than viewport */}
                <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 custom-scrollbar">
                    {children}
                </div>
            </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
);

export default Modal;
