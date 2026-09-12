import { useMemo, useState } from 'react';
import { ExternalLink, FileText, FolderOpen, Image as ImageIcon, Search } from 'lucide-react';
import { useCourseFiles } from '@/hooks/useFiles';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatSize } from '@/utils/fileSize';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

/**
 * Kursning umumiy kutubxonasi.
 *
 * Bu yerda kursda ishlatilayotgan barcha fayllar bir joyda: dars
 * materiallari, konspektlar va uy vazifasi ilovalari. Ilgari ularni topish
 * uchun darslarni birma-bir ochib chiqish kerak edi.
 *
 * Ro'yxat `file_usages` dan yig'iladi — yangi jadval yo'q, ya'ni darsga fayl
 * biriktirilishi bilan u shu yerda ham paydo bo'ladi va hech qachon
 * eskirmaydi. Talabalarning topshirgan ishlari ataylab kirmaydi: ular
 * shaxsiy ish, kurs materiali emas.
 */
export const CourseFileLibrary = ({ courseId }: { courseId: number }) => {
    const { data, isLoading, isError, refetch } = useCourseFiles(courseId);
    const [search, setSearch] = useState('');

    const files = useMemo(() => {
        const all = data?.items ?? [];
        const q = search.trim().toLowerCase();
        if (!q) return all;
        return all.filter(
            (f) =>
                f.title.toLowerCase().includes(q) ||
                f.original_name.toLowerCase().includes(q),
        );
    }, [data, search]);

    if (isError) {
        return <ErrorState title="Kutubxonani yuklab bo'lmadi" onRetry={() => void refetch()} />;
    }

    if (isLoading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
            </div>
        );
    }

    const total = data?.items.length ?? 0;

    if (total === 0) {
        return (
            <EmptyState
                icon={<FolderOpen className="h-6 w-6" />}
                title="Kutubxona bo'sh"
                description="Darslarga material yoki uy vazifasiga ilova biriktirilgach, ular shu yerda to'planadi."
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        type="search"
                        name="search"
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        placeholder="Fayl nomi bo'yicha qidirish..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-9 pl-9 text-sm"
                    />
                </div>
                <span className="text-sm text-muted-foreground">
                    {search ? `${files.length} / ${total}` : `${total} ta fayl`}
                </span>
            </div>

            {files.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                    Qidiruvga mos fayl topilmadi.
                </p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {files.map((file) => {
                        const isImage = IMAGE_EXT.test(file.original_name);
                        return (
                            <a
                                key={file.id}
                                href={file.url}
                                target="_blank"
                                rel="noreferrer"
                                download={file.title}
                                className="group flex items-center gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
                            >
                                {isImage ? (
                                    <ImageIcon className="h-5 w-5 shrink-0 text-primary" />
                                ) : (
                                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                                )}
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium group-hover:text-primary">
                                        {file.title}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                        {formatSize(file.size_bytes)}
                                    </span>
                                </span>
                                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </a>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
