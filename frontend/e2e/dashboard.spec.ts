import { test, expect } from '@playwright/test';

// Bu spec setup saqlagan admin sessiyasidan foydalanadi
// (playwright.config.ts → projects.chromium.dependencies).

test.describe('Login qilingan holat', () => {
    test('bosh sahifada dashboard ko\'rinadi', async ({ page }) => {
        await page.goto('/');

        await expect(page.locator('header')).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Platforma ko\'lami' }),
        ).toBeVisible();
    });

    test('himoyalangan sahifa ochiladi va /login ga otmaydi', async ({ page }) => {
        await page.goto('/students');

        await expect(page).toHaveURL(/\/students/);
        await expect(page.locator('header')).toBeVisible();
    });

    test('sahifada konsol xatolari yo\'q', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await page.goto('/');
        await expect(page.locator('header')).toBeVisible();

        expect(errors, `Konsol xatolari:\n${errors.join('\n')}`).toEqual([]);
    });
});
