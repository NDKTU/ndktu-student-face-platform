import type { FacultyColor } from '../model/types';

/**
 * Палитра карточек факультетов. Это оформление, а не данные: цвет из БД
 * приходит не всегда, и тогда карточка берёт значение отсюда по индексу.
 */
export const FACULTY_COLORS: readonly FacultyColor[] = [
  {
    "bg": "#E7E9FB",
    "fg": "#2836C7"
  },
  {
    "bg": "#FBEEDD",
    "fg": "#B45309"
  },
  {
    "bg": "#DBF1F2",
    "fg": "#0E7C86"
  },
  {
    "bg": "#DDF3E6",
    "fg": "#157A43"
  },
  {
    "bg": "#EEE7FB",
    "fg": "#6D28D9"
  },
  {
    "bg": "#FBE4EB",
    "fg": "#A33254"
  }
];
