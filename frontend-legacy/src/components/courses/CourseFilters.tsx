import { Card, CardContent } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { Button } from '@/components/ui/Button';
import { X } from 'lucide-react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import type { Subject } from '@/services/subjectService';
import type { Group } from '@/services/groupService';
import type { Teacher } from '@/services/teacherService';

interface CourseFiltersProps {
    subjects: Subject[];
    groups: Group[];
    teachers: Teacher[];
    filterSubjectId: number | undefined;
    onSubjectChange: (id: number | undefined) => void;
    filterGroupId: number | undefined;
    onGroupChange: (id: number | undefined) => void;
    filterTeacherId: number | undefined;
    onTeacherChange: (id: number | undefined) => void;
    filterSemesterNumber: number | undefined;
    onSemesterChange: (val: number | undefined) => void;
    hasActiveFilters: boolean;
    onClearFilters: () => void;
}

const selectClassName =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export const CourseFilters = ({
    subjects,
    groups,
    teachers,
    filterSubjectId,
    onSubjectChange,
    filterGroupId,
    onGroupChange,
    filterTeacherId,
    onTeacherChange,
    filterSemesterNumber,
    onSemesterChange,
    hasActiveFilters,
    onClearFilters,
}: CourseFiltersProps) => {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex flex-wrap gap-4 items-end">
                    <PermissionGate permission="read:subject">
                        <div className="flex flex-col gap-2 min-w-[200px] flex-1">
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
                    <PermissionGate permission="read:teacher">
                        <div className="flex flex-col gap-2 min-w-[200px] flex-1">
                            <label className="text-sm font-medium">O'qituvchi bo'yicha filtri</label>
                            <Combobox
                                options={teachers.map(t => ({ value: (t.employee?.user_id ?? '').toString(), label: t.employee?.full_name ?? '' }))}
                                value={filterTeacherId?.toString()}
                                onChange={(val) => onTeacherChange(val ? parseInt(val) : undefined)}
                                placeholder="Barcha o'qituvchilar"
                                searchPlaceholder="O'qituvchini qidirish..."
                            />
                        </div>
                    </PermissionGate>
                    <PermissionGate permission="read:group">
                        <div className="flex flex-col gap-2 min-w-[200px] flex-1">
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
                    <div className="flex flex-col gap-2 w-[150px]">
                        <label className="text-sm font-medium">Semestr</label>
                        <select
                            className={selectClassName}
                            value={filterSemesterNumber === undefined ? 'all' : filterSemesterNumber.toString()}
                            onChange={(e) => {
                                const val = e.target.value;
                                onSemesterChange(val === 'all' ? undefined : parseInt(val));
                            }}
                        >
                            <option value="all">Barchasi</option>
                            <option value="1">1-semestr</option>
                            <option value="2">2-semestr</option>
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
