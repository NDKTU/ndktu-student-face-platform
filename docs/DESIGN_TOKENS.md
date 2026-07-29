# NDKTU LMS — Design tokens

Extracted from the Claude Design export (`design-reference.html`). These are the
**actual** values used in the approved prototype — do not substitute approximations.

## Fonts
- UI: `'Plus Jakarta Sans', system-ui, -apple-system, sans-serif`
- Mono (permission strings like `lms:read`, PIN codes): `'JetBrains Mono', monospace`
- Weights in use: 500, 600, 700, 800

## Colors

### Brand
| Token | Hex | Use |
|---|---|---|
| `primary` | `#2836C7` | primary buttons, active nav, links, accents |
| `primary-dark` | `#1B2596` | hover/pressed on primary |
| `primary-tint` | `#EDEFFC` | active nav background, hover on nav items |
| `primary-tint-2` | `#C9CEF0` | subtle borders/fills on primary surfaces |

### Neutrals
| Token | Hex | Use |
|---|---|---|
| `bg` | `#FFFFFF` | page/card background |
| `surface` | `#F4F5FA` | app background behind cards |
| `surface-2` | `#F8F9FE` | table header rows, subtle fills |
| `border` | `#E3E5F0` | all borders and dividers |
| `border-2` | `#EEF0F6` | lighter inner dividers |
| `text` | `#1A1C2E` | primary text |
| `text-2` | `#4A4E66` | secondary text |
| `text-3` | `#6B6E82` | tertiary / labels |
| `text-muted` | `#9498AD` | placeholders, meta, disabled |
| `stroke-muted` | `#C4C8DC` | muted icon strokes |

### Status
| Token | Hex | Use |
|---|---|---|
| `success` | `#157A43` | Faol, To'g'ri, Baholangan |
| `success-bg` | `#EDF7EE` | success chip background |
| `danger` | `#C4363B` | Muddati o'tgan, Xato, delete |
| `danger-bg` | `#FDECEC` | danger chip background |
| `warning` | `#B45309` | Akademik ta'til, Sirtqi |

## Radii
`8px` `9px` `10px` `11px` `12px` `16px` `18px` `20px`
- Buttons / nav items / inputs: **10–11px**
- Cards: **16px**
- Chips / pills: **20px** (fully rounded)

## Shadows
| Use | Value |
|---|---|
| Card resting | `0 1px 2px rgba(26,28,46,.04)` |
| Focus ring | `0 0 0 3px rgba(40,54,199,.12)` |
| Primary button | `0 2px 8px rgba(40,54,199,.28)` |
| Dropdown / popover | `0 14px 36px rgba(26,28,46,.18)` |
| Modal | `0 30px 70px rgba(20,22,40,.4)` |

## Type scale (px)
`11` `12` `13` `14` `15` `16` `17` `18` `20` `24`
- Body / table cells: **14**
- Labels, meta, chips: **12–13**
- Section headings: **17–20**
- Page titles: **24**

## Transitions
`background .14s` on interactive elements. Nav items hover to `#EDEFFC`.
