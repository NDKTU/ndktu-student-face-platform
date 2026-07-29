/** «Konchilik fakulteti» → «Konchilik»: в таблицах слово лишнее. */
export function shortFaculty(name: string): string {
  return name.replace(' fakulteti', '');
}
