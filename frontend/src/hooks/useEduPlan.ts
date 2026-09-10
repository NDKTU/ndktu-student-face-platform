import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eduplanService, type EduPlanEntity } from '@/services/eduplanService';

export const useEduPlanStatus = () => {
    return useQuery({
        queryKey: ['eduplan', 'status'],
        queryFn: () => eduplanService.getStatus(),
        // Статус дёргает внешний сервис — незачем перепроверять его при
        // каждом возврате на вкладку.
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });
};

export const useEduPlanSettings = () =>
    useQuery({
        queryKey: ['eduplan', 'settings'],
        queryFn: () => eduplanService.getSettings(),
        refetchOnWindowFocus: false,
    });

/** Сохранение учётных данных: после него статус подключения нужно перепроверить. */
export const useUpdateEduPlanSettings = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: eduplanService.updateSettings,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['eduplan', 'settings'] });
            queryClient.invalidateQueries({ queryKey: ['eduplan', 'status'] });
        },
    });
};

export const useClearEduPlanSettings = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => eduplanService.clearSettings(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['eduplan', 'settings'] });
            queryClient.invalidateQueries({ queryKey: ['eduplan', 'status'] });
        },
    });
};

/**
 * Umumiy koʻrib chiqish. Argumentsiz — barcha boʻlimlar.
 *
 * `void` variant ataylab: `mutateAsync()` ni argumentsiz chaqirish mumkin
 * boʻlishi kerak, aks holda faqat ziddiyatlarni yuklaydigan joylarda ham
 * roʻyxat uzatishga majbur boʻlardik.
 */
export const useEduPlanPreview = () => {
    return useMutation({
        mutationFn: (entities?: EduPlanEntity[] | void) =>
            eduplanService.preview(entities || undefined),
    });
};

/** Справочники, которые переписывает синхронизация: их кэш надо сбросить. */
const MIRRORED_QUERY_KEYS = [
    'faculties',
    'kafedras',
    'specialities',
    'groups',
    'subjects',
    'employees',
    'teachers',
];

export const useEduPlanApply = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: eduplanService.apply,
        onSuccess: () => {
            // Применение переписывает справочники целиком — сбрасываем всё,
            // что их показывает.
            MIRRORED_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
        },
    });
};

/** Qaysi boʻlim qaysi keshni eskirtiradi. */
const ENTITY_QUERY_KEYS: Record<EduPlanEntity, string[]> = {
    faculty: ['faculties'],
    kafedra: ['kafedras'],
    speciality: ['specialities'],
    group: ['groups'],
    subject: ['subjects'],
    teacher: ['employees', 'teachers'],
    curriculum: ['curriculums'],
};

/**
 * Bitta boʻlimni sinxronlash.
 *
 * Har bir boʻlim uchun alohida chaqiriladi va oʻz `isPending` holatiga ega
 * boʻladi — shuning uchun mutatsiya boʻlim boʻyicha parametrlangan, bitta
 * umumiy emas: aks holda bitta tugma bosilganda hammasi «yuklanmoqda»
 * koʻrinishiga oʻtardi.
 *
 * Kesh faqat shu boʻlimniki yangilanadi: fakultetlarni sinxronlash guruhlar
 * roʻyxatini qayta soʻrashga sabab boʻlmasligi kerak.
 */
export const useSyncEntity = (entity: EduPlanEntity) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (applyDeactivations: boolean = false) =>
            eduplanService.syncEntity(entity, applyDeactivations),
        onSuccess: () => {
            ENTITY_QUERY_KEYS[entity].forEach((key) =>
                queryClient.invalidateQueries({ queryKey: [key] }),
            );
        },
    });
};

/**
 * Yuklamalarni sinxronlash.
 *
 * Boshqa boʻlimlardan farqli: yuklama koʻrib chiqishsiz qoʻllanadi, chunki
 * u yangi satr yaratmaydi — faqat allaqachon bogʻlangan oʻqituvchi, fan va
 * guruhlarni bir-biriga ulaydi. Bogʻlanmaganlari `unresolved_*` da sanaladi.
 */
export const useSyncWorkloads = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => eduplanService.syncWorkloads(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teacher-assignments'] });
        },
    });
};

/** Bitta boʻlim boʻyicha koʻrib chiqish: nima oʻzgarishini koʻrsatadi, yozmaydi. */
export const usePreviewEntity = (entity: EduPlanEntity) =>
    useMutation({
        mutationFn: () => eduplanService.previewEntity(entity),
    });

/** Полный прогон одной кнопкой: справочники и нагрузка сразу. */
/**
 * Prognni fonda boshlaydi. Javob — boshlangʻich holat, natija emas.
 *
 * Keshni bu yerda yangilamaymiz: soʻrov qaytganda progn hali ketyapti va
 * yangilanadigan maʼlumot yoʻq. Kesh progn tugaganda, sahifadagi kuzatuvchi
 * `done` holatini koʻrgach yangilanadi.
 */
export const useEduPlanRun = () =>
    useMutation({
        mutationFn: () => eduplanService.run(),
    });

/**
 * Yuklamadan yigʻilgan kurs takliflari.
 *
 * Sahifa ochilishi bilan soʻralmaydi: hisob 374 ta biriktirma boʻyicha
 * boradi va u faqat admin kurslar boʻlimini ochganda kerak.
 */
export const useEduPlanCoursePreview = (enabled: boolean) =>
    useQuery({
        queryKey: ['eduplan', 'course-preview'],
        queryFn: () => eduplanService.previewCourses(),
        enabled,
        refetchOnWindowFocus: false,
    });

/** Kurslarni yaratadi: kurslar roʻyxati va taklif keshini yangilaydi. */
export const useEduPlanApplyCourses = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (archive: boolean = false) => eduplanService.applyCourses(archive),
        onSuccess: (data) => {
            queryClient.setQueryData(['eduplan', 'course-preview'], data);
            queryClient.invalidateQueries({ queryKey: ['courses'] });
        },
    });
};

/** Progn tugagach chaqiriladi: koʻchirilgan spravochniklar keshini yangilaydi. */
export const useInvalidateMirrored = () => {
    const queryClient = useQueryClient();
    return () => {
        MIRRORED_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
        queryClient.invalidateQueries({ queryKey: ['teacher-assignments'] });
    };
};

// Отдельного импорта нагрузки в интерфейсе больше нет: она переносится тем же
// прогоном, что и справочники (см. useEduPlanRun). Эндпоинт `/workloads` на
// бэкенде остался — им пользуются API и CLI.
