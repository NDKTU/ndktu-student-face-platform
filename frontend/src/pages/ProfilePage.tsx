import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { User, Calendar, KeyRound, Save } from 'lucide-react';
import { userService } from '@/services/userService';

const credentialsSchema = z
    .object({
        current_password: z.string().min(1, 'Joriy parolni kiritish majburiy'),
        new_username: z.string().optional(),
        new_password: z
            .string()
            .optional()
            .refine((v) => !v || v.length >= 4, "Yangi parol kamida 4 ta belgidan iborat bo'lishi kerak"),
    })
    .refine((data) => data.new_username || data.new_password, {
        message: "Kamida bitta maydon (Login yoki Yangi parol) o'zgartirilishi kerak",
        path: ['new_username'],
    });

type CredentialsForm = z.infer<typeof credentialsSchema>;

const ProfilePage = () => {
    const { user } = useAuth();
    const isStudent = Boolean(user?.student) || user?.roles?.some(role => role.name.toLowerCase() === 'student');

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<CredentialsForm>({
        resolver: zodResolver(credentialsSchema),
        defaultValues: { current_password: '', new_username: '', new_password: '' },
    });

    const onSubmit = async (values: CredentialsForm) => {
        try {
            await userService.changeMyCredentials({
                current_password: values.current_password,
                new_username: values.new_username || undefined,
                new_password: values.new_password || undefined,
            });
            toast.success("Ma'lumotlar yangilandi! Tizimga yangi ma'lumotlar bilan qayta kiring.");

            // Log out user so they can login with new credentials
            setTimeout(() => {
                window.location.href = '/login';
            }, 3000);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Xatolik yuz berdi');
        }
    };

    if (!user) return null;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <Card className="w-full">
                <CardHeader>
                    <CardTitle>Shaxsiy Ma'lumotlar</CardTitle>
                    <CardDescription>Foydalanuvchi va talaba ma'lumotlari.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col md:flex-row gap-8">
                    {/* Left Side: User Image & Basic Info */}
                    <div className="w-full md:w-1/4 flex flex-col items-center text-center space-y-4 border-b md:border-b-0 md:border-r border-border md:pr-8 pb-6 md:pb-0 h-fit">
                         <div className="relative">
                            <div className="flex h-40 w-40 items-center justify-center rounded-full bg-primary/10 border-4 border-background shadow-xl overflow-hidden">
                                {user.student?.image_path ? (
                                    <img 
                                        src={user.student.image_path} 
                                        alt={user.username} 
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <User className="h-20 w-20 text-primary" />
                                )}
                            </div>
                        </div>
                        <div className="space-y-2">
                             <h2 className="text-xl font-bold break-words">
                                {user.employee
                                    ? `${user.employee.last_name} ${user.employee.first_name}`
                                    : user.student
                                        ? `${user.student.last_name} ${user.student.first_name}`
                                        : user.username
                                }
                            </h2>
                             <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary text-primary-foreground hover:bg-primary/80">
                                {user.roles?.map(r => r.name).join(', ') || 'Foydalanuvchi'}
                            </span>
                        </div>
                    </div>

                    {/* Right Side: Detailed Info */}
                    <div className="flex-1">
                        <div className="grid gap-6 md:grid-cols-2">
                            {/* Common Fields */}
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                    <User className="h-3.5 w-3.5" />
                                    Foydalanuvchi nomi
                                </label>
                                <div className="text-base font-semibold">
                                    {user.username}
                                </div>
                            </div>
                            
                             {/* Employee Specific Details */}
                            {user.employee && (
                                <>
                                    {user.employee.teacher && (
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                                <Calendar className="h-3.5 w-3.5" />
                                                Kafedra
                                            </label>
                                            <div className="text-base font-semibold">
                                               {user.employee.teacher.kafedra?.name || 'Mavjud emas'}
                                            </div>
                                        </div>
                                    )}
                                     <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <User className="h-3.5 w-3.5" />
                                            F.I.O
                                        </label>
                                        <div className="text-base font-semibold">
                                           {user.employee.last_name} {user.employee.first_name} {user.employee.third_name}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Student Specific Details */}
                            {user.student && (
                                <>
                                    <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <User className="h-3.5 w-3.5" />
                                            F.I.O (To'liq)
                                        </label>
                                        <div className="text-base font-semibold">
                                           {user.student.full_name || `${user.student.last_name} ${user.student.first_name} ${user.student.middle_name}`}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            Universitet
                                        </label>
                                        <div className="text-base font-semibold">
                                           {user.student.university || '-'}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            Fakultet
                                        </label>
                                        <div className="text-base font-semibold">
                                           {user.student.faculty || '-'}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            Mutaxassislik
                                        </label>
                                        <div className="text-base font-semibold">
                                           {user.student.specialty || '-'}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            Guruh
                                        </label>
                                        <div className="text-base font-semibold">
                                           {user.student.group?.name || '-'}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            Bosqich (Kurs)
                                        </label>
                                        <div className="text-base font-semibold">
                                           {user.student.level || '-'}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            Semestr
                                        </label>
                                        <div className="text-base font-semibold">
                                           {user.student.semester || '-'}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            Ta'lim Shakli
                                        </label>
                                        <div className="text-base font-semibold">
                                           {user.student.education_form || '-'}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            Ta'lim Turi
                                        </label>
                                        <div className="text-base font-semibold">
                                           {user.student.education_type || '-'}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            To'lov Shakli
                                        </label>
                                        <div className="text-base font-semibold">
                                           {user.student.payment_form || '-'}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            Ta'lim Tili
                                        </label>
                                        <div className="text-base font-semibold">
                                           {user.student.education_lang || '-'}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            O'rtacha Baho (GPA)
                                        </label>
                                        <div className="text-base font-semibold">
                                           {user.student.avg_gpa || '-'}
                                        </div>
                                    </div>

                                    <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            Manzil
                                        </label>
                                        <div className="text-base font-semibold">
                                           {user.student.address || '-'}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                </CardContent>
            </Card>

            {/* Change Credentials Form (Hidden for students) */}
            {!isStudent && (
                <Card className="w-full">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <KeyRound className="h-5 w-5" />
                            Kirish ma'lumotlarini o'zgartirish
                        </CardTitle>
                        <CardDescription>O'z login va parolingizni shu yerdan yangilashingiz mumkin.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Joriy parol <span className="text-destructive">*</span></label>
                                <Input
                                    type="password"
                                    placeholder="Tasdiqlash uchun joriy parolingizni kiriting"
                                    {...register('current_password')}
                                />
                                {errors.current_password && (
                                    <p className="text-sm text-destructive">{errors.current_password.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Yangi Login (Username)</label>
                                <Input
                                    type="text"
                                    placeholder="Ixtiyoriy: Yangi login nomini kiriting"
                                    {...register('new_username')}
                                />
                                {errors.new_username && (
                                    <p className="text-sm text-destructive">{errors.new_username.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Yangi Parol</label>
                                <Input
                                    type="password"
                                    placeholder="Ixtiyoriy: Yangi parolni kiriting (min. 4 ta belgi)"
                                    {...register('new_password')}
                                />
                                {errors.new_password && (
                                    <p className="text-sm text-destructive">{errors.new_password.message}</p>
                                )}
                            </div>

                            <Button type="submit" isLoading={isSubmitting} className="w-full sm:w-auto mt-2">
                                <Save className="mr-2 h-4 w-4" />
                                Saqlash
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default ProfilePage;
