# Style Guide

The package has no user interface; these colors apply to badges, diagrams and
any demo or documentation page built for the project.

## Colors

| Usage | Color | Hex | Contrast on `#ffffff` |
|-------|-------|-----|-----------------------|
| Primary | Blue | `#2563eb` | 5.17:1 |
| Success | Green | `#15803d` | 5.02:1 |
| Warning | Amber | `#b45309` | 5.02:1 |
| Error | Red | `#dc2626` | 4.83:1 |
| Text | Gray | `#1f2937` | 14.68:1 |
| Background | White | `#ffffff` | - |

Every foreground color reaches the WCAG 2.2 AA minimum of 4.5:1 for normal text
on the white background (success and warning were darkened from `#16a34a`
(3.30:1) and `#d97706` (3.19:1), which only passed for large text). Never
signal state by color alone: pair it with text or an icon.

## Text over photos

The website hero sets its text on a photo (`site/templates/xslt-site/images/hero/`).
Text never sits on the bare image: a scrim of the page background colour
(`#ffffff` light, `#202124` dark) at 92% opacity or more covers it, and it
thins out only where there is no text. At 92% the weakest pair still passes
WCAG 2.2 AA against the brightest or darkest pixel of the photo: muted text
`#5f6368` reaches 5.06:1 in light mode and `#9aa0a6` 4.80:1 in dark mode.
A new background photo needs the same check over all of its pixels before it
ships; lower the opacity only if the numbers allow it.
