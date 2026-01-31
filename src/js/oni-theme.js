import {readability, TinyColor} from "@ctrl/tinycolor";
import {average, prominent} from "color.js";
import {ActivityPubItem, getHref} from "./activity-pub-item";
import {css, html, LitElement, nothing, unsafeCSS} from "lit";
import {map} from "lit-html/directives/map.js";

class LightDark {
    light;
    dark;

    toString() {
        return `light-dark(${tc(this.light).toHexString()}, ${tc(this.dark).toHexString()})`;
    }

    toJSON() {
        return this.toString();
    }
}

function fgColor(col) {
    col = tc(col)?.desaturate(10)?.toHexString() || col;
    const bgColor = lightDarkFromColor(col);
    const fgColor = new LightDark();
    [fgColor.light, fgColor.dark] = [bgColor.dark, bgColor.light];
    return fgColor;
}

function bgColor(col) {
    col = tc(col)?.desaturate(10)?.toHexString() || col;
    return lightDarkFromColor(col);
}

function lightDarkFromColor(col) {
    const c = tc(col);
    console.debug(`received ${c.toHexString()}, brightness: ${c.getBrightness()} isLight: ${c.isLight()}, isDark: ${c.isDark()}`)
    const result = new LightDark();
    // NOTE(marius): we divide by 2.55 to get directly the percentage value passable to lighten()/darken()
    const oppositeLightnessAmount = Math.abs(c.getBrightness()-128) / 2.55;
    if (c.isLight()) {
        result.light = c.toHexString();
        result.dark = c.darken(2*oppositeLightnessAmount).toHexString();
        console.debug(`computed ${oppositeLightnessAmount} dark-color: ${tc(result.dark).toHexString()}, brightness: ${tc(result.dark).getBrightness()}`)
    }  else {
        result.dark = c.toHexString();
        result.light = c.lighten(2*oppositeLightnessAmount).toHexString();
        console.debug(`computed ${oppositeLightnessAmount} light-color: ${tc(result.light).toHexString()}, brightness: ${tc(result.light).getBrightness()}`)
    }
    return result;
}

export class Palette {
    bgColor;
    fgColor;
    accentColor;
    linkColor;
    linkVisitedColor;
    imageURL;
    iconURL;
    imageColors = [];
    iconColors = [];

    constructor() {
        const style = getComputedStyle(document.documentElement);

        this.bgColor = style.getPropertyValue('--bg-color').trim();
        this.fgColor = style.getPropertyValue('--fg-color').trim();
        this.accentColor = style.getPropertyValue('--accent-color').trim();
        this.linkColor = style.getPropertyValue('--link-color').trim();
        this.linkVisitedColor = style.getPropertyValue('--link-visited-color').trim();

        darkMediaMatch.addEventListener("change", (e) => {
            console.debug(`it is ${e.matches ? "dark" : "light"} prefersDark?: ${prefersDarkTheme()}`);
        });
    }

    matchItem(it) {
        if (!it) return false;

        const imageURL = apURL(it?.image);
        const iconURL = apURL(it?.icon);

        const imageIsNull = this.imageURL?.length === 0 && !imageURL;
        const imageIsSame = this.imageURL === imageURL;
        const imageValid = imageIsNull || imageIsSame;

        const iconIsNull = this.iconURL?.length === 0 && !iconURL;
        const iconIsSame = this.iconURL === iconURL;
        const iconValid = iconIsNull || iconIsSame;

        return imageValid && iconValid;
    }

    setRootStyles() {
        const root = document.documentElement;
        root.style.setProperty('--fg-color', this.fgColor);
        root.style.setProperty('--bg-color', this.bgColor);
        root.style.setProperty('--accent-color', this.accentColor);
        root.style.setProperty('--link-color', this.linkColor);
        root.style.setProperty('--link-visited-color', this.linkVisitedColor);
    }

    static fromStorage() {
        const storedPalette = localStorage.getItem('palette');
        const palette = new Palette();
        if (storedPalette) {
            const _palette = JSON.parse(storedPalette);
            if (_palette) {
                palette.imageURL = _palette.imageURL;
                palette.iconURL = _palette.iconURL;
                palette.fgColor = _palette.fgColor;
                palette.bgColor = _palette.bgColor;
                palette.accentColor = _palette.accentColor;
                palette.linkColor = _palette.linkColor;
                palette.linkVisitedColor = _palette.linkVisitedColor;
                palette.iconColors = _palette.iconColors;
                palette.imageColors = _palette.imageColors;
            }
        }
        return palette;
    }

