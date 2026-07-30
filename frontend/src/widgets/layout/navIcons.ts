/**
 * Иконки разделов меню. Извлечены из inline-SVG прототипа — не рисовать заново,
 * иначе разъедется пиксельная сверка.
 */
export interface IconShape {
  tag: string;
  attrs: Record<string, string>;
}

export const NAV_ICONS: Record<string, IconShape[]> = {
  bosh: [
    { tag: "path", attrs: { "d": "M3 10.5 12 3l9 7.5" } },
    { tag: "path", attrs: { "d": "M5 9.5V21h14V9.5" } },
    { tag: "path", attrs: { "d": "M9.5 21v-6.5h5V21" } },
  ],
  tfanlarim: [
    { tag: "path", attrs: { "d": "M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2 2 2 0 0 1 2-2h4.5A1.5 1.5 0 0 1 20 5.5V18a1 1 0 0 1-1 1h-5.5a1.5 1.5 0 0 0-2.9 0H5a1 1 0 0 1-1-1z" } },
    { tag: "path", attrs: { "d": "M12 6v13" } },
  ],
  tuzilma: [
    { tag: "rect", attrs: { "x": "8.5", "y": "3", "width": "7", "height": "5", "rx": "1.3" } },
    { tag: "rect", attrs: { "x": "2.5", "y": "15.5", "width": "7", "height": "5", "rx": "1.3" } },
    { tag: "rect", attrs: { "x": "14.5", "y": "15.5", "width": "7", "height": "5", "rx": "1.3" } },
    { tag: "path", attrs: { "d": "M12 8v3.5M12 11.5H6v4M12 11.5h6v4" } },
  ],
  fanlar: [
    { tag: "path", attrs: { "d": "M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" } },
    { tag: "path", attrs: { "d": "M5 19.5A1.5 1.5 0 0 1 6.5 21H19" } },
    { tag: "path", attrs: { "d": "M9 7.5h6M9 11h6" } },
  ],
  reja: [
    { tag: "rect", attrs: { "x": "3.5", "y": "4.5", "width": "17", "height": "16", "rx": "2.2" } },
    { tag: "path", attrs: { "d": "M3.5 9h17M8 3v3.5M16 3v3.5M7.5 13h3M7.5 16.5h6" } },
  ],
  savollar: [
    { tag: "circle", attrs: { "cx": "12", "cy": "12", "r": "9" } },
    { tag: "path", attrs: { "d": "M9.3 9.2a2.7 2.7 0 0 1 5.3 1c0 1.8-2.6 2.2-2.6 3.6" } },
    { tag: "path", attrs: { "d": "M12 17.4h.01" } },
  ],
  testlar: [
    { tag: "path", attrs: { "d": "M8 3h6l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" } },
    { tag: "path", attrs: { "d": "M13 3v5h5" } },
    { tag: "path", attrs: { "d": "m9.3 14 1.7 1.7 3.2-3.4" } },
  ],
  kurslar: [
    { tag: "rect", attrs: { "x": "3", "y": "4", "width": "7", "height": "7", "rx": "1.3" } },
    { tag: "rect", attrs: { "x": "14", "y": "4", "width": "7", "height": "7", "rx": "1.3" } },
    { tag: "rect", attrs: { "x": "3", "y": "15", "width": "7", "height": "5", "rx": "1.3" } },
    { tag: "rect", attrs: { "x": "14", "y": "15", "width": "7", "height": "5", "rx": "1.3" } },
  ],
  tvazlar: [
    { tag: "path", attrs: { "d": "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" } },
    { tag: "path", attrs: { "d": "M8 5H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2" } },
    { tag: "path", attrs: { "d": "m9.5 13 2 2 4-4" } },
  ],
  avazlar: [
    { tag: "path", attrs: { "d": "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" } },
    { tag: "path", attrs: { "d": "M8 5H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2" } },
    { tag: "path", attrs: { "d": "m9.5 13 2 2 4-4" } },
  ],
  reyting: [
    { tag: "path", attrs: { "d": "M8 21h8M12 17v4" } },
    { tag: "path", attrs: { "d": "M7 4h10v5a5 5 0 0 1-10 0z" } },
    { tag: "path", attrs: { "d": "M7 5H5v2a3 3 0 0 0 2.4 2.9M17 5h2v2a3 3 0 0 1-2.4 2.9" } },
  ],
  guruhim: [
    { tag: "circle", attrs: { "cx": "9", "cy": "8", "r": "3.2" } },
    { tag: "path", attrs: { "d": "M3.5 19c0-3.2 2.6-5 5.5-5s5.5 1.8 5.5 5" } },
    { tag: "path", attrs: { "d": "M16 5.5a3 3 0 0 1 0 5.6M17.5 19c0-2.2-.8-3.8-2-4.6" } },
  ],
  fanlarim: [
    { tag: "path", attrs: { "d": "M12 4 3 8l9 4 9-4z" } },
    { tag: "path", attrs: { "d": "M3 13l9 4 9-4" } },
  ],
  stestlar: [
    { tag: "path", attrs: { "d": "M8 3h6l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" } },
    { tag: "path", attrs: { "d": "M13 3v5h5" } },
    { tag: "path", attrs: { "d": "m9.3 14 1.7 1.7 3.2-3.4" } },
  ],
  svazlar: [
    { tag: "path", attrs: { "d": "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" } },
    { tag: "path", attrs: { "d": "M8 5H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2" } },
    { tag: "path", attrs: { "d": "m9.5 13 2 2 4-4" } },
  ],
  foydalanuvchilar: [
    { tag: "circle", attrs: { "cx": "9", "cy": "8", "r": "3.2" } },
    { tag: "path", attrs: { "d": "M3.5 19c0-3.2 2.6-5 5.5-5s5.5 1.8 5.5 5" } },
    { tag: "path", attrs: { "d": "M16 5.5a3 3 0 0 1 0 5.6M17.5 19c0-2.2-.8-3.8-2-4.6" } },
  ],
  rollar: [
    { tag: "path", attrs: { "d": "M12 3 5 6v5c0 4.4 3 7.4 7 8.8 4-1.4 7-4.4 7-8.8V6z" } },
    { tag: "path", attrs: { "d": "m9 12 2 2 4-4" } },
  ],
  hemis: [
    { tag: "path", attrs: { "d": "M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z" } },
    { tag: "path", attrs: { "d": "M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7" } },
    { tag: "path", attrs: { "d": "M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" } },
  ],
  sozlamalar: [
    { tag: "circle", attrs: { "cx": "12", "cy": "12", "r": "3" } },
    { tag: "path", attrs: { "d": "M19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" } },
  ],
};
