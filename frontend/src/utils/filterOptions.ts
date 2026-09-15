/**
 * Server tomonda qidiriladigan ro'yxatlar (`Combobox`) uchun yordamchilar.
 *
 * Katalogar katta: 2978 fan, 683 guruh, 703 o'qituvchi. Ularni to'liq yuklab
 * brauzerda filtrlash ishlamaydi — kerakli qator ro'yxatga umuman tushmay
 * qolardi. Shuning uchun qidiruv serverga beriladi, sahifa hajmi esa kichik.
 */

export type FilterOption = { value: string; label: string };

/** Filtr ro'yxati uchun sahifa hajmi: qidiruv serverda, ko'p yuklash keraksiz. */
export const FILTER_PAGE_SIZE = 50;

/**
 * Tanlangan qiymat qidiruv natijasida bo'lmasa ham ro'yxatda qolsin.
 *
 * Busiz `Combobox` nom o'rniga placeholder ko'rsatardi — go'yo tanlov bekor
 * qilingandek. Tahrirlash formalarida bu ayniqsa yomon: saqlashda maydon
 * bo'sh deb hisoblanardi.
 */
export const withSelected = (
    list: FilterOption[],
    selected: FilterOption | null,
): FilterOption[] =>
    selected && !list.some((option) => option.value === selected.value)
        ? [selected, ...list]
        : list;
