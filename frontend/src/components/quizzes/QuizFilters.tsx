import { Card, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Combobox } from '@/components/ui/Combobox';
import { Button } from '@/components/ui/Button';
import { X } from 'lucide-react';
import PermissionGate from '@/components/auth/PermissionGate';
import type { TeacherOption } from '@/services/teacherService';
import type { Faculty } from '@/services/facultyService';
import { useTranslation } from 'react-i18next';

interface QuizFiltersProps {
    /** Guruhlar — qidiruv serverda (`useGroupFilter`). */
    groupOptions: { value: string; label: string }[];
    onGroupSearchChange: (query: string) => void;
    teachers: TeacherOption[];
    /** Фильтр по факультету — только на странице со сплошным списком тестов. */
    faculties?: Faculty[];
    filterFacultyId?: number | undefined;
    onFacultyChange?: (id: number | undefined) => void;
    filterSubjectId: number | undefined;
    onSubjectChange: (id: number | undefined) => void;
    /** Fanlar 3254 ta — bir sahifaga sig'maydi: qidiruv serverda
     *  (`useSubjectFilter`), ro'yxatda faqat natija va tanlangan fan. */
    subjectOptions: { value: string; label: string }[];
    onSubjectSearchChange: (query: string) => void;
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

export const QuizFilters = ({
    groupOptions,
    onGroupSearchChange,
    teachers,
    faculties,
    filterFacultyId,
    onFacultyChange,
    filterSubjectId,
    onSubjectChange,
    subjectOptions,
    onSubjectSearchChange,
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
    const { t } = useTranslation();
    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex flex-wrap gap-4 items-end">
                    {faculties && onFacultyChange && (
                        <PermissionGate permission="read:faculty">
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px] sm:flex-1">
                                <label className="text-sm font-medium">{t("Fakultet bo'yicha filtri")}</label>
                                <Combobox
                                    options={faculties.map(f => ({ value: f.id.toString(), label: f.name }))}
                                    value={filterFacultyId?.toString()}
                                    onChange={(val) => onFacultyChange(val ? parseInt(val) : undefined)}
                                    placeholder={t("Barcha fakultetlar")}
                                    searchPlaceholder="Fakultetni qidirish..."
                                />
                            </div>
                        </PermissionGate>
                    )}
                    <PermissionGate permission="read:subject">
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px] sm:flex-1">
                            <label className="text-sm font-medium">{t("Fan bo'yicha filtri")}</label>
                            <Combobox
                                options={subjectOptions}
                                value={filterSubjectId?.toString()}
                                onSearchChange={onSubjectSearchChange}
                                onChange={(val) => onSubjectChange(val ? parseInt(val) : undefined)}
                                placeholder={t("Barcha fanlar")}
                                searchPlaceholder="Fanni qidirish..."
                            />
                        </div>
                    </PermissionGate>
                    <PermissionGate permission="read:group">
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px] sm:flex-1">
                            <label className="text-sm font-medium">{t("Guruh bo'yicha filtri")}</label>
                            <Combobox
                                options={groupOptions}
                                onSearchChange={onGroupSearchChange}
                                value={filterGroupId?.toString()}
                                onChange={(val) => onGroupChange(val ? parseInt(val) : undefined)}
                                placeholder={t("Barcha guruhlar")}
                                searchPlaceholder="Guruhni qidirish..."
                            />
                        </div>
                    </PermissionGate>
                    <PermissionGate permission="read:teacher">
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px] sm:flex-1">
                            <label className="text-sm font-medium">{t("O'qituvchi bo'yicha filtri")}</label>
                            <Combobox
                                options={teachers.map(t => ({ value: (t?.user_id ?? '').toString(), label: t?.full_name ?? '' }))}
                                value={filterUserId?.toString()}
                                onChange={(val) => onUserChange(val ? parseInt(val) : undefined)}
                                placeholder={t("Barcha o'qituvchilar")}
                                searchPlaceholder="O'qituvchini qidirish..."
                            />
                        </div>
                    </PermissionGate>
                    {!hideStatusFilter && (
                        <div className="flex w-full flex-col gap-2 sm:w-[150px]">
                            <label className="text-sm font-medium">{t('Holat')}</label>
                            <Select
                                value={filterIsActive === undefined ? 'all' : filterIsActive.toString()}
                                onChange={(next) => onIsActiveChange?.(next === 'all' ? undefined : next === 'true')}
                                ariaLabel={t('Holat')}
                                options={[
                                    { value: 'all', label: t('Barchasi') },
                                    { value: 'true', label: t('Faol') },
                                    { value: 'false', label: t('Faol emas') },
                                ]}
                            />
                        </div>
                    )}
                    <div className="flex w-full flex-col gap-2 sm:w-[150px]">
                        <label className="text-sm font-medium">{t("Sana bo'yicha")}</label>
                        <Select
                            value={sortDir}
                            onChange={(next) => onSortDirChange(next as 'desc' | 'asc')}
                            ariaLabel={t("Sana bo'yicha")}
                            options={[
                                { value: 'desc', label: t('Eng yangilari') },
                                { value: 'asc', label: t('Eng eskilari') },
                            ]}
                        />
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
