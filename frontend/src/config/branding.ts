/**
 * White-label: название вуза и платформы задаются через переменные окружения,
 * чтобы разворачивать продукт для другого университета без правки кода.
 * Логотип подменяется файлом public/logo.png при сборке/деплое.
 */
export const BRAND = {
    /** Короткое имя вуза: бейджи, мобильная шапка */
    shortName: import.meta.env.VITE_UNIVERSITY_SHORT || 'NDKTU',
    /** Название приложения: сайдбар, вкладка браузера */
    appName: import.meta.env.VITE_APP_NAME || 'NDKTU Platformasi',
    /** Полное название вуза: экран входа */
    universityName:
        import.meta.env.VITE_UNIVERSITY_NAME ||
        'Navoiy davlat konchilik va texnologiyalar universiteti',
    /** Слоган на экране входа */
    tagline:
        import.meta.env.VITE_APP_TAGLINE ||
        "Talabalar va o'qituvchilar uchun yagona ta'lim platformasi",
};
