import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    Loader2, ArrowLeft, RefreshCw, UserCheck, AlertCircle, 
    CheckCircle2, XCircle, Users, GraduationCap, 
    ChevronRight, Info, ShieldCheck, Database, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { hemisService } from '@/services/hemisService';
import { useFaculties } from '@/hooks/useReferenceData';
import { useGroups } from '@/hooks/useGroups';

const HemisSyncPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    
    const login = searchParams.get('login');
    const password = searchParams.get('password');

    // Override State
    const [selectedFacultyId, setSelectedFacultyId] = useState<number | undefined>();
    const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>();
    const [isSyncing, setIsSyncing] = useState(false);
    const [isComplete, setIsComplete] = useState(false);

    // Helper for safe text extraction
    const extractName = (data: any) => {
        if (!data) return '—';
        if (typeof data === 'string') return data;
        if (typeof data === 'object') return data.name || data.title || 'N/A';
        return String(data);
    };

    // 1. Fetch preview data
    const { data: previewData, isLoading: isPreviewLoading, isPending, isError, error: previewError } = useQuery({
        queryKey: ['hemisPreview', login],
        queryFn: async () => {
            const data = await hemisService.previewAdminData({ login: login!, password: password! });
            return data;
        },
        enabled: !!login && !!password,
        retry: false,
    });

    useEffect(() => {
        if (previewData) {
            if (selectedFacultyId === undefined) setSelectedFacultyId(previewData.faculty_id || undefined);
            if (selectedGroupId === undefined) setSelectedGroupId(previewData.group_id || undefined);
        }
    }, [previewData]);

    const { data: facultiesData } = useFaculties(1, 100);
    const { data: groupsData } = useGroups(1, 1000, '', undefined, selectedFacultyId);

    // 2. Sync mutation
    const syncMutation = useMutation({
        mutationFn: () => {
            setIsSyncing(true);
            return hemisService.syncAdminData({ 
                login: login!, 
                password: password!,
                faculty_id: selectedFacultyId,
                group_id: selectedGroupId,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['students'] });
            setIsComplete(true);
            setIsSyncing(false);
            setTimeout(() => navigate('/students'), 2000);
        },
        onError: (err: any) => {
            setIsSyncing(false);
            alert(err?.response?.data?.detail || err?.message || 'Sinxronlashda xatolik');
        }
    });

    if (!login || !password) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
                <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
                    <XCircle className="w-10 h-10 text-destructive" />
                </div>
                <h1 className="text-2xl font-bold mb-2">Noto'g'ri So'rov</h1>
                <p className="text-muted-foreground max-w-sm mb-8">Login yoki parol taqdim etilmagan. Iltimos, talabalar sahifasidan qaytadan urinib ko'ring.</p>
                <Button onClick={() => navigate('/students')} size="lg">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Orqaga Qaytish
                </Button>
            </div>
        );
    }

    if (isPreviewLoading || isPending || isSyncing || isComplete) {
        const title = isComplete ? "Muvaffaqiyatli!" : isSyncing ? "Sinxronlanmoqda..." : "Ma'lumotlar yuklanmoqda...";
        const desc = isComplete ? "Ma'lumotlar saqlandi, yo'naltirilmoqda..." : "Hemis tizimi bilan xavfsiz aloqa o'rnatilmoqda...";
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center -mt-12">
                <div className="relative">
                    {isComplete ? (
                        <div className="w-24 h-24 bg-success/20 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
                             <CheckCircle2 className="w-12 h-12 text-success" />
                        </div>
                    ) : (
                        <>
                            <div className="absolute inset-0 animate-ping rounded-full bg-primary/20 opacity-25"></div>
                            <Loader2 className="w-16 h-16 animate-spin text-primary relative z-10" />
                        </>
                    )}
                </div>
                <h2 className="text-2xl font-bold mt-8 mb-2 tracking-tight">{title}</h2>
                <p className="text-muted-foreground font-medium">{desc}</p>
            </div>
        );
    }

    if (isError || previewError) {
        return (
            <div className="max-w-2xl mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4">
                <Card className="border-destructive/20 shadow-2xl overflow-hidden">
                    <div className="h-1.5 bg-destructive"></div>
                    <CardContent className="p-10 flex flex-col items-center text-center">
                        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
                            <AlertCircle className="w-8 h-8 text-destructive" />
                        </div>
                        <h2 className="text-2xl font-bold mb-3">Yuklashda xatolik yuz berdi</h2>
                        <div className="bg-destructive/5 text-destructive border border-destructive/10 p-4 rounded-xl w-full mb-8 font-mono text-sm">
                            {(previewError as any)?.response?.data?.detail || previewError?.message || 'Noma\'lum xatolik'}
                        </div>
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => navigate('/students')} size="lg">
                                <ArrowLeft className="w-4 h-4 mr-2" /> Orqaga
                            </Button>
                            <Button onClick={() => window.location.reload()} size="lg">
                                <RefreshCw className="w-4 h-4 mr-2" /> Qaytadan Urinish
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const userExists = previewData?.user_exists;
    const facultyExists = previewData?.faculty_exists;
    const groupExists = previewData?.group_exists;
    const existingResults = previewData?.existing_results || [];
    const suggestedGroup = previewData?.suggested_group || 'N/A';
    const hData = previewData?.hemis_data || {};

    return (
        <div className="pb-20 space-y-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b pb-8 bg-background/50 sticky top-0 z-20 backdrop-blur-sm -mx-6 px-6 pt-2">
                <div className="flex items-start gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/students')} className="mt-1 hover:bg-muted">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                             <h1 className="text-3xl font-extrabold tracking-tight">Hemis Sinxronizatsiyasi</h1>
                             <div className="badge badge-primary bg-primary/20 text-primary border border-primary/20">Admin Mode</div>
                        </div>
                        <p className="text-muted-foreground flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-success" /> 
                            Xavfsiz ulanish o'rnatildi. Ma'lumotlarni tasdiqlang.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <Button 
                        onClick={() => syncMutation.mutate()} 
                        disabled={syncMutation.isPending} 
                        size="lg" 
                        className="h-14 px-8 font-bold text-lg shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Zap className="w-5 h-5 mr-2 fill-current" />
                        Sinxronlash va Saqlash
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                {/* Left Panel: Settings */}
                <div className="xl:col-span-3 space-y-6">
                    <Card className="border-primary/20 shadow-xl overflow-hidden sticky top-28">
                        <CardHeader className="bg-primary/5 py-5 border-b">
                            <CardTitle className="text-lg flex items-center gap-2 font-bold tracking-tight">
                                <Zap className="w-5 h-5 text-primary" /> Sinxronlash Sozlamalari
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-3">
                                <label className="text-sm font-bold flex items-center gap-2 text-foreground/80">
                                    <GraduationCap className="w-4 h-4" /> Fakultet Tanlash
                                </label>
                                <select 
                                    className="w-full h-11 px-3 rounded-xl border border-border/60 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all duration-200 cursor-pointer"
                                    value={selectedFacultyId || ''}
                                    onChange={(e) => {
                                        setSelectedFacultyId(Number(e.target.value) || undefined);
                                        setSelectedGroupId(undefined); 
                                    }}
                                >
                                    <option value="">Hemis bo'yicha (avtomatik)</option>
                                    {facultiesData?.faculties?.map((f: any) => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                                {!facultyExists && !selectedFacultyId && (
                                    <div className="flex gap-2 p-3 rounded-lg bg-amber-50/50 border border-amber-200/50 text-[11px] text-amber-700 leading-tight">
                                        <Info className="w-4 h-4 shrink-0" />
                                        <span>Diqqat: Hemisdagi fakultet bazamizda topilmadi. Avtomatik tanlansa, yangi fakultet yaratiladi.</span>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                <label className="text-sm font-bold flex items-center gap-2 text-foreground/80">
                                    <Users className="w-4 h-4" /> Guruh Tanlash
                                </label>
                                <select 
                                    className="w-full h-11 px-3 rounded-xl border border-border/60 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all duration-200 cursor-pointer"
                                    value={selectedGroupId || ''}
                                    onChange={(e) => setSelectedGroupId(Number(e.target.value) || undefined)}
                                >
                                    <option value="">Hemis bo'yicha (avtomatik)</option>
                                    {groupsData?.groups?.map((g: any) => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                                {!groupExists && !selectedGroupId && (
                                    <div className="flex gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10 text-[11px] text-primary leading-tight">
                                        <Info className="w-4 h-4 shrink-0" />
                                        <span>Guruh topilmadi. Avtomatik tanlasangiz, <span className="font-bold">"{suggestedGroup}"</span> nomi bilan yaratiladi.</span>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 border-t">
                               <div className="p-4 rounded-2xl bg-muted/50 border border-dashed flex items-start gap-3">
                                  <Database className="w-5 h-5 text-muted-foreground mt-0.5" />
                                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                                     Override funksiyasi yordamida talabani xohlagan fakultet va guruhga biriktirishingiz mumkin. Nomlar mos kelmasa foydali.
                                  </div>
                               </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content: Comparison */}
                <div className="xl:col-span-9 space-y-8">
                    {/* Status Overview Card */}
                    <Card className="bg-primary/5 border-primary/10 shadow-sm overflow-hidden">
                        <div className="flex flex-col md:flex-row items-center justify-between p-6 gap-6">
                            <div className="flex items-center gap-4">
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${userExists ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                                    {userExists ? <UserCheck className="w-7 h-7" /> : < Zap className="w-7 h-7" />}
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold">Talaba Holati</h3>
                                    <p className="text-sm text-muted-foreground">Local bazadagi mavjudlik holati</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold opacity-70">Xulosa:</span>
                                {userExists ? (
                                    <div className="badge border border-blue-200 bg-blue-50 text-blue-700 px-4 py-1.5 text-sm font-bold shadow-sm">
                                        <CheckCircle2 className="w-4 h-4 mr-2" /> MA'LUMOTLAR YANGILANADI
                                    </div>
                                ) : (
                                    <div className="badge border border-amber-200 bg-amber-50 text-amber-700 px-4 py-1.5 text-sm font-bold shadow-sm">
                                        <Zap className="w-4 h-4 mr-2" /> YANGI AKKAUNT YARATILADI
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative items-stretch">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden lg:flex bg-background border rounded-full p-2 z-10 shadow-lg">
                            <ChevronRight className="w-6 h-6 text-primary" />
                        </div>

                        {/* Hemis Column */}
                        <div className="space-y-4">
                             <div className="flex items-center gap-2 pl-2">
                                <div className="h-4 w-1 bg-primary rounded-full"></div>
                                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Hemis Ma'lumotlari</h3>
                             </div>
                             <Card className="border-primary/10 shadow-xl hover:shadow-2xl transition-all h-full bg-card/40 backdrop-blur-sm overflow-hidden">
                                <CardHeader className="bg-primary/5 py-4 border-b">
                                    <CardTitle className="text-md flex items-center justify-between">
                                        <span className="flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> Kelayotgan Profil</span>
                                        <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">SOURCE</span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-8 space-y-6">
                                    <InfoRow label="To'liq Ism" value={extractName(hData?.full_name)} highlight />
                                    <InfoRow label="Talaba ID" value={extractName(hData?.student_id_number)} />
                                    <InfoRow label="Guruh (Hemis)" value={extractName(hData?.group)} />
                                    <InfoRow label="Fakultet (Hemis)" value={extractName(hData?.faculty)} />
                                    <InfoRow label="Bog'lanish" value={extractName(hData?.phone)} />
                                    
                                    <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t">
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold">Ta'lim Shakli</span>
                                            <p className="text-sm font-medium">{extractName(hData?.educationForm)}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold">Semestr</span>
                                            <p className="text-sm font-medium">{extractName(hData?.semester)}-sem</p>
                                        </div>
                                    </div>
                                </CardContent>
                             </Card>
                        </div>

                        {/* Local/Existing Column */}
                        <div className="space-y-4">
                             <div className="flex items-center gap-2 pl-2">
                                <div className="h-4 w-1 bg-success rounded-full"></div>
                                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Platforma Bazasi</h3>
                             </div>
                             <Card className={`h-full shadow-xl overflow-hidden transition-all duration-500 ${userExists ? 'border-success/20 bg-card/40' : 'border-dashed bg-muted/10 opacity-70'}`}>
                                <CardHeader className={`py-4 border-b ${userExists ? 'bg-success/5' : 'bg-muted/5'}`}>
                                    <CardTitle className="text-md flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                            {userExists ? <ShieldCheck className="w-4 h-4 text-success" /> : <AlertCircle className="w-4 h-4" />}
                                            {userExists ? "Mavjud Tarix" : "Yaralajak Profile"}
                                        </span>
                                        {userExists && <span className="text-[10px] bg-success/20 text-success px-2 py-0.5 rounded-full font-bold">LOCAL DB</span>}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-8">
                                    {userExists ? (
                                        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
                                            <div className="bg-success/5 border border-success/10 p-5 rounded-2xl">
                                                <p className="text-sm font-semibold text-success flex items-center gap-2">
                                                   <CheckCircle2 className="w-4 h-4" /> Sinxronlash muvaffaqiyatli!
                                                </p>
                                                <p className="text-xs mt-1 opacity-80 leading-relaxed">
                                                   Ushbu talaba bizning bazamizda topildi. Sinxronlash profilni yangilaydi (parol va guruh o'zgarishi mumkin).
                                                </p>
                                            </div>

                                            <div className="space-y-4">
                                                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center justify-between">
                                                    Mavjud Natijalar
                                                    <span className="bg-muted px-2 py-0.5 rounded text-[10px]">{existingResults.length} ta record</span>
                                                </h4>
                                                
                                                {existingResults.length > 0 ? (
                                                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                                        {existingResults.map((r: any, idx: number) => (
                                                            <div key={r?.id || idx} className="group p-4 bg-muted/20 border border-border/40 rounded-2xl hover:bg-muted/50 hover:border-primary/20 transition-all cursor-default">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <div className="max-w-[70%]">
                                                                        <p className="text-xs font-bold leading-tight line-clamp-1">{r?.quiz?.title || 'Unknown'}</p>
                                                                        <p className="text-[10px] text-muted-foreground mt-1">{r?.subject?.name}</p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <div className="text-sm font-black text-primary">
                                                                            {Number(r?.grade).toFixed(1)}
                                                                        </div>
                                                                        <div className="text-[9px] font-medium text-muted-foreground mt-0.5">
                                                                            {new Date(r?.created_at).toLocaleDateString()}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="h-24 flex flex-col items-center justify-center border border-dashed rounded-2xl text-muted-foreground">
                                                        <Database className="w-6 h-6 mb-2 opacity-20" />
                                                        <p className="text-xs italic">Hech qanday test natijasi topilmadi</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full min-h-[350px] flex flex-col items-center justify-center text-center p-8 space-y-6">
                                            <div className="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center border border-border/50 animate-pulse">
                                                <UserCheck className="w-10 h-10 text-muted-foreground" />
                                            </div>
                                            <div className="space-y-2">
                                                <h3 className="text-xl font-bold">Yangi Profil</h3>
                                                <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px] mx-auto">
                                                    Ushbu talaba uchun bazamizda hech qanday tarix topilmadi. Tizim avtomatik ravishda yangi akkaunt va profil yaratadi.
                                                </p>
                                            </div>
                                            <div className="badge bg-primary/5 text-primary border border-primary/20 animate-bounce">
                                                Avtomatik Yaratish Faol
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                             </Card>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const InfoRow = ({ label, value, highlight = false }: { label: string, value: string, highlight?: boolean }) => (
    <div className="flex flex-col gap-1.5 group border-b border-border/40 pb-4 last:border-0">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80 group-hover:text-primary transition-colors">{label}</span>
        <span className={`text-sm font-semibold tracking-tight ${highlight ? 'text-lg font-bold text-foreground' : 'text-foreground/90'}`}>
            {value}
        </span>
    </div>
);

export default HemisSyncPage;
