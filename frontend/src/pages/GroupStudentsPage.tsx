import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { OrganizationBreadcrumbs } from '@/components/faculty/OrganizationBreadcrumbs';
import { useGroup, useGroupStudents } from '@/hooks/useGroups';
import { useAttendanceStats } from '@/hooks/useAttendance';
import { usePermission } from '@/components/auth/PermissionGate';
import { initialsOf, tileFor } from '@/lib/avatarTiles';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { hemisOrdinal } from '@/utils/education';
import { formatGpa } from '@/utils/gpa';

const percentColor = (percent: number | null | undefined) => {
    if (percent == null) return 'text-muted-foreground';
    if (percent >= 85) return 'text-emerald-600 dark:text-emerald-400';
    if (percent >= 60) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
};

/**
 * Bitta guruhning talabalari. `read:student` talab qilinmaydi — backend
 * o'qituvchiga faqat o'ziga biriktirilgan guruhni ochadi. To'liq talabalar
 * ro'yxati (`/students`) huquqi borlar uchun o'z joyida qoladi.
 */
const GroupStudentsPage = () => {
    const { t } = useTranslation();
    const { groupId } = useParams<{ groupId: string }>();
    const navigate = useNavigate();
    const id = Number(groupId);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { data: group } = useGroup(id);
    const { data, isLoading, isError, refetch } = useGroupStudents(id, debouncedSearch || undefined);

    const students = data?.students ?? [];
    const total = data?.total ?? 0;

    // Bo'sh ro'yxatning sababi. Ilgari bu yerda hamma holat uchun bitta
    // «talaba yo'q» turardi, holbuki ro'yxatdagi ustun EPOS'ning nol bo'lmagan
    // sonini ko'rsatib turardi: odam 34 ni bosib, bo'sh sahifaga tushar va
    // nima buzilganini bilmasdi. Ikki sabab butunlay boshqacha hal qilinadi,
    // shuning uchun ular ajratib aytiladi.
    const eposCount = group?.student_count ?? 0;
    const hasHemisLink = Boolean(group?.hemis_group_id);
    const emptyReason = !hasHemisLink && eposCount > 0
        ? t(
              "Guruh talabalar HEMIS'i bilan bog'lanmagan (EPOS'da hemis_id yo'q), shuning uchun talabalar "
                  + 'import qilinmaydi. EPOS bu yerda {{n}} ta talaba deb hisoblaydi. Buni EPOS tomonida '
                  + "to'g'rilash kerak — undan keyin oddiy sinxronizatsiya yetadi.",
              { n: eposCount },
          )
        : eposCount > 0
          ? t(
                'HEMIS bu guruh uchun faol talaba qaytarmadi. EPOS {{n}} ta deb hisoblaydi — bu son '
                    + "eskirgan bo'lishi mumkin (bitiruv, chetlatish).",
                { n: eposCount },
            )
          : t("Bu guruhda hozircha talaba yo'q.");

    // Foiz — guruhning barcha darslari bo'yicha (kurs bilan cheklanmagan).
    const canReadAttendance = usePermission('read:attendance');
    const { data: attendance } = useAttendanceStats(
        students.map((s) => s.id),
        { enabled: canReadAttendance }
    );
    const attendanceById = useMemo(
        () => new Map((attendance ?? []).map((row) => [row.student_id, row])),
        [attendance]
    );

    // HEMIS «1-kurs» / «1-semestr» deb yozadi; ruscha interfeysda bu yozuvlar
    // tarjima qilinadi, tanimagan shakl o'z holicha qoladi.
    const ordinalLabel = (value?: string | null) => {
        const parsed = hemisOrdinal(value);
        return parsed ? t(parsed.key, { n: parsed.n }) : value || '—';
    };

    return (
        <div className="space-y-5">
            <OrganizationBreadcrumbs
                items={[
                    { label: t('Guruhlar'), onClick: () => navigate('/groups') },
                    { label: group?.name || t('Guruh #{{id}}', { id }) },
                ]}
                title={group?.name || t('Guruh #{{id}}', { id })}
                description={t("Guruhga biriktirilgan talabalar ro'yxati")}
            />

            <div className="flex flex-wrap items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => navigate('/groups')}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    {t('Orqaga')}
                </Button>
                <div className="w-full sm:w-[300px]">
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={t("F.I.SH yoki talaba ID bo'yicha...")}
                        leftAddon={<Search className="h-4 w-4" />}
                    />
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    <Users className="h-3.5 w-3.5" />
                    {t('{{n}} ta talaba', { n: total })}
                </span>
            </div>

            {isError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : isLoading && !data ? (
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-xl" />
                    ))}
                </div>
            ) : students.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={1}
                        title={t('Talaba topilmadi')}
                        description={debouncedSearch ? t("Qidiruvga mos talaba yo'q.") : emptyReason}
                    />
                </div>
            ) : (
                <Table className="min-w-full border-separate border-spacing-0">
                    <TableHeader className="bg-muted/40">
                        <TableRow className="border-b border-border/80">
                            <TableHead className="w-[50px] text-center font-bold font-mono text-xs">#</TableHead>
                            <TableHead className="font-bold text-xs">{t('Talaba F.I.SH')}</TableHead>
                            <TableHead className="font-bold text-xs hidden md:table-cell">{t('Talaba ID')}</TableHead>
                            <TableHead className="font-bold text-xs hidden lg:table-cell">{t('Kurs / semestr')}</TableHead>
                            {canReadAttendance && (
                                <TableHead className="text-right font-bold text-xs">{t('Davomat')}</TableHead>
                            )}
                            <TableHead className="text-right font-bold text-xs pr-5 hidden lg:table-cell">GPA</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {students.map((student, index) => (
                            <TableRow key={student.id} className="border-b border-border/50">
                                <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground">
                                    {index + 1}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={cn(
                                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-xs',
                                                tileFor(student.id)
                                            )}
                                        >
                                            {initialsOf(student.full_name)}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-foreground leading-snug">
                                                {student.full_name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{student.specialty || '—'}</p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                    <span className="font-mono text-xs text-muted-foreground">
                                        {student.student_id_number}
                                    </span>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                    <span className="text-xs text-muted-foreground">
                                        {ordinalLabel(student.level)} / {ordinalLabel(student.semester)}
                                    </span>
                                </TableCell>
                                {canReadAttendance && (
                                    <TableCell className="text-right">
                                        <span
                                            className={cn(
                                                'font-mono text-xs font-semibold',
                                                percentColor(attendanceById.get(student.id)?.percent)
                                            )}
                                        >
                                            {attendanceById.get(student.id)?.percent == null
                                                ? '—'
                                                : `${attendanceById.get(student.id)!.percent}%`}
                                        </span>
                                    </TableCell>
                                )}
                                <TableCell className="text-right pr-5 hidden lg:table-cell">
                                    <span className="font-mono text-xs font-semibold">
                                        {formatGpa(student.avg_gpa)}
                                    </span>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
};

export default GroupStudentsPage;
