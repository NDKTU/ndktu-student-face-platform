import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

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

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isLoading = false,
    variant = 'danger',
}) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="flex flex-col gap-4">
                <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 sm:h-12 sm:w-12">
                        <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                        {description}
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={isLoading}
                    >
                        {cancelText}
                    </Button>
                    <Button
                        type="button"
                        variant={variant}
                        onClick={onConfirm}
                        isLoading={isLoading}
                    >
                        {confirmText}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
