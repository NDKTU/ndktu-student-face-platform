import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '@/services/api';
import { hemisService } from '@/services/hemisService';
import { BookOpen, GraduationCap, Users, ShieldCheck, Camera } from 'lucide-react';
import { logger } from '@/utils/logger';
import { clearLogoutReason, readLogoutReason } from '@/services/tokenStorage';
import { BRAND } from '@/config/branding';
import logo from '@/assets/logo.png';

const staffLoginSchema = z.object({
    username: z.string().min(1, 'Foydalanuvchi nomi kiritilishi shart'),
    password: z.string().min(1, 'Parol kiritilishi shart'),
});

const studentLoginSchema = z.object({
    login: z.string().min(1, 'Login/Talaba ID kiritilishi shart'),
    password: z.string().min(1, 'Parol kiritilishi shart'),
});

type StaffLoginFormValues = z.infer<typeof staffLoginSchema>;
type StudentLoginFormValues = z.infer<typeof studentLoginSchema>;

export const Login: React.FC = () => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [loginType, setLoginType] = useState<'staff' | 'student'>('staff');
    const [error, setError] = React.useState<string | null>(null);

    const from = location.state?.from?.pathname || '/';

    // Сообщение о причине выхода (выставляется useIdleTimeout / интерсептором api).
    // Query может не доехать: ProtectedRoute делает свой <Navigate to="/login">
    // без параметров и затирает его — поэтому есть запасной канал в sessionStorage.
    const params = new URLSearchParams(location.search);
    const [storedReason] = React.useState<string | null>(() => readLogoutReason());
    React.useEffect(() => clearLogoutReason(), []);
    const reason = params.get('reason') ?? storedReason;
    const notice = params.get('idle') === '1'
        ? 'Faolligingiz bo\'lmagani uchun tizimdan chiqdingiz. Iltimos, qaytadan kiring.'
        : reason === 'session'
            ? 'Boshqa qurilmadan profilga kirilgani uchun joriy sessiya yakunlandi.'
            : null;

    const {
        register: registerStaff,
        handleSubmit: handleSubmitStaff,
        formState: { errors: errorsStaff, isSubmitting: isSubmittingStaff },
        reset: resetStaff,
    } = useForm<StaffLoginFormValues>({
        resolver: zodResolver(staffLoginSchema),
    });

    const {
        register: registerStudent,
        handleSubmit: handleSubmitStudent,
        formState: { errors: errorsStudent, isSubmitting: isSubmittingStudent },
        reset: resetStudent,
    } = useForm<StudentLoginFormValues>({
        resolver: zodResolver(studentLoginSchema),
    });

    const onStaffSubmit = async (data: StaffLoginFormValues) => {
        try {
            setError(null);
            const response = await api.post('/user/login', data);
            await login(response.data.access_token);
            navigate(from, { replace: true });
        } catch (err: any) {
            logger.error('Staff login failed', err);
            if (err.response?.status === 401 || err.response?.status === 400) {
                setError('Login yoki parol noto\'g\'ri');
            } else if (err.response?.status === 429) {
                setError('Urinishlar soni ko\'p. Keyinroq urinib ko\'ring.');
            } else {
                setError('Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
            }
        }
    };

    const onStudentSubmit = async (data: StudentLoginFormValues) => {
        try {
            setError(null);
            const response = await hemisService.login(data);
            await login(response.access_token);
            navigate(from, { replace: true });
        } catch (err: any) {
            logger.error('Student login failed', err);
            if (err.response?.status === 401 || err.response?.status === 400 || err.response?.status === 404) {
                setError('Ma\'lumotlar noto\'g\'ri yoki talaba topilmadi.');
            } else if (err.response?.status === 429) {
                setError('Urinishlar soni ko\'p. Keyinroq urinib ko\'ring.');
            }
            else {
                setError('Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
            }
        }
    };

    const toggleLoginType = (type: 'staff' | 'student') => {
        setLoginType(type);
        setError(null);
        if (type === 'staff') resetStudent();
        else resetStaff();
    };

    return (
        <div className="flex min-h-screen bg-background">
            {/* EduDash brand panel */}
            <div className="hidden lg:flex lg:w-1/2 bg-accent flex-col justify-between p-12 relative overflow-hidden">
                {/* Декоративные круги в тоне бренда */}
                <div aria-hidden className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/5" />
                <div aria-hidden className="absolute -bottom-48 -left-24 h-[28rem] w-[28rem] rounded-full bg-primary/5" />
                <div aria-hidden className="absolute bottom-24 right-16 h-40 w-40 rounded-full border border-primary/15" />

                <div className="relative z-10 flex items-center gap-3">
                    <img src={logo} alt={BRAND.shortName} className="h-11 w-11 rounded-xl bg-white/95 object-contain p-1" />
                    <span className="font-display text-lg font-bold text-foreground">{BRAND.shortName}</span>
                </div>

                <div className="relative z-10 max-w-lg space-y-6">
                    <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-foreground text-balance">
                        {BRAND.universityName}
                    </h1>
                    <p className="text-lg leading-relaxed text-muted-foreground">
                        {BRAND.tagline}
                    </p>
                </div>

                <div className="relative z-10 grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-card/70 border border-primary/15 p-4 flex flex-col gap-2">
                        <BookOpen className="h-5 w-5 text-accent-foreground" />
                        <span className="text-sm font-medium text-foreground">Onlayn testlar</span>
                    </div>
                    <div className="rounded-xl bg-card/70 border border-primary/15 p-4 flex flex-col gap-2">
                        <Camera className="h-5 w-5 text-accent-foreground" />
                        <span className="text-sm font-medium text-foreground">Yuz orqali nazorat</span>
                    </div>
                    <div className="rounded-xl bg-card/70 border border-primary/15 p-4 flex flex-col gap-2">
                        <ShieldCheck className="h-5 w-5 text-accent-foreground" />
                        <span className="text-sm font-medium text-foreground">Halol natijalar</span>
                    </div>
                </div>
            </div>

            {/* Правая часть — форма входа */}
            <div className="flex-1 flex items-center justify-center p-4 sm:p-8 lg:p-12">
                <div className="w-full max-w-[460px] space-y-7 relative rounded-xl border border-border bg-card p-6 shadow-[var(--surface-shadow)] sm:p-9">
                    {/* Шапка только для мобильных */}
                    <div className="lg:hidden text-center mb-10">
                        <img src={logo} alt={BRAND.shortName} className="mx-auto mb-4 h-16 w-16 rounded-2xl object-contain" />
                        <h2 className="font-display text-2xl font-bold text-foreground">{BRAND.appName}</h2>
                    </div>

                    <div className="text-center lg:text-left space-y-2">
                        <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">
                            Tizimga kirish
                        </h2>
                        <p className="text-muted-foreground">
                            Bo'limni tanlang va ma'lumotlaringizni kiriting
                        </p>
                    </div>

                    <div className="flex rounded-lg bg-muted p-1">
                        <button
                            type="button"
                            onClick={() => toggleLoginType('staff')}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-all ${loginType === 'staff'
                                ? 'bg-card text-accent-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <Users className="h-4 w-4" />
                            Xodimlar
                        </button>
                        <button
                            type="button"
                            onClick={() => toggleLoginType('student')}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-all ${loginType === 'student'
                                ? 'bg-card text-accent-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <GraduationCap className="h-4 w-4" />
                            Talabalar
                        </button>
                    </div>

                    {notice && !error && (
                        <div className="rounded-md bg-warning/10 p-3 text-sm text-warning border border-warning/20">
                            {notice}
                        </div>
                    )}

                    {error && (
                        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
                            {error}
                        </div>
                    )}

                    {loginType === 'staff' ? (
                        <form className="mt-8 space-y-6" onSubmit={handleSubmitStaff(onStaffSubmit)}>
                            <div className="space-y-4">
                                <Input
                                    label="Foydalanuvchi nomi"
                                    className="h-11"
                                    type="text"
                                    autoComplete="username"
                                    error={errorsStaff.username?.message?.toString()}
                                    {...registerStaff('username')}
                                />

                                <Input
                                    label="Parol"
                                    className="h-11"
                                    type="password"
                                    autoComplete="current-password"
                                    error={errorsStaff.password?.message?.toString()}
                                    {...registerStaff('password')}
                                />
                            </div>

                            <div className="pt-2">
                                <Button
                                    type="submit"
                                    className="w-full h-11 text-base font-medium"
                                    isLoading={isSubmittingStaff}
                                >
                                    Tizimga kirish
                                </Button>
                            </div>
                        </form>
                    ) : (
                        <form className="mt-8 space-y-6" onSubmit={handleSubmitStudent(onStudentSubmit)}>
                            <div className="space-y-4">
                                <Input
                                    label="Talaba ID / Login"
                                    className="h-11"
                                    type="text"
                                    autoComplete="username"
                                    error={errorsStudent.login?.message?.toString()}
                                    {...registerStudent('login')}
                                />

                                <Input
                                    label="Parol"
                                    className="h-11"
                                    type="password"
                                    autoComplete="current-password"
                                    error={errorsStudent.password?.message?.toString()}
                                    {...registerStudent('password')}
                                />
                            </div>

                            <div className="pt-2">
                                <Button
                                    type="submit"
                                    className="w-full h-11 text-base font-medium"
                                    isLoading={isSubmittingStudent}
                                >
                                    Hemis orqali kirish
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Login;
