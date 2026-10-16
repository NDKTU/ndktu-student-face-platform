import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/immutability': 'warn',
      'react-refresh/only-export-components': 'warn',
      // Sana formati bitta joyda — `src/utils/date.ts`. Argumentsiz
      // `toLocaleDateString()` natijasini brauzer tili belgilaydi, ya'ni
      // bitta jadval ikki xodimda ikki xil ko'rinadi; qattiq yozilgan
      // locale ('ru-RU') esa o'zbek interfeysiga tushib qolardi. Ilgari
      // helper bor edi-yu, majburiy emasdi — shuning uchun ilovada 5 xil
      // format to'planib qolgan edi.
      'no-restricted-syntax': [
        'error',
        {
          // Bu ikkalasi faqat `Date` da bor — qaysi holatda chaqirilishidan
          // qat'i nazar taqiqlanadi.
          selector:
            "CallExpression > MemberExpression[property.name=/^toLocale(Date|Time)String$/]",
          message:
            "Sanani to'g'ridan-to'g'ri formatlamang: '@/utils/date' dan formatDate / formatDateTime / formatDayMonth / formatTime ni ishlating.",
        },
        {
          // `toLocaleString` sonlarda ham ishlatiladi (StatCard, Dashboard),
          // shuning uchun faqat `new Date(...)` ustidan chaqirilgani ushlanadi.
          selector:
            "CallExpression > MemberExpression[property.name='toLocaleString'][object.type='NewExpression'][object.callee.name='Date']",
          message:
            "Sanani to'g'ridan-to'g'ri formatlamang: '@/utils/date' dan formatDate / formatDateTime ni ishlating.",
        },
        {
          // `useSubjects(1, 1000)` kabi «hammasini yuklab, brauzerda izlash»:
          // ro'yxat chegaradan oshgach (fanlar 3254 ta edi) filtr va nomlar
          // jimgina ma'lumot yo'qotadi. Kichik katalog uchun (kafedralar 21 ta)
          // istisno — sababi bilan `eslint-disable-next-line`.
          selector: "CallExpression[callee.name=/^use[A-Z]/][arguments.1.type='Literal'][arguments.1.value>=500]",
          message:
            "Katta ro'yxatni to'liq yuklamang: server qidiruvi (useSubjectFilter / useGroupFilter / useQuizFilter) yoki `/options` dan foydalaning.",
        },
        {
          // Xuddi shu, parametrlar obyekt bilan berilganda: `useQuizzes({ limit: 1000 })`.
          selector:
            "CallExpression[callee.name=/^use[A-Z]/] > ObjectExpression > Property[key.name='limit'][value.type='Literal'][value.value>=500]",
          message:
            "Katta ro'yxatni to'liq yuklamang: server qidiruvi (useSubjectFilter / useGroupFilter / useQuizFilter) yoki `/options` dan foydalaning.",
        },
      ],
    },
  },
  {
    // Kanonik formatlagichning o'zi — istisno.
    files: ['src/utils/date.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
])
