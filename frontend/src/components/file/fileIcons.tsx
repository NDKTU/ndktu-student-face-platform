import React from 'react';
import {
    FileText,
    FileSpreadsheet,
    FileCode,
    FileArchive,
    FileVideo,
    FileAudio,
    Image as ImageIcon,
    File,
} from 'lucide-react';

export type FileCategory =
    | 'image'
    | 'pdf'
    | 'word'
    | 'excel'
    | 'powerpoint'
    | 'archive'
    | 'audio'
    | 'video'
    | 'code'
    | 'text'
    | 'other';

export interface FileTypeMeta {
    ext: string;
    category: FileCategory;
    label: string;
    badgeBg: string;
    badgeText: string;
    iconBg: string;
    iconText: string;
    Icon: React.ComponentType<{ className?: string }>;
}

export const getFileExtension = (nameOrUrl: string): string => {
    try {
        const urlWithoutQuery = nameOrUrl.split('?')[0].split('#')[0];
        const match = urlWithoutQuery.match(/\.([a-z0-9]+)$/i);
        return match ? match[1].toLowerCase() : '';
    } catch {
        return '';
    }
};

export const getFileTypeMeta = (nameOrUrl: string): FileTypeMeta => {
    const ext = getFileExtension(nameOrUrl);

    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
        return {
            ext: ext.toUpperCase() || 'IMG',
            category: 'image',
            label: 'Rasm',
            badgeBg: 'bg-rose-500/10 dark:bg-rose-500/20',
            badgeText: 'text-rose-600 dark:text-rose-400',
            iconBg: 'bg-rose-50 dark:bg-rose-950/40',
            iconText: 'text-rose-600 dark:text-rose-400',
            Icon: ImageIcon,
        };
    }

    if (ext === 'pdf') {
        return {
            ext: 'PDF',
            category: 'pdf',
            label: 'PDF Hujjat',
            badgeBg: 'bg-red-500/10 dark:bg-red-500/20',
            badgeText: 'text-red-600 dark:text-red-400',
            iconBg: 'bg-red-50 dark:bg-red-950/40',
            iconText: 'text-red-600 dark:text-red-400',
            Icon: FileText,
        };
    }

    if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) {
        return {
            ext: ext.toUpperCase(),
            category: 'word',
            label: 'Word Hujjat',
            badgeBg: 'bg-blue-500/10 dark:bg-blue-500/20',
            badgeText: 'text-blue-600 dark:text-blue-400',
            iconBg: 'bg-blue-50 dark:bg-blue-950/40',
            iconText: 'text-blue-600 dark:text-blue-400',
            Icon: FileText,
        };
    }

    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
        return {
            ext: ext.toUpperCase(),
            category: 'excel',
            label: 'Jadval (Excel)',
            badgeBg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
            badgeText: 'text-emerald-600 dark:text-emerald-400',
            iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
            iconText: 'text-emerald-600 dark:text-emerald-400',
            Icon: FileSpreadsheet,
        };
    }

    if (['ppt', 'pptx', 'odp'].includes(ext)) {
        return {
            ext: ext.toUpperCase(),
            category: 'powerpoint',
            label: 'Taqdimot',
            badgeBg: 'bg-orange-500/10 dark:bg-orange-500/20',
            badgeText: 'text-orange-600 dark:text-orange-400',
            iconBg: 'bg-orange-50 dark:bg-orange-950/40',
            iconText: 'text-orange-600 dark:text-orange-400',
            Icon: FileText,
        };
    }

    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
        return {
            ext: ext.toUpperCase(),
            category: 'archive',
            label: 'Arxiv',
            badgeBg: 'bg-amber-500/10 dark:bg-amber-500/20',
            badgeText: 'text-amber-600 dark:text-amber-400',
            iconBg: 'bg-amber-50 dark:bg-amber-950/40',
            iconText: 'text-amber-600 dark:text-amber-400',
            Icon: FileArchive,
        };
    }

    if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
        return {
            ext: ext.toUpperCase(),
            category: 'audio',
            label: 'Audio',
            badgeBg: 'bg-violet-500/10 dark:bg-violet-500/20',
            badgeText: 'text-violet-600 dark:text-violet-400',
            iconBg: 'bg-violet-50 dark:bg-violet-950/40',
            iconText: 'text-violet-600 dark:text-violet-400',
            Icon: FileAudio,
        };
    }

    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
        return {
            ext: ext.toUpperCase(),
            category: 'video',
            label: 'Video',
            badgeBg: 'bg-pink-500/10 dark:bg-pink-500/20',
            badgeText: 'text-pink-600 dark:text-pink-400',
            iconBg: 'bg-pink-50 dark:bg-pink-950/40',
            iconText: 'text-pink-600 dark:text-pink-400',
            Icon: FileVideo,
        };
    }

    if (['py', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'sql', 'java', 'cpp', 'c', 'sh', 'php'].includes(ext)) {
        return {
            ext: ext.toUpperCase(),
            category: 'code',
            label: 'Dastur kodi',
            badgeBg: 'bg-cyan-500/10 dark:bg-cyan-500/20',
            badgeText: 'text-cyan-600 dark:text-cyan-400',
            iconBg: 'bg-cyan-50 dark:bg-cyan-950/40',
            iconText: 'text-cyan-600 dark:text-cyan-400',
            Icon: FileCode,
        };
    }

    if (['txt', 'log', 'md'].includes(ext)) {
        return {
            ext: ext.toUpperCase(),
            category: 'text',
            label: 'Matn',
            badgeBg: 'bg-slate-500/10 dark:bg-slate-500/20',
            badgeText: 'text-slate-600 dark:text-slate-400',
            iconBg: 'bg-slate-100 dark:bg-slate-800',
            iconText: 'text-slate-600 dark:text-slate-400',
            Icon: FileText,
        };
    }

    return {
        ext: ext ? ext.toUpperCase() : 'FAYL',
        category: 'other',
        label: 'Fayl',
        badgeBg: 'bg-muted',
        badgeText: 'text-muted-foreground',
        iconBg: 'bg-muted',
        iconText: 'text-muted-foreground',
        Icon: File,
    };
};

