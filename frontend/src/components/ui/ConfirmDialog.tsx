import React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    isLoading?: boolean;
    variant?: 'danger' | 'primary' | 'secondary' | 'outline' | 'ghost';
}

/**
 * Radix AlertDialog with backdrop-blur, spring scale entrance, and animated danger badge.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Tasdiqlash',
    cancelText = 'Bekor qilish',
    isLoading = false,
    variant = 'danger',
}) => (
    <AlertDialogPrimitive.Root open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) onClose(); }}>
        <AlertDialogPrimitive.Portal>
            <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-md transition-opacity duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
            <AlertDialogPrimitive.Content
                className={cn(
                    'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
                    'rounded-2xl border border-border/80 bg-background p-6 shadow-2xl shadow-black/15 duration-200 outline-none',
                    'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
                    'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
                )}
            >
                <div className="flex items-start gap-4">
                    <div
                        className={cn(
                            'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-xs transition-transform duration-200 hover:scale-105',
                            variant === 'danger'
                                ? 'bg-destructive/15 text-destructive ring-4 ring-destructive/10'
                                : 'bg-primary/15 text-primary ring-4 ring-primary/10'
                        )}
                    >
                        <AlertTriangle
                            className="h-5 w-5 animate-pulse"
                            aria-hidden="true"
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <AlertDialogPrimitive.Title className="text-lg font-bold leading-tight tracking-tight text-foreground">
                            {title}
                        </AlertDialogPrimitive.Title>
                        <AlertDialogPrimitive.Description asChild>
                            <div className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</div>
                        </AlertDialogPrimitive.Description>
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-2.5">
                    <AlertDialogPrimitive.Cancel asChild>
                        <Button type="button" variant="outline" disabled={isLoading}>
                            {cancelText}
                        </Button>
                    </AlertDialogPrimitive.Cancel>
                    <Button type="button" variant={variant} onClick={onConfirm} isLoading={isLoading}>
                        {confirmText}
                    </Button>
                </div>
            </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
);

export default ConfirmDialog;
