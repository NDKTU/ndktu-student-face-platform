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
 * Radix AlertDialog underneath. Confirm does NOT auto-close: the caller
 * closes via isOpen after its mutation settles (same contract as before).
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
            <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
            <AlertDialogPrimitive.Content
                className={cn(
                    'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
                    'rounded-lg border bg-background p-6 shadow-lg duration-200',
                    'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
                    'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
                )}
            >
                <div className="flex items-start gap-4">
                    <div
                        className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12',
                            variant === 'danger' ? 'bg-destructive/15' : 'bg-primary/15'
                        )}
                    >
                        <AlertTriangle
                            className={cn('h-5 w-5', variant === 'danger' ? 'text-destructive' : 'text-primary')}
                            aria-hidden="true"
                        />
                    </div>
                    <div className="min-w-0">
                        <AlertDialogPrimitive.Title className="text-lg font-semibold leading-tight tracking-tight">
                            {title}
                        </AlertDialogPrimitive.Title>
                        <AlertDialogPrimitive.Description asChild>
                            <div className="mt-2 text-sm text-muted-foreground">{description}</div>
                        </AlertDialogPrimitive.Description>
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
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
