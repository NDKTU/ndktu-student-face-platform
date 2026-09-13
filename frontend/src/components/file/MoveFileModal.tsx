import React, { useState } from 'react';
import { Folder, FolderHeart, HardDrive, Check } from 'lucide-react';
import type { LibraryFile, LibraryFolder } from '@/services/fileService';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface MoveFileModalProps {
    isOpen: boolean;
    onClose: () => void;
    file: LibraryFile | null;
    folders: LibraryFolder[];
    onMove: (fileId: number, targetFolderId: number | null) => Promise<void>;
    isPending?: boolean;
}

const MoveFileModalContent: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    file: LibraryFile;
    folders: LibraryFolder[];
    onMove: (fileId: number, targetFolderId: number | null) => Promise<void>;
    isPending: boolean;
}> = ({ isOpen, onClose, file, folders, onMove, isPending }) => {
    const [selectedFolderId, setSelectedFolderId] = useState<number | null>(file.folder_id ?? null);

    const currentFolderId = file.folder_id ?? null;
    const isUnchanged = selectedFolderId === currentFolderId;

    const handleConfirm = async () => {
        if (isUnchanged) {
            onClose();
            return;
        }
        await onMove(file.id, selectedFolderId);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Faylni boshqa papkaga ko'chirish"
            className="max-w-md"
        >
            <div className="space-y-4">
                <div className="rounded-xl border border-border/80 bg-muted/40 p-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Tanlangan fayl
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground">
                        {file.title}
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">
                        Qaysi papkaga koʻchirmoqchisiz?
                    </label>

                    <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-border/70 p-1.5 custom-scrollbar">
                        {/* Asosiy papka (Root) */}
                        <button
                            type="button"
                            onClick={() => setSelectedFolderId(null)}
                            className={cn(
                                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all',
                                selectedFolderId === null
                                    ? 'bg-primary/10 text-primary font-medium border border-primary/20'
                                    : 'text-foreground hover:bg-muted'
                            )}
                        >
                            <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="flex-1 truncate">Asosiy papka (Papkasiz)</span>
                            {currentFolderId === null && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    Hozirgi
                                </span>
                            )}
                            {selectedFolderId === null && (
                                <Check className="h-4 w-4 shrink-0 text-primary" />
                            )}
                        </button>

                        {/* Mavjud papkalar */}
                        {folders.map((folder) => {
                            const isSelected = selectedFolderId === folder.id;
                            const isCurrent = currentFolderId === folder.id;

                            return (
                                <button
                                    key={folder.id}
                                    type="button"
                                    onClick={() => setSelectedFolderId(folder.id)}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all',
                                        isSelected
                                            ? 'bg-primary/10 text-primary font-medium border border-primary/20'
                                            : 'text-foreground hover:bg-muted'
                                    )}
                                >
                                    {folder.is_personal ? (
                                        <FolderHeart className="h-4 w-4 shrink-0 text-primary" />
                                    ) : (
                                        <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                                    )}
                                    <span className="flex-1 truncate">{folder.name}</span>
                                    {isCurrent && (
                                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                            Hozirgi
                                        </span>
                                    )}
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {folder.file_count} ta
                                    </span>
                                    {isSelected && (
                                        <Check className="h-4 w-4 shrink-0 text-primary" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
                    <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
                        Bekor qilish
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleConfirm}
                        isLoading={isPending}
                        disabled={isUnchanged}
                    >
                        Koʻchirish
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export const MoveFileModal: React.FC<MoveFileModalProps> = (props) => {
    if (!props.isOpen || !props.file) return null;
    return <MoveFileModalContent key={props.file.id} {...props} file={props.file} isPending={props.isPending ?? false} />;
};