    renderThinHeaderBackground() {
        this.setRootStyles();
        if (!this.imageURL) return nothing;
        // NOTE(marius): in the header we want a different gradient, with fewer steps
        return unsafeCSS(`
            :host header {
                --c: var(--bg-color);
                background-image: linear-gradient(lch(from var(--c) l c h / 0.2), lch(from var(--c) l c h / 0.7), lch(from var(--c) l c h)), url(${this.imageURL});
            }
        `);
    }

    renderHeaderBackground() {
        this.setRootStyles();
        if (!this.imageURL) return nothing;
        return unsafeCSS(`
            :host header {
                --c: var(--bg-color);
                background-image: linear-gradient(lch(from var(--c) l c h / 0.1), lch(from var(--c) l c h / 0.2), lch(from var(--c) l c h / 0.2), lch(from var(--c) l c h / 0.3), lch(from var(--c) l c h)), url(${this.imageURL});
            }
        `);
    }

    static toStorage(palette) {
        localStorage.setItem('palette', JSON.stringify(palette));
    }

    static async fromActivityPubItem(it) {
        if (!ActivityPubItem.isValid(it)) return null;

        const imageURL = apURL(it?.image);
        const iconURL = apURL(it?.icon);

        const palette = new Palette();

        if (imageURL) {
            const colorCount = 20;
            palette.imageURL = imageURL;
            palette.imageColors = (await colorsFromImage(imageURL, colorCount));
            const avgCol = await average(imageURL, {format: 'hex'});
            palette.bgColor = bgColor(avgCol);
            console.debug(`loaded image ${palette.imageURL}: (bg ${palette.bgColor})`, palette.imageColors);
        }

        if (iconURL) {
            const colorCount = 20;
            palette.iconURL = iconURL;
            palette.iconColors = (await colorsFromImage(iconURL, colorCount));
            const avgCol = await average(iconURL, {format: 'hex'});
            palette.fgColor = fgColor(avgCol);
            console.debug(`loaded icon ${palette.iconURL}: (avg ${palette.fgColor}) brightness(l:${tc(palette.fgColor.light).getBrightness()}, d:${tc(palette.fgColor.dark).getBrightness()})`, palette.iconColors);
        }

        let colors = palette.imageColors;
        if (palette.iconColors.length > 0) {
            colors = palette.iconColors;
        }
        palette.accentColor = getAccentColor(colors, palette.bgColor);
        palette.linkColor = getLinkColor(colors, palette.bgColor);

        palette.linkVisitedColor = new LightDark();
        palette.linkVisitedColor.light = tc(palette.linkColor.light).darken(40).toHexString();
        palette.linkVisitedColor.dark = tc(palette.linkColor.dark).lighten(40).toHexString();

        return palette;
    }
}

export class PaletteElement extends LitElement {
    static styles = [css`
        div {
            padding: .2rem .5rem; 
            font-size: .6rem;
        }
        div.colors {
            padding: 0;
            display: flex;
            gap: 2px;
            flex-wrap: wrap;
        }
        div.colors div {
            flex: 1 1 220px;
        }
    `];

    static properties = {
        palette: {type: Palette},
    }

    constructor() {
        super();
        this.palette = null;
    }

    render() {
        this.palette = this.palette || Palette.fromStorage();

        if (!this.palette) return nothing;
        if (this.palette?.iconColors?.length+this.palette?.imageColors?.length === 0) return nothing;

        const renderColor = (color, contrastColor, label) => html`
            <div style="background-color: ${color}; color: ${contrastColor}; border: 1px solid ${contrastColor};">
                ${label}${color}: <data value="${contrast(color, this.palette.bgColor)}" title="contrast bg">
                    ${contrast(color, this.palette.bgColor).toFixed(2)}
                </data>:<data value="${tc(color).toHsl().h}" title="hue">
                    ${tc(color).toHsl().h.toFixed(2)}
                </data>:<data value="${tc(color).toHsl().s}" title="saturation">
                    ${tc(color).toHsl().s.toFixed(2)}
                </data>:<data value="${tc(color).toHsl().l}" title="luminance">
                    ${tc(color).toHsl().l.toFixed(2)}
                </data>
            </div>
        `;

        const colorMap = (colors) => {
            return html`
                ${map(colors, color => {
                    const contrastColor = mostReadable([this.palette.fgColor, this.palette.bgColor], color);
                    return renderColor(color, contrastColor);
                })}
            `;
        }
        return html`
            ${renderColor(this.palette.bgColor, this.palette.fgColor, html`<b>Background:</b> `)}
            ${renderColor(this.palette.fgColor, this.palette.bgColor, html`<b>Foreground:</b> `)}
            ${renderColor(this.palette.accentColor, this.palette.bgColor, html`<b>Accent:</b> `)}
            ${renderColor(this.palette.linkColor, this.palette.bgColor, html`<b>Link:</b> `)}
            ${renderColor(this.palette.linkVisitedColor, this.palette.bgColor, html`<b>Visited Link:</b> `)}
            <div class="colors">
                ${when(this.palette.iconColors.length > 0,
                        () => html`${colorMap(this.palette.iconColors.toSorted(byContrastTo(this.palette.bgColor)))}`,
                        () => nothing,
                )}
                <hr style="width: 100%"/>
                ${when(this.palette.imageColors.length > 0,
                        () => html`${colorMap(this.palette.imageColors.toSorted(byContrastTo(this.palette.bgColor)))}`,
                        () => nothing,
                )}
            </div>
        `;
    }
}

