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
import { BookOpen, GraduationCap, Users } from 'lucide-react';

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
    const params = new URLSearchParams(location.search);
    const notice = params.get('idle') === '1'
        ? 'Faolligingiz bo\'lmagani uchun tizimdan chiqdingiz. Iltimos, qaytadan kiring.'
        : params.get('reason') === 'session'
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
            console.error(err);
            if (err.response?.status === 401 || err.response?.status === 400) {
                setError('Login yoki parol noto\'g\'ri');
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
            console.error(err);
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
            {/* Left side - Branding/Graphic (Hidden on mobile) */}
            <div className="hidden lg:flex lg:w-1/2 bg-primary/5 dark:bg-primary/10 flex-col justify-center items-center p-12 relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-slate-200/50 dark:bg-grid-slate-800/50 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] dark:[mask-image:linear-gradient(0deg,black,rgba(0,0,0,0.6))] -z-10" />

                <div className="max-w-md w-full space-y-8 text-center relative z-10">
                    <div className="mx-auto w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center mb-8 shadow-sm">
                        <GraduationCap className="h-12 w-12 text-primary" />
                    </div>
                    <h1 className="text-4xl font-bold tracking-tight text-foreground">
                        NDKTU Student Platform
                    </h1>
                    <p className="text-lg text-muted-foreground leading-relaxed">
                        Talabalar va o'qituvchilar uchun yagona ta'lim portaliga xush kelibsiz.
                    </p>

                    <div className="grid grid-cols-2 gap-4 mt-12">
                        <div className="bg-background/60 backdrop-blur-sm p-4 rounded-xl border border-border/50 shadow-sm flex flex-col items-center gap-2">
                            <BookOpen className="h-6 w-6 text-primary" />
                            <span className="text-sm font-medium">Onlayn testlar</span>
                        </div>
                        <div className="bg-background/60 backdrop-blur-sm p-4 rounded-xl border border-border/50 shadow-sm flex flex-col items-center gap-2">
                            <Users className="h-6 w-6 text-primary" />
                            <span className="text-sm font-medium">O'zlashtirish nazorati</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right side - Login Form */}
            <div className="flex-1 flex items-center justify-center p-4 sm:p-8 lg:p-12">
                <div className="w-full max-w-[400px] space-y-8 relative">
                    {/* Mobile only header */}
                    <div className="lg:hidden text-center mb-10">
                        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                            <GraduationCap className="h-8 w-8 text-primary" />
                        </div>
                        <h2 className="text-2xl font-bold text-foreground">NDKTU Portal</h2>
                    </div>

                    <div className="text-center lg:text-left space-y-2">
                        <h2 className="text-3xl font-bold tracking-tight text-foreground">
                            Tizimga kirish
                        </h2>
                        <p className="text-muted-foreground">
                            Hududni tanlang va ma'lumotlaringizni kiriting
                        </p>
                    </div>

                    <div className="flex rounded-lg bg-muted p-1">
                        <button
                            type="button"
                            onClick={() => toggleLoginType('staff')}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-all ${loginType === 'staff'
                                ? 'bg-background text-foreground shadow-sm'
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
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <GraduationCap className="h-4 w-4" />
                            Talabalar
                        </button>
                    </div>

                    {notice && !error && (
                        <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 border border-amber-500/20">
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
                                    type="text"
                                    autoComplete="username"
                                    error={errorsStaff.username?.message?.toString()}
                                    {...registerStaff('username')}
                                />

                                <Input
                                    label="Parol"
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
                                    type="text"
                                    autoComplete="username"
                                    error={errorsStudent.login?.message?.toString()}
                                    {...registerStudent('login')}
                                />

                                <Input
                                    label="Parol"
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
