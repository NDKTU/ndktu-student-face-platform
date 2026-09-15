import { test, expect } from '@playwright/test';

// Bu testlar login qilmagan foydalanuvchi holatini sinaydi, shuning uchun
// setup saqlagan storage state'ni ataylab tashlab yuboramiz.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login sahifasi', () => {
    test('sahifa ochiladi va xodimlar formasi ko\'rinadi', async ({ page }) => {
        await page.goto('/login');

        await expect(page).toHaveTitle(/NDKTU/i);
        await expect(
            page.getByRole('heading', { name: 'Tizimga kirish' }),
        ).toBeVisible();
        await expect(page.getByLabel('Foydalanuvchi nomi')).toBeVisible();
        await expect(page.getByLabel('Parol')).toBeVisible();
    });

    test('Xodimlar / Talabalar tabi almashadi', async ({ page }) => {
        await page.goto('/login');

        // Boshlang'ich holat — xodimlar formasi.
        await expect(page.getByLabel('Foydalanuvchi nomi')).toBeVisible();

        await page.getByRole('button', { name: 'Talabalar' }).click();
        await expect(page.getByLabel('Talaba ID / Login')).toBeVisible();
        await expect(page.getByLabel('Foydalanuvchi nomi')).toBeHidden();

        await page.getByRole('button', { name: 'Xodimlar' }).click();
        await expect(page.getByLabel('Foydalanuvchi nomi')).toBeVisible();
    });

    test('bo\'sh forma yuborilsa validatsiya xatosi chiqadi', async ({ page }) => {
        await page.goto('/login');

        await page.getByRole('button', { name: 'Tizimga kirish' }).click();

        await expect(
            page.getByText('Foydalanuvchi nomi kiritilishi shart'),
        ).toBeVisible();
        await expect(page.getByText('Parol kiritilishi shart')).toBeVisible();
    });

    test('noto\'g\'ri parolda xato xabari chiqadi', async ({ page }) => {
        await page.goto('/login');

        await page.getByLabel('Foydalanuvchi nomi').fill('__yoq_bunday_user__');
        await page.getByLabel('Parol').fill('__notogri_parol__');
        await page.getByRole('button', { name: 'Tizimga kirish' }).click();

        await expect(page.getByText('Login yoki parol noto\'g\'ri')).toBeVisible();
        // Login sahifasida qolishi kerak.
        await expect(page).toHaveURL(/\/login/);
    });

    test('himoyalangan sahifa login sahifasiga qaytaradi', async ({ page }) => {
        await page.goto('/students');

        await expect(page).toHaveURL(/\/login/);
        await expect(
            page.getByRole('heading', { name: 'Tizimga kirish' }),
        ).toBeVisible();
    });

    test('haqiqiy kredensial bilan forma orqali kirish ishlaydi', async ({ page }) => {
        const username = process.env.E2E_USERNAME;
        const password = process.env.E2E_PASSWORD;
        test.skip(!username || !password, '.env.e2e to\'ldirilmagan');

        await page.goto('/login');
        await page.getByLabel('Foydalanuvchi nomi').fill(username!);
        await page.getByLabel('Parol').fill(password!);
        await page.getByRole('button', { name: 'Tizimga kirish' }).click();

        // admin'da student/teacher/psixologik roli yo'q, shuning uchun
        // DashboardRedirect uni joyida <Dashboard /> qilib ko'rsatadi (App.tsx:97).
        await expect(page).toHaveURL(/\/$/);
        await expect(page.locator('header')).toBeVisible();
    });
});
