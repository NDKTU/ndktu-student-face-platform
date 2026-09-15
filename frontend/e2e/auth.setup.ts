import { test as setup, expect } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';

/**
 * Bir marta login qilib, natijani storage state'ga saqlaydi.
 *
 * Nega forma orqali emas, API orqali: ilova autentifikatsiyani
 * localStorage['token'] ustiga quradi (src/services/tokenStorage.ts).
 * Tokenni to'g'ridan-to'g'ri qo'yish har spec uchun login formasini
 * qayta-qayta to'ldirishdan tez va mo'rt emas. Formaning o'zi
 * login.spec.ts da alohida sinaladi.
 */
setup('authenticate as admin', async ({ page, request }) => {
    const username = process.env.E2E_USERNAME;
    const password = process.env.E2E_PASSWORD;

    expect(
        username && password,
        'E2E_USERNAME / E2E_PASSWORD topilmadi — frontend/.env.e2e faylini to\'ldiring (.env.e2e.example dan nusxa oling)',
    ).toBeTruthy();

    const response = await request.post('/api/user/login', {
        data: { username, password },
    });
    expect(response.status(), 'login API 200 qaytarishi kerak').toBe(200);

    const { access_token: token } = await response.json();
    expect(token, 'javobda access_token bo\'lishi kerak').toBeTruthy();

    // localStorage origin'ga bog'langan, shuning uchun avval sahifani ochamiz.
    await page.goto('/login');
    await page.evaluate((value) => localStorage.setItem('token', value), token);

    // Token haqiqatan ishlayotganini tasdiqlaymiz: '/' himoyalangan route,
    // token yaroqsiz bo'lsa ProtectedRoute bizni /login ga qaytaradi.
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('header')).toBeVisible();

    await page.context().storageState({ path: STORAGE_STATE });
});
