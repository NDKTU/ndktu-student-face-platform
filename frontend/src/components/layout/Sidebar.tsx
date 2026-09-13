import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { buildSidebar, type IconTone, type SidebarItem, type SidebarSection } from '@/constants/resources';
import { BRAND } from '@/config/branding';
import logo from '@/assets/logo.png';

/**
 * Ikonka rangi mavzudagi `--stat-*` tokenidan olinadi — to'q rejimda
 * ular avtomatik ochroq variantga almashadi, shuning uchun bu yerda
 * hex yozilmaydi. Rang tokeni CSS o'zgaruvchisi orqali uzatiladi:
 * ikonka `currentColor` bilan chiziladi, plitka esa shu rangning
 * shaffof varianti bilan bo'yaladi.
 */
const toneVar = (tone?: IconTone) => (tone ? `var(--stat-${tone})` : 'var(--sidebar-muted)');

/** Yig'ilgan guruhlar brauzerda eslab qolinadi. */
const COLLAPSED_KEY = 'sidebar:collapsed-groups';
/**
 * Qo'lda ochilgan guruhlar. Ikkinchi ro'yxat kerak, chunki «hech qachon
 * tegilmagan» va «qo'lda ochilgan» holatlar farqlanishi shart: birinchisida
 * faol sahifani ko'rsatish uchun guruh o'zi ochiladi, ikkinchisida esa
 * foydalanuvchi qarori ustun turadi.
 */
const EXPANDED_KEY = 'sidebar:expanded-groups';

const readSet = (key: string): Set<string> => {
    try {
        const raw = localStorage.getItem(key);
        return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
        return new Set();
    }
};

/** Punkt yoki uning bolalaridan biri shu yo'lga tegishlimi. */
const matchesPath = (item: SidebarItem, pathname: string): boolean =>
    pathname === item.href || pathname.startsWith(item.href + '/');

interface SidebarProps {
    mobileOpen: boolean;
    setMobileOpen: (open: boolean) => void;
}

/** Yakka havola — yuqori darajada ham, guruh ichida ham shu ko'rinishda. */
const SidebarLink = ({
    item,
    isActive,
    onNavigate,
    nested = false,
}: {
    item: SidebarItem;
    isActive: boolean;
    onNavigate: () => void;
    nested?: boolean;
}) => {
    const { t } = useTranslation();
    return (
    <Link
        to={item.href}
        onClick={onNavigate}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
            'group relative flex items-center gap-3 rounded-lg pr-3 text-sm transition-all duration-200',
            nested ? 'h-9 pl-2 text-[13px]' : 'h-11 pl-2',
            isActive
                ? 'bg-sidebar-active text-sidebar-accent font-semibold'
                : 'text-sidebar-foreground font-medium hover:bg-accent'
        )}
    >
        <span
            className={cn(
                'flex shrink-0 items-center justify-center rounded-lg transition-all duration-200',
                nested ? 'h-7 w-7' : 'h-8 w-8',
                'group-hover:scale-105'
            )}
            style={{
                color: toneVar(item.tone),
                // Rang plitka foni sifatida — shaffofligi bilan yumshatiladi.
                backgroundColor: `color-mix(in srgb, ${toneVar(item.tone)} 14%, transparent)`,
            }}
        >
            <item.icon className={nested ? 'h-[15px] w-[15px]' : 'h-[17px] w-[17px]'} />
        </span>
        <span className="truncate">{t(item.name)}</span>
        {isActive && (
            <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-primary" />
        )}
    </Link>
    );
};

