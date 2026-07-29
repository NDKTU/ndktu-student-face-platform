/** Префикс кода группы из названия специальности: «Dasturiy injiniring» → «DI». */
export function namePrefix(name: string): string {
  const words = name.split(/\s+/);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return name.slice(0, 3).toUpperCase();
}
