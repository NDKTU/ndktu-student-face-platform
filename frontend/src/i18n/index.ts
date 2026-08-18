import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './ru.json';

/**
 * Стратегия «естественных ключей»: ключ = узбекская строка из кода.
 * Для узбекского словарь не нужен (ключ и есть перевод); ru.json
 * переопределяет строки. Новые страницы просто оборачивают строки в t().
 */
const getStoredLang = (): string => {
    try {
        return localStorage.getItem('lang') || 'uz';
    } catch {
        return 'uz';
    }
};

i18n.use(initReactI18next).init({
    resources: {
        ru: { translation: ru },
        uz: { translation: {} },
    },
    lng: getStoredLang(),
    fallbackLng: false,
    keySeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
});

export const setLanguage = (lang: 'uz' | 'ru') => {
    i18n.changeLanguage(lang);
    try {
        localStorage.setItem('lang', lang);
    } catch {
        // язык просто не сохранится между перезагрузками
    }
};

export default i18n;
