import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import uzAuth from '@/locales/uz/auth.json';
import uzCommon from '@/locales/uz/common.json';
import uzDashboard from '@/locales/uz/dashboard.json';
import uzFanlar from '@/locales/uz/fanlar.json';
import uzKurslar from '@/locales/uz/kurslar.json';
import uzMening from '@/locales/uz/mening.json';
import uzNav from '@/locales/uz/nav.json';
import uzProfil from '@/locales/uz/profil.json';
import uzPsixologiya from '@/locales/uz/psixologiya.json';
import uzReja from '@/locales/uz/reja.json';
import uzReyting from '@/locales/uz/reyting.json';
import uzSavollar from '@/locales/uz/savollar.json';
import uzTestlar from '@/locales/uz/testlar.json';
import uzVazifalar from '@/locales/uz/vazifalar.json';
import uzSozlamalar from '@/locales/uz/sozlamalar.json';
import uzHemis from '@/locales/uz/hemis.json';
import uzHome from '@/locales/uz/home.json';
import uzRollar from '@/locales/uz/rollar.json';
import uzTuzilma from '@/locales/uz/tuzilma.json';
import uzXodimlar from '@/locales/uz/xodimlar.json';
import uzTalabalar from '@/locales/uz/talabalar.json';

export const DEFAULT_LOCALE = 'uz';

/**
 * Пока одна локаль, но весь UI-текст обязан идти через переводы:
 * добавить ru/en позже дешевле, чем вычищать хардкод из полусотни экранов.
 */
export const resources = {
  uz: {
    auth: uzAuth,
    common: uzCommon,
    dashboard: uzDashboard,
    fanlar: uzFanlar,
    kurslar: uzKurslar,
    mening: uzMening,
    nav: uzNav,
    profil: uzProfil,
    psixologiya: uzPsixologiya,
    reja: uzReja,
    reyting: uzReyting,
    savollar: uzSavollar,
    testlar: uzTestlar,
    vazifalar: uzVazifalar,
    sozlamalar: uzSozlamalar,
    hemis: uzHemis,
    home: uzHome,
    rollar: uzRollar,
    tuzilma: uzTuzilma,
    xodimlar: uzXodimlar,
    talabalar: uzTalabalar,
  },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  // Коды прав содержат двоеточие («lms:read»), а i18next по умолчанию
  // считает его разделителем неймспейса и режет ключ пополам.
  // Неймспейс всегда задаётся через useTranslation, поэтому разделитель не нужен.
  nsSeparator: false,
});

export default i18n;
