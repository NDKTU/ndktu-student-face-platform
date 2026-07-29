/**
 * Dashboard.tsx — "Boshqaruv paneli" (admin), rebuilt 1:1 from the NDKTU mockup.
 *
 * - 5 stat cards wired to real counts (Fakultet/Kafedra/Mutaxassislik/Talaba/O'qituvchi).
 * - Faculty-distribution bar chart + recent-activity feed are visual placeholders
 *   (no backend endpoint yet) — swap in real data when an endpoint exists.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Building, List, Users, GraduationCap } from 'lucide-react';
import { facultyService } from '@/services/facultyService';
import { kafedraService } from '@/services/kafedraService';
import { specialityService } from '@/services/specialityService';
import { studentService } from '@/services/studentService';
import { teacherService } from '@/services/teacherService';
import { StatCard } from '@/components/ui/StatCard';

// —— Placeholder data (no endpoint yet) ——
const FACULTY_DIST = [
    { name: 'Konchilik',                 val: 247, pct: '99%',  color: '#2836C7' },
    { name: 'Metallurgiya',              val: 214, pct: '86%',  color: '#B45309' },
    { name: 'Axborot texnologiyalari',   val: 249, pct: '100%', color: '#0E7C86' },
    { name: 'Energetika',                val: 156, pct: '63%',  color: '#157A43' },
    { name: 'Iqtisodiyot va menejment',  val: 204, pct: '82%',  color: '#6D28D9' },
    { name: 'Geologiya va geodeziya',    val: 94,  pct: '38%',  color: '#C4363B' },
];

const ACTIVITY = [
    { text: "Yangi talaba ro'yxatga olindi — DI-24-01 guruhi", meta: '5 daqiqa oldin', tone: '#157A43' },
    { text: "Metallurgiya bo'yicha o'quv reja tasdiqlandi",     meta: '2 soat oldin',   tone: '#2836C7' },
    { text: 'Geodeziya kafedrasiga mudir tayinlandi',           meta: 'Kecha, 16:20',   tone: '#B45309' },
    { text: "Kiberxavfsizlik mutaxassisligi qo'shildi",         meta: '2 kun oldin',    tone: '#6D28D9' },
];

const Dashboard: React.FC = () => {
    const { data: faculties,   isLoading: lF } = useQuery({ queryKey: ['dash-faculties'],   queryFn: () => facultyService.getFaculties(1, 1) });
    const { data: kafedras,    isLoading: lK } = useQuery({ queryKey: ['dash-kafedras'],    queryFn: () => kafedraService.getKafedras(1, 1) });
    const { data: specialities,isLoading: lS } = useQuery({ queryKey: ['dash-specialities'],queryFn: () => specialityService.getSpecialities(1, 1) });
    const { data: students,    isLoading: lStu } = useQuery({ queryKey: ['dash-students'],  queryFn: () => studentService.getStudents(1, 1) });
    const { data: teachers,    isLoading: lT } = useQuery({ queryKey: ['dash-teachers'],    queryFn: () => teacherService.getTeachers(1, 1) });

    return (
        <div className="mx-auto max-w-[1280px] space-y-[22px]">
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-[25px] font-extrabold tracking-[-0.025em] text-foreground">Boshqaruv paneli</h1>
                    <p className="mt-1.5 text-sm text-[color:var(--text-body)]">
                        NDKTU o'quv boshqaruv tizimi — umumiy koʻrsatkichlar
                    </p>
                </div>
                <span className="rounded-[10px] border border-border bg-card px-[13px] py-2 text-[12.5px] font-semibold text-[color:var(--text-body)]">
                    2025–2026 oʻquv yili
                </span>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
                <StatCard label="Fakultet"      value={faculties?.total ?? 0}    icon={Building2}     color="blue"   isLoading={lF} />
                <StatCard label="Kafedra"       value={kafedras?.total ?? 0}     icon={Building}      color="cyan"   isLoading={lK} />
                <StatCard label="Mutaxassislik" value={specialities?.total ?? 0} icon={List}          color="purple" isLoading={lS} />
                <StatCard label="Talaba"        value={students?.total ?? 0}     icon={Users}         color="green"  isLoading={lStu} />
                <StatCard label="O'qituvchi"    value={teachers?.total ?? 0}     icon={GraduationCap} color="orange" isLoading={lT} />
            </div>

            {/* Distribution + activity */}
            <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.4fr_1fr]">
                {/* Faculty distribution (placeholder) */}
                <div className="rounded-[16px] border border-border bg-card p-[22px] shadow-card">
                    <div className="mb-[18px] flex items-center justify-between">
                        <h3 className="text-base font-bold text-foreground">Fakultetlar boʻyicha talabalar</h3>
                    </div>
                    <div className="flex flex-col gap-[15px]">
                        {FACULTY_DIST.map((f) => (
                            <div key={f.name}>
                                <div className="mb-1.5 flex justify-between text-[13px]">
                                    <span className="font-semibold text-[color:var(--text-body)]">{f.name}</span>
                                    <span className="font-bold text-foreground">{f.val}</span>
                                </div>
                                <div className="h-[9px] overflow-hidden rounded-[6px] bg-[#F0F1F7]">
                                    <div className="h-full rounded-[6px] transition-[width] duration-500" style={{ width: f.pct, background: f.color }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recent activity (placeholder) */}
                <div className="rounded-[16px] border border-border bg-card p-[22px] shadow-card">
                    <h3 className="mb-4 text-base font-bold text-foreground">Soʻnggi faoliyat</h3>
                    <div className="flex flex-col gap-0.5">
                        {ACTIVITY.map((a, i) => (
                            <div key={i} className="flex gap-3 border-b border-[#F4F5FA] py-[11px] last:border-0">
                                <span className="mt-[5px] h-[9px] w-[9px] flex-none rounded-full" style={{ background: a.tone }} />
                                <div>
                                    <div className="text-[13px] font-semibold leading-[1.4] text-foreground">{a.text}</div>
                                    <div className="mt-0.5 text-[11.5px] text-[color:var(--text-label)]">{a.meta}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