/** EduDash sidebar; menu permissions and saved groups stay data-driven. */
const Sidebar = ({ mobileOpen, setMobileOpen }: SidebarProps) => {
    const location = useLocation();
    const { t } = useTranslation();
    const { user, permissions, activeRole } = useAuth();

    const [query, setQuery] = useState('');
    const [collapsed, setCollapsed] = useState<Set<string>>(() => readSet(COLLAPSED_KEY));
    const [expanded, setExpanded] = useState<Set<string>>(() => readSet(EXPANDED_KEY));
    const searchRef = useRef<HTMLInputElement>(null);

    const allSections = useMemo(() => {
        // Ko'rinish tanlangan bo'lsa — faqat o'sha rol, aks holda barchasi.
        const roleNames = (activeRole ? [activeRole] : (user?.roles ?? [])).map((r) => r.name);
        return buildSidebar(permissions, roleNames);
    }, [user, permissions, activeRole]);

    // Faol bo'lim — yo'lga eng aniq mos keladigani (guruh bolalari ham hisobga olinadi).
    const activeHref = useMemo(() => {
        const candidates = allSections
            .flatMap((section) => section.items)
            .flatMap((item) => (item.children ? [item, ...item.children] : [item]))
            .filter((item) => matchesPath(item, location.pathname))
            .sort((a, b) => b.href.length - a.href.length);
        return candidates[0]?.href;
    }, [allSections, location.pathname]);

    // Qidiruv: bo'lim va guruhlar bo'ylab filtr. Mos kelgan guruh to'liq ochiladi.
    const sections = useMemo<SidebarSection[]>(() => {
        const q = query.trim().toLowerCase();
        if (!q) return allSections;

        const hit = (name: string) => t(name).toLowerCase().includes(q);
        const result: SidebarSection[] = [];
        for (const section of allSections) {
            const items: SidebarItem[] = [];
            for (const item of section.items) {
                if (!item.children) {
                    if (hit(item.name)) items.push(item);
                    continue;
                }
                if (hit(item.name)) {
                    items.push(item);
                    continue;
                }
                const kids = item.children.filter((kid) => hit(kid.name));
                if (kids.length) items.push({ ...item, children: kids });
            }
            if (items.length) result.push({ label: section.label, items });
        }
        return result;
    }, [allSections, query, t]);

    // Yig'ilgan/ochilgan holatni saqlash.
    useEffect(() => {
        try {
            localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
            localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
        } catch {
            // Shaxsiy rejimda yozib bo'lmasligi mumkin — bu holat muhim emas.
        }
    }, [collapsed, expanded]);

    // Drawer ochiq bo'lsa: Escape yopadi, fon esa scroll qilinmaydi.
    // Telefonda fon scroll qulflanmasa, menyu ustidan sahifa surilib ketadi
    // va yopilgandan keyin foydalanuvchi boshqa joyda turadi.
    useEffect(() => {
        if (!mobileOpen) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMobileOpen(false);
        };
        window.addEventListener('keydown', onKey);

        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
    }, [mobileOpen, setMobileOpen]);

    // ⌘K / Ctrl+K — qidiruvga fokus.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                searchRef.current?.focus();
                searchRef.current?.select();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    /**
     * Guruhni ochish/yopish. Har ikki ro'yxat birga yangilanadi, shunda
     * «qo'lda yopilgan» holat faol bola bo'lsa ham kuchda qoladi.
     */
    const toggleGroup = (name: string, isOpen: boolean) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (isOpen) next.add(name);
            else next.delete(name);
            return next;
        });
        setExpanded((prev) => {
            const next = new Set(prev);
            if (isOpen) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    return (
        <>
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity md:hidden"
                    onClick={() => setMobileOpen(false)}
                    aria-hidden="true"
                />
            )}

            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-50 flex h-dvh w-[var(--sidebar-width)] max-w-[85vw] shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-in-out',
                    'md:static md:inset-auto md:h-auto md:self-stretch',
                    mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
                )}
            >
                {/* Brand Logo Header */}
                <div className="flex h-[var(--navbar-height)] shrink-0 items-center justify-between border-b border-border px-5">
                    <Link to="/" className="flex items-center gap-3 overflow-hidden group">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent p-1 transition-all duration-200 group-hover:scale-105">
                            <img src={logo} alt={BRAND.shortName} className="h-full w-full object-contain" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[13px] font-bold leading-tight text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                                {BRAND.appName}
                            </span>
                            <span className="text-[11px] font-medium text-muted-foreground">
                                {BRAND.shortName} LMS
                            </span>
                        </div>
                    </Link>
                    <button
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 md:hidden"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Yopish"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Foydalanuvchi kartasi bu yerdan olib tashlangan: o'sha
                    ma'lumot yuqori o'ng burchakdagi profil tugmasida bor va
                    ikki joyda takrorlanishi shart emas. */}

                {/* Menyu bo'ylab qidiruv */}
                <div className="shrink-0 p-3 pb-0">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            id="sidebar-search"
                            ref={searchRef}
                            // `search` — bu maydon hisob ma'lumoti emas. `text` da
                            // brauzerning parol menejeri uni login maydoni deb o'ylab,
                            // saqlangan foydalanuvchi nomini o'zi qo'yib qo'yardi.
                            // `name` ham ataylab «search»: to'ldirish evristikasi
                            // aynan shu nomga qarab qaror qiladi.
                            type="search"
                            name="search"
                            autoComplete="off"
                            // Parol menejerlari (1Password, LastPass) `autoComplete`
                            // ni e'tiborsiz qoldiradi va o'z atributlariga qaraydi.
                            data-1p-ignore
                            data-lpignore="true"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
                            placeholder={t('Menyudan qidirish')}
                            aria-label={t('Menyudan qidirish')}
                            className="h-9 w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 text-[13px] font-medium text-foreground placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                        />
                    </div>
                </div>

                {/* Navigation Menu */}
                <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                    <nav className="flex flex-col gap-6 px-3">
                        {sections.map((section) => (
                            <div key={section.label} className="flex flex-col">
                                <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted">
                                    {t(section.label)}
                                </p>
                                <div className="flex flex-col gap-1.5">
                                    {section.items.map((item) => {
                                        if (!item.children) {
                                            return (
                                                <SidebarLink
                                                    key={item.href}
                                                    item={item}
                                                    isActive={item.href === activeHref}
                                                    onNavigate={() => setMobileOpen(false)}
                                                />
                                            );
                                        }

                                        // Ichida faol sahifa bor guruh o'zi ochiladi, lekin
                                        // foydalanuvchi uni qo'lda yopa oladi — yopiq holatda
                                        // ham bosh tugma faol ko'rinishda qolaveradi.
                                        // Qidiruv paytida esa natija ko'rinishi uchun ochiq.
                                        const hasActiveChild = item.children.some((kid) => kid.href === activeHref);
                                        const isOpen =
                                            query.trim() !== '' ||
                                            expanded.has(item.name) ||
                                            !collapsed.has(item.name);

                                        return (
                                            <div key={item.name} className="flex flex-col">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGroup(item.name, isOpen)}
                                                    aria-expanded={isOpen}
                                                    className={cn(
                                                        'group relative flex h-11 w-full items-center gap-3 rounded-lg pl-2 pr-3 text-sm transition-all duration-200',
                                                        hasActiveChild
                                                            ? 'bg-accent text-sidebar-accent font-semibold'
                                                            : 'text-sidebar-foreground font-medium hover:bg-accent'
                                                    )}
                                                >
                                                    <span
                                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 group-hover:scale-105"
                                                        style={{
                                                            color: toneVar(item.tone),
                                                            backgroundColor: `color-mix(in srgb, ${toneVar(item.tone)} 14%, transparent)`,
                                                        }}
                                                    >
                                                        <item.icon className="h-[17px] w-[17px]" />
                                                    </span>
                                                    <span className="truncate">{t(item.name)}</span>
                                                    <ChevronRight className={cn(
                                                        'ml-auto h-4 w-4 shrink-0 text-sidebar-muted transition-transform duration-200',
                                                        isOpen && 'rotate-90'
                                                    )} />
                                                </button>

                                                {isOpen && (
                                                    <div className="mt-1 flex flex-col gap-1 border-l border-border pl-3 ml-5">
                                                        {item.children.map((kid) => (
                                                            <SidebarLink
                                                                key={kid.href}
                                                                item={kid}
                                                                isActive={kid.href === activeHref}
                                                                onNavigate={() => setMobileOpen(false)}
                                                                nested
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        {sections.length === 0 && (
                            <p className="px-3 text-[13px] text-muted-foreground">
                                {t('Hech narsa topilmadi')}
                            </p>
                        )}
                    </nav>
                </div>



            </aside>
        </>
    );
};

export default Sidebar;

