import tseslint from 'typescript-eslint';
import i18next from 'eslint-plugin-i18next';

/**
 * Основной линтер проекта — oxlint (`npm run lint`).
 * ESLint здесь держим ради одного правила, аналога которому в oxlint нет:
 * запрета текстовых литералов в JSX. Без него хардкод узбекских строк
 * расползётся по компонентам и добавить вторую локаль станет дорого.
 */
export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'src/entities/university/mock/catalog.ts'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          // Латиница проходит проверку в атрибутах вроде className;
          // ловим именно видимый текст и подписи для скринридеров.
          markupOnly: false,
          onlyAttribute: ['alt', 'title', 'aria-label', 'placeholder'],
        },
      ],
    },
  },
  {
    // В тестах узбекский текст — это ожидаемые значения, а не UI-строки.
    files: ['src/**/*.test.{ts,tsx}'],
    rules: { 'i18next/no-literal-string': 'off' },
  },
);
