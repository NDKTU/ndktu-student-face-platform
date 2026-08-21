import { Pencil, Trash2, Library, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { ExpandableTags } from '@/components/ui/ExpandableTags';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { tileFor, initialsOf } from '@/lib/avatarTiles';
import type { Course } from '@/services/courseService';

interface CourseTableProps {
    courses: Course[];
    isLoading: boolean;
    isError?: boolean;
    onRetry?: () => void;
    onEdit: (course: Course) => void;
    onDelete: (course: Course) => void;
}

/**
 * Курсы карточной сеткой в стиле референса «Kurslar»: плитка-инициалы,
 * название, преподаватель и кафедра, полоса счётчиков, группы.
 */
export const CourseTable = ({ courses, isLoading, isError, onRetry, onEdit, onDelete }: CourseTableProps) => {
    const navigate = useNavigate();

    if (isError) {
        return <ErrorState onRetry={onRetry} />;
    }
    if (isLoading) {
        return (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-48 w-full rounded-2xl" />
                ))}
            </div>
        );
    }
    if (courses.length === 0) {
        return (
            <EmptyState
                icon={<Library className="h-6 w-6" />}
                title="Kurslar topilmadi"
                description="Hozircha kurs qo'shilmagan yoki filtrlarga mos kurs yo'q."
            />
        );
    }

    const renderActions = (course: Course) => (
        <div className="flex gap-1" onClick={(event) => event.stopPropagation()}>
            <PermissionGate permission="update:course">
                <Button variant="ghost" size="sm" onClick={() => onEdit(course)}>
                    <Pencil className="h-4 w-4" />
                </Button>
            </PermissionGate>
            <PermissionGate permission="delete:course">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(course)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PermissionGate>
        </div>
    );

    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => {
                const subtitle = [course.subject?.name, course.kafedra?.name]
                    .filter(Boolean)
                    .join(' · ');
                return (
                    <div
                        key={course.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/courses/${course.id}`)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                navigate(`/courses/${course.id}`);
                            }
                        }}
                        className="group flex cursor-pointer flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <div className="flex items-start gap-3">
                            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${tileFor(course.id)}`}>
                                {initialsOf(course.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-display font-semibold leading-snug text-foreground">{course.name}</p>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle || '—'}</p>
                            </div>
                            {renderActions(course)}
                            <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-4">
                            <div className="min-w-0">
                                <p className="font-display text-lg font-bold text-foreground">{course.topic_count ?? 0}</p>
                                <p className="text-xs text-muted-foreground">Mavzu</p>
                            </div>
                            <div>
                                <p className="font-display text-lg font-bold text-primary">{course.lesson_count ?? 0}</p>
                                <p className="text-xs text-muted-foreground">Dars</p>
                            </div>
                        </div>

                        {course.groups.length > 0 && (
                            <div className="mt-3 border-t border-border/60 pt-3">
                                <ExpandableTags
                                    items={course.groups.map((g) => ({ id: g.id, name: g.name }))}
                                    limit={3}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