const tc = (c) => new TinyColor(c);
export const contrast = readability;

const darkMediaMatch = window.matchMedia('(prefers-color-scheme: dark)')
export const prefersDarkTheme = () => !!(darkMediaMatch?.matches);

const smallScreenMediaMatch = window.matchMedia('(width <= 576px)')
export const smallScreen = () => !!(smallScreenMediaMatch?.matches);

const mediumScreenMediaMatch = window.matchMedia('(width <= 1920px)')
export const mediumScreen = () => !!(mediumScreenMediaMatch?.matches);

const largeScreenMediaMatch = window.matchMedia('(width > 1920px)')
export const largeScreen = () => !!(largeScreenMediaMatch?.matches);

const colorsFromImage = (url, amount) => prominent(url, {amount: amount || 10, group: 12, format: 'hex'});

const /* filter */ onLightness = (min, max) => (col) => {
    const hsl = tc(col)?.toHsl();
    return hsl?.l >= (min || 0) && hsl?.l <= (max || 1);
}
const /* filter */ isLight = () => (col) => {
    return tc(col)?.getBrightness() >= 132;
}
const /* filter */ isDark = () => (col) => {
    return tc(col)?.getBrightness() < 126;
}
const /* filter */ onSaturation = (min, max) => (col) => {
    const hsl = tc(col)?.toHsl();
    return hsl?.s >= (min || 0) && hsl?.s <= (max || 1);
}

const /* filter */ onContrastTo = (base, min, max) => (col) => {
    const con = contrast(col, base);
    return con >= (min || 0) && con <= (max || 21)
};
const /* filter */ not = (c, diff) => (n) => Math.abs(colorDiff(c, n)) >= (diff || 0.5);

const /* sort */ byContrastTo = (base) => (a, b) => contrast(b, base) - contrast(a, base);
const /* sort */ bySaturation = (a, b) => tc(b).toHsv().s - tc(a).toHsv().s;
const /* sort */ byDiff = (base) => (a, b) => Math.abs(colorDiff(a, base)) - Math.abs(colorDiff(b, base));

const defaultFgColors = ['#EFF0F1', '#232627'];

function getFgColor(colors, toColor, wantsDark) {
    colors = Array.isArray(colors) ? [... new Set(colors)] : [];

    colors = [... new Set([...defaultFgColors, ...colors])];
    const fgColors = colors
        .filter(onSaturation(0, 0.3))
        .filter(onContrastTo(toColor, 5, 19))
        .sort(byContrastTo(toColor));

    wantsDark = typeof wantsDark == 'undefined' ? prefersDarkTheme() : wantsDark;
    let most;
    if (fgColors.length > 0) {
        most = fgColors.at(0);
    } else {
        if (wantsDark) {
            most =  defaultFgColors[1];
        } else {
            most = defaultFgColors[0];
        }
    }
    most = tc(most).mix(toColor, 30);

    console.debug(`filtered fg colors`, fgColors);
    console.debug(`dark theme: ${wantsDark}, most readable to ${toColor} is ${most.toHexString()}: ${contrast(most, toColor)}`);
    return most.toHexString();
}

function mostReadable(colors, toColor) {
    colors = Array.isArray(colors) ? colors : [colors];

    colors = colors.filter(onContrastTo(toColor, 4, 21))
        .sort(byContrastTo(toColor));

    return tc(colors.at(0));
}

function getClosestColor(colors, color, onColor) {
    colors = Array.isArray(colors) ? colors : [colors];

    colors = colors
        .filter(onContrastTo(onColor, 3, 7))
        .sort(byDiff(color))
        .reverse();

    const most = colors.at(0);
    console.debug(`most readable to ${onColor} and closest to ${color} is ${most}: ${contrast(most, onColor)}`);
    return most;
}

