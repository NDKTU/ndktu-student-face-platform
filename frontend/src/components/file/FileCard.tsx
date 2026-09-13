import React from 'react';
import {
    MoreVertical,
    ExternalLink,
    Link2,
    Pencil,
    FolderInput,
    Trash2,
    Eye,
} from 'lucide-react';
import type { LibraryFile } from '@/services/fileService';
import { PermissionGate } from '@/components/auth/PermissionGate';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { getFileTypeMeta } from './fileIcons';
import { formatSize } from '@/utils/fileSize';
import { cn } from '@/lib/utils';

interface FileCardProps {
    file: LibraryFile;
    onViewDetail: (file: LibraryFile) => void;
    onRename: (file: LibraryFile) => void;
    onMove: (file: LibraryFile) => void;
    onDelete: (file: LibraryFile) => void;
}

export const FileCard: React.FC<FileCardProps> = ({
    file,
    onViewDetail,
    onRename,
    onMove,
    onDelete,
}) => {
    const meta = getFileTypeMeta(file.original_name || file.url || file.title);
    const isImage = meta.category === 'image';
    const { Icon } = meta;

    return (
        <div
            onClick={() => onViewDetail(file)}
            className={cn(
                'group relative flex flex-col rounded-2xl border border-border/70 bg-card p-3 shadow-sm transition-all duration-200',
                'hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
            )}
        >
            {/* Yuqori media / ikonka sohasi */}
            <div className="relative mb-3 flex h-32 w-full items-center justify-center overflow-hidden rounded-xl bg-muted/50 border border-border/40">
                {isImage ? (
                    <img
                        src={file.url}
                        alt={file.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-center">
                        <div
                            className={cn(
                                'flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-110',
                                meta.iconBg,
                                meta.iconText
                            )}
                        >
                            <Icon className="h-7 w-7" />
                        </div>
                    </div>
                )}

                {/* Format nishoni (masalan: PDF, DOCX) */}
                <div className="absolute left-2.5 top-2.5">
                    <span
                        className={cn(
                            'rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase shadow-xs backdrop-blur-sm',
                            meta.badgeBg,
                            meta.badgeText
                        )}
                    >
                        {meta.ext}
                    </span>
                </div>

                {/* Amallar menyusi (Dropdown) */}
                <div
                    className="absolute right-2 top-2 z-10"
                    onClick={(e) => e.stopPropagation()}
                >
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label="Fayl amallari"
                                className="flex h-8 w-8 items-center justify-center rounded-lg bg-background/80 text-muted-foreground backdrop-blur-md transition-all hover:bg-background hover:text-foreground shadow-xs"
                            >
                                <MoreVertical className="h-4 w-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                                onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(file.url, '_blank', 'noopener,noreferrer');
                                }}
                            >
                                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                                <span>Faylni ochish</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onViewDetail(file);
                                }}
                            >
                                <Eye className="h-4 w-4 text-muted-foreground" />
                                <span>Tafsilotlar</span>
                            </DropdownMenuItem>

                            <PermissionGate permission="update:file">
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRename(file);
                                    }}
                                >
                                    <Pencil className="h-4 w-4 text-muted-foreground" />
                                    <span>Nomini oʻzgartirish</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onMove(file);
                                    }}
                                >
                                    <FolderInput className="h-4 w-4 text-muted-foreground" />
                                    <span>Papkaga koʻchirish</span>
                                </DropdownMenuItem>
                            </PermissionGate>

                            <PermissionGate permission="delete:file">
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    destructive
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(file);
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    <span>Oʻchirish</span>
                                </DropdownMenuItem>
                            </PermissionGate>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Fayl nomi va ma'lumotlari */}
            <div className="flex flex-1 flex-col justify-between space-y-2">
                <div>
                    <h4
                        className="truncate text-sm font-semibold text-foreground leading-snug group-hover:text-primary transition-colors"
                        title={file.title}
                    >
                        {file.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {formatSize(file.size_bytes)}
                    </p>
                </div>

                {/* Ishlatilish holati nishoni */}
                <div className="pt-1 border-t border-border/50">
                    {file.usage_count > 0 ? (
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewDetail(file);
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                        >
                            <Link2 className="h-3.5 w-3.5 shrink-0" />
                            <span>{file.usage_count} ta joyda ishlatilgan</span>
                        </div>
                    ) : (
                        <span className="text-[11px] text-muted-foreground/80">
                            Hozircha ishlatilmagan
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

