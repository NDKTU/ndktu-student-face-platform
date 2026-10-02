import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
    useAddSubjectUsers,
    useGroupOptions,
    useSubjectCandidates,
    useSubjectFilterOptions,
} from '@/hooks/useGeneralTests';
import type { UserFilter, UserKindFilter } from '@/services/generalTestService';
import { apiErrorMessage } from '@/utils/apiError';
import { KIND_LABEL, selectClassName } from './labels';

const PAGE_SIZE = 20;
const COURSES = [1, 2, 3, 4, 5, 6];

interface Props {
    subjectId: number;
    subjectName: string;
    onClose: () => void;
}

/**
 * Fanga foydalanuvchi biriktirish. Ro'yxat — tizimdagi barcha faol
 * foydalanuvchilar, o'qituvchilar bilan cheklanmaydi: talabani turi, guruhi,
 * kursi yoki fakulteti bo'yicha topib qo'shish mumkin.
 *
 * Ikki yo'l: belgilanganlarni qo'shish yoki filtrga mos hammasini bir
 * bosishda qo'shish (masalan, bitta guruhning barcha talabalari).
 */
export function SubjectUserPickerModal({ subjectId, subjectName, onClose }: Props) {
    const [search, setSearch] = useState('');
    const [kind, setKind] = useState<UserKindFilter | ''>('');
    const [roleId, setRoleId] = useState('');
    const [facultyId, setFacultyId] = useState('');
    const [course, setCourse] = useState('');
    const [groupId, setGroupId] = useState('');
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [confirmAll, setConfirmAll] = useState(false);
    const debounced = useDebouncedValue(search);

    const filter: UserFilter = {
        search: debounced || undefined,
        kind: kind || undefined,
        role_id: roleId ? Number(roleId) : undefined,
        faculty_id: facultyId ? Number(facultyId) : undefined,
        course: course ? Number(course) : undefined,
        group_id: groupId ? Number(groupId) : undefined,
    };
    const { data, isLoading, isError, refetch, isFetching } = useSubjectCandidates(subjectId, {
        ...filter,
        page,
        limit: PAGE_SIZE,
    });
    const { data: options } = useSubjectFilterOptions();
    const { data: groups } = useGroupOptions({
        faculty_id: filter.faculty_id,
        course: filter.course,
        limit: 200,
    });
    const addUsers = useAddSubjectUsers(subjectId);

    const groupOptions = useMemo(
        () => (groups ?? []).map((g) => ({ value: String(g.id), label: g.name, hint: g.faculty_name ?? undefined })),
        [groups],
    );

    // Filtr o'zgarsa, birinchi sahifaga qaytiladi va «hammasini qo'shish»
    // tasdig'i bekor bo'ladi: tasdiqlangan son endi boshqa.
    const changeFilter = <T,>(setter: (value: T) => void) => (value: T) => {
        setter(value);
        setPage(1);
        setConfirmAll(false);
    };

    const toggle = (userId: number) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });

    const pageIds = (data?.users ?? []).filter((u) => !u.assigned).map((u) => u.user_id);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    const togglePage = () =>
        setSelected((prev) => {
            const next = new Set(prev);
            for (const id of pageIds) {
                if (allPageSelected) next.delete(id);
                else next.add(id);
            }
            return next;
        });

    const submit = (body: { user_ids?: number[]; filter?: UserFilter }) =>
        addUsers.mutate(body, {
            onSuccess: (res) => {
                toast.success(res.added ? `${res.added} ta foydalanuvchi biriktirildi` : 'Hammasi allaqachon biriktirilgan');
                setSelected(new Set());
                setConfirmAll(false);
            },
            onError: (e) => toast.error(apiErrorMessage(e, 'Biriktirishda xatolik')),
        });

    const total = data?.total ?? 0;

    return (
        <Modal isOpen onClose={onClose} title={`«${subjectName}» faniga foydalanuvchi biriktirish`} className="md:max-w-3xl">
            <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <Input
                        placeholder="F.I.SH, login yoki guruh..."
                        value={search}
                        onChange={(e) => changeFilter(setSearch)(e.target.value)}
                        leftAddon={<Search className="h-4 w-4" />}
                        className="sm:col-span-2 lg:col-span-3"
                    />
                    <select
                        aria-label="Foydalanuvchi turi"
                        className={selectClassName}
                        value={kind}
                        onChange={(e) => changeFilter(setKind)(e.target.value as UserKindFilter | '')}
                    >
                        <option value="">Barcha turlar</option>
                        <option value="student">Talabalar</option>
                        <option value="teacher">O'qituvchilar</option>
                        <option value="other">Boshqa xodimlar</option>
                    </select>
                    <select
                        aria-label="Rol"
                        className={selectClassName}
                        value={roleId}
                        onChange={(e) => changeFilter(setRoleId)(e.target.value)}
                    >
                        <option value="">Barcha rollar</option>
                        {options?.roles.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.name}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label="Fakultet"
                        className={selectClassName}
                        value={facultyId}
                        onChange={(e) => {
                            changeFilter(setFacultyId)(e.target.value);
                            setGroupId('');
                        }}
                    >
                        <option value="">Barcha fakultetlar</option>
                        {options?.faculties.map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.name}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label="Kurs"
                        className={selectClassName}
                        value={course}
                        onChange={(e) => {
                            changeFilter(setCourse)(e.target.value);
                            setGroupId('');
                        }}
                    >
                        <option value="">Barcha kurslar</option>
                        {COURSES.map((c) => (
                            <option key={c} value={c}>
                                {c}-kurs
                            </option>
                        ))}
                    </select>
                    <div className="sm:col-span-2">
                        <Combobox
                            options={groupOptions}
                            value={groupId}
                            onChange={changeFilter(setGroupId)}
                            placeholder="Barcha guruhlar"
                            searchPlaceholder="Guruhni qidirish..."
                        />
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-muted-foreground">
                        <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={allPageSelected}
                            disabled={pageIds.length === 0}
                            onChange={togglePage}
                        />
                        Sahifadagilarni belgilash
                    </label>
                    <span className="text-muted-foreground">Topildi: {total} ta</span>
                </div>

                {isLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 5 }, (_, i) => (
                            <Skeleton key={i} className="h-12 w-full rounded-lg" />
                        ))}
                    </div>
                ) : isError ? (
                    <ErrorState onRetry={() => refetch()} />
                ) : !data?.users.length ? (
                    <EmptyState icon={<Users className="h-6 w-6" />} title="Foydalanuvchi topilmadi" description="Filtrni o'zgartirib ko'ring." />
                ) : (
                    <ul className={`divide-y divide-border rounded-xl border border-border ${isFetching ? 'opacity-60' : ''}`}>
                        {data.users.map((u) => (
                            <li key={u.user_id}>
                                <label
                                    className={`flex items-center gap-3 px-3 py-2.5 ${
                                        u.assigned ? 'opacity-60' : 'cursor-pointer hover:bg-accent/40'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 shrink-0"
                                        checked={u.assigned || selected.has(u.user_id)}
                                        disabled={u.assigned}
                                        onChange={() => toggle(u.user_id)}
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-foreground">{u.full_name}</span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {KIND_LABEL[u.user_kind]}
                                            {u.group_name ? ` · ${u.group_name}` : ''}
                                            {u.username ? ` · ${u.username}` : ''}
                                        </span>
                                    </span>
                                    {u.assigned && (
                                        <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                            Biriktirilgan
                                        </span>
                                    )}
                                </label>
                            </li>
                        ))}
                    </ul>
                )}

                {total > PAGE_SIZE && (
                    <Pagination
                        currentPage={page}
                        totalPages={Math.ceil(total / PAGE_SIZE)}
                        onPageChange={setPage}
                        totalItems={total}
                        pageSize={PAGE_SIZE}
                    />
                )}

                <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                    {confirmAll ? (
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-foreground">Filtrga mos {total} ta foydalanuvchi biriktirilsinmi?</span>
                            <Button size="sm" isLoading={addUsers.isPending} onClick={() => submit({ filter })}>
                                Ha, biriktirish
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmAll(false)}>
                                Yo'q
                            </Button>
                        </div>
                    ) : (
                        <Button variant="outline" disabled={total === 0} onClick={() => setConfirmAll(true)}>
                            <Users className="h-4 w-4" /> Filtrga mos hammasi ({total})
                        </Button>
                    )}
                    <div className="flex gap-2 sm:justify-end">
                        <Button variant="ghost" onClick={onClose}>
                            Yopish
                        </Button>
                        <Button
                            disabled={selected.size === 0}
                            isLoading={addUsers.isPending && !confirmAll}
                            onClick={() => submit({ user_ids: [...selected] })}
                        >
                            <UserPlus className="h-4 w-4" /> Biriktirish ({selected.size})
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
