import { Card, CardContent } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { Button } from '@/components/ui/Button';
import { X } from 'lucide-react';
import PermissionGate from '@/components/auth/PermissionGate';
import type { Subject } from '@/services/subjectService';
import type { Group } from '@/services/groupService';
import type { Teacher } from '@/services/teacherService';
import type { Faculty } from '@/services/facultyService';

interface QuizFiltersProps {
    subjects: Subject[];
    groups: Group[];
    teachers: Teacher[];
    /** Фильтр по факультету — только на странице со сплошным списком тестов. */
    faculties?: Faculty[];
    filterFacultyId?: number | undefined;
    onFacultyChange?: (id: number | undefined) => void;
    filterSubjectId: number | undefined;
    onSubjectChange: (id: number | undefined) => void;
    filterGroupId: number | undefined;
    onGroupChange: (id: number | undefined) => void;
    filterUserId: number | undefined;
    onUserChange: (id: number | undefined) => void;
    filterIsActive?: boolean | undefined;
    onIsActiveChange?: (val: boolean | undefined) => void;
    sortDir: 'desc' | 'asc';
    onSortDirChange: (dir: 'desc' | 'asc') => void;
    hasActiveFilters: boolean;
    onClearFilters: () => void;
    hideStatusFilter?: boolean;
}

const selectClassName =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export const QuizFilters = ({
    subjects,
    groups,
    teachers,
    faculties,
    filterFacultyId,
    onFacultyChange,
    filterSubjectId,
    onSubjectChange,
    filterGroupId,
    onGroupChange,
    filterUserId,
    onUserChange,
    filterIsActive,
    onIsActiveChange,
    sortDir,
    onSortDirChange,
    hasActiveFilters,
    onClearFilters,
    hideStatusFilter,
}: QuizFiltersProps) => {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex flex-wrap gap-4 items-end">
                    {faculties && onFacultyChange && (
                        <PermissionGate permission="read:faculty">
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px] sm:flex-1">
                                <label className="text-sm font-medium">Fakultet bo'yicha filtri</label>
                                <Combobox
                                    options={faculties.map(f => ({ value: f.id.toString(), label: f.name }))}
                                    value={filterFacultyId?.toString()}
                                    onChange={(val) => onFacultyChange(val ? parseInt(val) : undefined)}
                                    placeholder="Barcha fakultetlar"
                                    searchPlaceholder="Fakultetni qidirish..."
                                />
                            </div>
                        </PermissionGate>
                    )}
                    <PermissionGate permission="read:subject">
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px] sm:flex-1">
                            <label className="text-sm font-medium">Fan bo'yicha filtri</label>
                            <Combobox
                                options={subjects.map(s => ({ value: s.id.toString(), label: s.name }))}
                                value={filterSubjectId?.toString()}
                                onChange={(val) => onSubjectChange(val ? parseInt(val) : undefined)}
                                placeholder="Barcha fanlar"
                                searchPlaceholder="Fanni qidirish..."
                            />
                        </div>
                    </PermissionGate>
                    <PermissionGate permission="read:group">
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px] sm:flex-1">
                            <label className="text-sm font-medium">Guruh bo'yicha filtri</label>
                            <Combobox
                                options={groups.map(g => ({ value: g.id.toString(), label: g.name }))}
                                value={filterGroupId?.toString()}
                                onChange={(val) => onGroupChange(val ? parseInt(val) : undefined)}
                                placeholder="Barcha guruhlar"
                                searchPlaceholder="Guruhni qidirish..."
                            />
                        </div>
                    </PermissionGate>
                    <PermissionGate permission="read:teacher">
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px] sm:flex-1">
                            <label className="text-sm font-medium">O'qituvchi bo'yicha filtri</label>
                            <Combobox
                                options={teachers.map(t => ({ value: (t.employee?.user_id ?? '').toString(), label: t.employee?.full_name ?? '' }))}
                                value={filterUserId?.toString()}
                                onChange={(val) => onUserChange(val ? parseInt(val) : undefined)}
                                placeholder="Barcha o'qituvchilar"
                                searchPlaceholder="O'qituvchini qidirish..."
                            />
                        </div>
                    </PermissionGate>
                    {!hideStatusFilter && (
                        <div className="flex w-full flex-col gap-2 sm:w-[150px]">
                            <label className="text-sm font-medium">Holat</label>
                            <select
                                className={selectClassName}
                                value={filterIsActive === undefined ? 'all' : filterIsActive.toString()}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    onIsActiveChange?.(val === 'all' ? undefined : val === 'true');
                                }}
                            >
                                <option value="all">Barchasi</option>
                                <option value="true">Faol</option>
                                <option value="false">Faol emas</option>
                            </select>
                        </div>
                    )}
                    <div className="flex w-full flex-col gap-2 sm:w-[150px]">
                        <label className="text-sm font-medium">Sana bo'yicha</label>
                        <select
                            className={selectClassName}
                            value={sortDir}
                            onChange={(e) => onSortDirChange(e.target.value as 'desc' | 'asc')}
                        >
                            <option value="desc">Eng yangilari</option>
                            <option value="asc">Eng eskilari</option>
                        </select>
                    </div>
                    {hasActiveFilters && (
                        <Button variant="ghost" onClick={onClearFilters} className="mb-0.5">
                            <X className="mr-2 h-4 w-4" />
                            Tozalash
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
