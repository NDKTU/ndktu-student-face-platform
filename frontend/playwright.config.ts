import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// package.json'da "type": "module" — shuning uchun __dirname yo'q.
const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Kredensiallar .env.e2e faylidan o'qiladi (git'ga tushmaydi, .gitignore: `.env.*`).
// Namuna uchun .env.e2e.example ga qarang.
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(rootDir, '.env.e2e') });

// Ilova Docker'da 3000-portda ishlaydi (docker-compose: nusmt_frontend).
// Vite dev serverga o'tmoqchi bo'lsangiz: E2E_BASE_URL=http://localhost:5173.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export const STORAGE_STATE = path.resolve(rootDir, 'e2e/.auth/admin.json');

export default defineConfig({
    testDir: './e2e',
    // CI'da .only qolib ketsa — xato. Lokalda bu xalaqit bermaydi.
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [['html', { open: 'never' }], ['list']],

    use: {
        baseURL,
        // Yiqilgan testni qayta ishga tushirmasdan turib ko'rish uchun.
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },

    projects: [
        // Login qilib, tokenni storage state'ga yozadi. Qolgan authli
        // testlar shu holatdan boshlanadi — har testda formani to'ldirmaydi.
        { name: 'setup', testMatch: /auth\.setup\.ts/ },
        {
            name: 'chromium',
            // storageState — setup saqlagan sessiya. `dependencies` faqat
            // tartibni belgilaydi, holatni o'zi yuklamaydi — ikkalasi ham kerak.
            use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
            dependencies: ['setup'],
        },
    ],
});
