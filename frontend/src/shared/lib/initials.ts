/** «Karimov Aziz» → «KA». Берёт первые буквы двух первых значимых слов. */
export function initials(name: string): string {
  return (name || '')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