const linkColors = (colors, toColor) => colors
    .filter(onContrastTo(toColor, 2.8, 19))
    .sort((a, b) => bySaturation(a, b) || byContrastTo(toColor)(a, b))
    .reverse();

function getLinkColor(colors, toColor) {
    colors = Array.isArray(colors) ? colors : [colors];

    const lightColors = linkColors(colors.filter(isLight), toColor.light);
    const darkColors = linkColors(colors.filter(isDark), toColor.dark);

    console.debug(`link colors dark(${darkColors.at(0)}) light(${lightColors.at(0)})`)
    const result = new LightDark();
    result.light = saturatedFromColor(lightColors.at(0), toColor.light, false).toHexString();
    result.dark = saturatedFromColor(darkColors.at(0), toColor.dark, true).toHexString();
    return result;
}

function getAccentColor(colors, contrastTo) {
    colors = Array.isArray(colors) ? colors : [colors];

    const lightColors = colors.filter(isLight).sort((a, b) => byContrastTo(contrastTo.light)(a, b) || bySaturation(a, b)).reverse();
    const darkColors = colors.filter(isDark).sort((a, b) => byContrastTo(contrastTo.dark)(a, b) || bySaturation(a, b)).reverse();

    console.debug(`accent colors dark(${darkColors.at(0)}) light(${lightColors.at(0)})`)
    const result = new LightDark();
    result.light = saturatedFromColor(lightColors.at(0), contrastTo.light, false).toHexString();
    result.dark = saturatedFromColor(darkColors.at(0), contrastTo.dark, true).toHexString();
    return result;
}

const maxBgSaturation = 0.45;
const minContrast = 4.8;

function saturatedFromColor(original, contrastTo, wantsDark) {
    let color = tc(original).clone();

    wantsDark = typeof wantsDark == 'undefined' ? prefersDarkTheme() : wantsDark;
    const maxIter = 50;
    let cnt = 0;

    do {
        color = color.saturate(5);
        if (wantsDark) {
            color = color.lighten(2);
        } else {
            color = color.darken(2);
        }
        cnt++;
    } while (contrast(contrastTo, color) < minContrast && cnt < maxIter)

    return color;
}

function changeDarkness(origColor, contrastTo, wantsDark) {
    let finalColor = tc(origColor);
    if (finalColor.toHsl().s > maxBgSaturation) {
        finalColor = finalColor.desaturate(100*Math.abs(finalColor.toHsl().s - maxBgSaturation));
    }

    wantsDark = typeof wantsDark == 'undefined' ? prefersDarkTheme() : wantsDark;
    const maxIter = 20;
    let cnt = 0;
    do {
        if (wantsDark) {
            finalColor = finalColor.lighten(2);
        } else {
            finalColor = finalColor.darken(2);
        }
        cnt++;
    } while(contrast(contrastTo, finalColor) < minContrast && cnt < maxIter)

    return finalColor.toHexString();
}

// formulas from : https://www.easyrgb.com/en/math.php
function toXYZ(col) {
    col = tc(col)?.toRgb();
    col = {
        r: col.r / 255,
        g: col.g / 255,
        b: col.b / 255,
    }

    const convVal = (v) => 100 * (v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92);

    return {
        x: convVal(col.r) * 0.4124 + convVal(col.g) * 0.3576 + convVal(col.b) * 0.1805,
        y: convVal(col.r) * 0.2126 + convVal(col.g) * 0.7152 + convVal(col.b) * 0.0722,
        z: convVal(col.r) * 0.0193 + convVal(col.g) * 0.1192 + convVal(col.b) * 0.9505,
    }
}

function xyzToLab(col) {
    // Data from https://en.wikipedia.org/wiki/Illuminant_D65#Definition using a standard 2° observer
    const refX = 95.04;
    const refY = 100;
    const refZ = 108.88;

    const convVal = (v) => (v > 0.008856) ? Math.pow(v, 1 / 3) : (7.787 * v) + (16 / 116);

    let x = convVal(col.x / refX);
    let y = convVal(col.y / refY);
    let z = convVal(col.z / refZ);

    return {
        L: (116 * y) - 16,
        a: 500 * (x - y),
        b: 200 * (y - z),
    }
}

export function colorDiff(c1, c2) {
    c1 = xyzToLab(toXYZ(tc(c1)?.toRgb()));
    c2 = xyzToLab(toXYZ(tc(c2)?.toRgb()));
    return Math.sqrt(Math.pow(c2.a, 2) + Math.pow(c2.b, 2)) -
        Math.sqrt(Math.pow(c1.a, 2) + Math.pow(c1.b, 2))
}

function apURL(ob) {
    if (typeof ob === 'object' && ob !== null) {
        return getHref(ob);
    }
    return ob
}
