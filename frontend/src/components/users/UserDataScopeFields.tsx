import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Combobox } from '@/components/ui/Combobox';
import { useFaculties, useKafedras } from '@/hooks/useReferenceData';
import { useGroups } from '@/hooks/useGroups';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { DataScope } from '@/services/roleService';
import type { DataScopeTarget, UserDataScope } from '@/services/userService';

/**
 * Foydalanuvchining ko'rish doirasi: aynan qaysi fakultet, kafedra yoki guruh.
 *
 * Doira TURI rolda (`RolesPage`), bu yerda esa uning qiymati. Faqat tanlangan
 * rollar talab qiladigan maydonlar ko'rsatiladi: rol `faculty` bo'lsa —
 * fakultetlar va hokazo. Mos kelmagan biriktirma backendda baribir e'tiborga
 * olinmaydi (`core/utils/data_scope.py`).
 */
export const UserDataScopeFields = ({
    scopes,
    value,
    onChange,
}: {
    scopes: Set<DataScope>;
    value: UserDataScope;
    onChange: (next: UserDataScope) => void;
}) => {
    const { t } = useTranslation();
    const [groupQuery, setGroupQuery] = useState('');
    const debouncedGroupQuery = useDebouncedValue(groupQuery);

    const showFaculties = scopes.has('faculty');
    const showKafedras = scopes.has('kafedra');
    const showGroups = scopes.has('assigned_groups');

    const { data: facultiesData } = useFaculties(1, 100, undefined, showFaculties);
    const { data: kafedrasData } = useKafedras(1, 100, undefined, undefined, showKafedras);
    // Guruhlar ko'p (~700) — qidiruv serverda.
    const { data: groupsData } = useGroups(1, 30, debouncedGroupQuery, undefined, undefined, showGroups);

    const facultyOptions = useMemo(
        () => (facultiesData?.faculties ?? []).map((f) => ({ value: String(f.id), label: f.name })),
        [facultiesData],
    );
    const kafedraOptions = useMemo(
        () => (kafedrasData?.kafedras ?? []).map((k) => ({ value: String(k.id), label: k.name })),
        [kafedrasData],
    );
    const groupOptions = useMemo(
        () => (groupsData?.groups ?? []).map((g) => ({ value: String(g.id), label: g.name })),
        [groupsData],
    );

    if (!showFaculties && !showKafedras && !showGroups) return null;

    const add = (key: keyof UserDataScope, options: { value: string; label: string }[], id: string) => {
        const option = options.find((o) => o.value === id);
        if (!option || value[key].some((item) => String(item.id) === id)) return;
        onChange({ ...value, [key]: [...value[key], { id: Number(id), name: option.label }] });
    };

    const remove = (key: keyof UserDataScope, id: number) => {
        onChange({ ...value, [key]: value[key].filter((item) => item.id !== id) });
    };

    const section = (
        key: keyof UserDataScope,
        label: string,
        options: { value: string; label: string }[],
        onSearchChange?: (query: string) => void,
    ) => (
        <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{label}</label>
            <Combobox
                options={options}
                value=""
                onChange={(id) => id && add(key, options, id)}
                onSearchChange={onSearchChange}
                placeholder={t("Qo'shish...")}
            />
            <Chips items={value[key]} onRemove={(id) => remove(key, id)} />
        </div>
    );

    return (
        <div className="space-y-3 rounded-xl border border-border bg-card p-3">
            <div>
                <p className="text-sm font-medium">{t("Ko'rish doirasi")}</p>
                <p className="text-xs text-muted-foreground">
                    {t("Foydalanuvchi faqat shu bo'linmalarning talabalari va natijalarini ko'radi.")}
                </p>
            </div>
            {showFaculties && section('faculties', t('Fakultetlar'), facultyOptions)}
            {showKafedras && section('kafedras', t('Kafedralar'), kafedraOptions)}
            {showGroups && section('groups', t('Guruhlar'), groupOptions, setGroupQuery)}
        </div>
    );
};

const Chips = ({ items, onRemove }: { items: DataScopeTarget[]; onRemove: (id: number) => void }) => {
    const { t } = useTranslation();
    if (items.length === 0) {
        return <p className="text-xs text-muted-foreground">{t('Tanlanmagan — hech kim ko\'rinmaydi')}</p>;
    }
    return (
        <div className="flex flex-wrap gap-1.5">
            {items.map((item) => (
                <span
                    key={item.id}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary"
                >
                    {item.name}
                    <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        className="rounded-full p-0.5 hover:bg-primary/20"
                        aria-label={t("O'chirish")}
                    >
                        <X className="h-3 w-3" />
                    </button>
                </span>
            ))}
        </div>
    );
};
