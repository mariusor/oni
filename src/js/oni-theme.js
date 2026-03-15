import {readability, TinyColor} from "@ctrl/tinycolor";
import {average, prominent} from "color.js";
import {ActivityPubItem, getHref} from "./activity-pub-item";
import {css, html, LitElement, nothing, unsafeCSS} from "lit";
import {map} from "lit-html/directives/map.js";
import {generateColorRamp} from "rampensau";

class LightDark {
    light;
    dark;

    constructor(l, d) {
        this.light = l;
        this.dark = d;
    }

    toString() {
        return `light-dark(${tc(this.light).toHexString()}, ${tc(this.dark).toHexString()})`;
    }

    toJSON() {
        return this.toString();
    }
}

export class Palette {
    bgColor;
    fgColor;
    accentColor;
    linkColor;
    linkVisitedColor;

    avgColor;
    tintColor;

    imageURL;
    iconURL;
    isDark;

    // fettepalette objects {dark:[], light:[], base:[], all:[]}
    main= {};

    constructor() {
        const style = getComputedStyle(document.documentElement);

        this.bgColor = style.getPropertyValue('--bg-color').trim();
        this.fgColor = style.getPropertyValue('--fg-color').trim();
        this.accentColor = style.getPropertyValue('--accent-color').trim();
        this.linkColor = style.getPropertyValue('--link-color').trim();
        this.linkVisitedColor = style.getPropertyValue('--link-visited-color').trim();

        if (!this.bgColor) {
            this.bgColor = new LightDark(defaultBgColors.light, defaultBgColors.dark);
        }
        if (!this.fgColor) {
            this.fgColor = new LightDark(defaultBgColors.dark, defaultBgColors.light);
        }
        if (!this.accentColor) {
            this.accentColor = new LightDark(defaultAccentColors.light, defaultAccentColors.dark);
        }

        darkMediaMatch.addEventListener("change", (e) => {
            console.debug(`light/dark preference changed to ${e.matches ? "dark" : "light"} prefersDark?: ${prefersDarkTheme()}`);
        });
    }

    get isLight() {
        return !this.isDark;
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
                palette.fgColor = _palette.fgColor;
                palette.bgColor = _palette.bgColor;
                palette.accentColor = _palette.accentColor;
                palette.linkColor = _palette.linkColor;
                palette.linkVisitedColor = _palette.linkVisitedColor;

                palette.isDark = _palette.isDark;
                palette.main = _palette.main;
                palette.tintColor = _palette.tintColor;
                palette.avgColor = _palette.avgColor;
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

        const palette = new Palette();

        palette.imageURL = apURL(it?.image);
        palette.iconURL = apURL(it?.icon);

        if (!(palette.iconURL || palette.imageURL)) {
            return palette;
        }

        // NOTE(marius): if we have an image, we build the background color from its average
        if (palette.imageURL) {
            const avgCol = await average(palette.imageURL, {format: 'hex'});
            palette.avgColor = avgCol;
            palette.isDark = tc(avgCol).isDark();
            palette.bgColor = getBackgroundFromBase(avgCol);
            console.debug(`loaded image ${palette.imageURL}: (isDark ${palette.isDark}) (bg ${palette.bgColor})`, palette.main);
        }

        let paletteImageURL = palette.imageURL;
        // NOTE(marius): if we have an icon, we build the palette from its most prominent color
        if (palette.iconURL) {
            palette.tintColor = await average(palette.iconURL, {format: 'hex'});
            paletteImageURL = palette.iconURL;
        }
        const paletteColors = asArray(await colorsFromImage(paletteImageURL, 5));
        if (!palette.tintColor) {
            palette.tintColor= paletteColors.filter(noExtremes).sort(bySaturation).at(0);
            console.debug(`loaded image ${paletteImageURL}: (isDark ${tc(palette.tintColor).isDark()}) (accent ${palette.accentColor})`);
        }
        palette.accentColor = getAccentPairFromBase(palette.tintColor);
        palette.main = compoundRamp(palette.tintColor, 9);

        palette.linkColor = getAccentPairFromBase(paletteColors.at(Math.ceil(paletteColors.length/2)+1));
        palette.linkVisitedColor = getAccentPairFromBase(paletteColors.at(Math.floor(paletteColors.length/2)-1));
        console.debug(`palette colors ${paletteImageURL} ${palette.main.length}`, palette.main, `color ${palette.tintColor}`);
        return palette;
    }
}

function getAccentPairFromBase(base) {
    const p = lightDarkPair(base);
    let [l, d] = [tcHSL(p.at(1)), tcHSL(p.at(0))];
    const hBase = tc(base).toHsl();
    if (hBase.s > 0.65) {
        if (hBase.l < 0.40) {
            l = base;
        } else if (hBase.l > 0.60) {
            d = base;
        }
    }
    return new LightDark(l, d);
}

function getBackgroundFromBase(base) {
    const c = new LightDark();
    const p = lightDarkPair(base);
    if (tc(base).isDark()) {
        c.light = tcHSL(p.at(0));
        c.dark = base;
    } else {
        c.light = base;
        c.dark = tcHSL(p.at(1));
    }
    return c;
}

const tcHSL = (hslArr) => Array.isArray(hslArr) ? tc({h:hslArr[0], s:hslArr[1], l:hslArr[2]}).toHexString() : '#ffffee';

const asArray = (colors) => {
    return Array.isArray(colors) ? [...new Set(colors)] : [];
}

const linearH = (x) => x;
const linearS = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const linearL = (x) => -(Math.cos(Math.PI * x) - 1) / 2;

const lightDarkPair = (base) => generateColorRamp({
    total: 4,
    hStart: tc(base).toHsl().h,
    hStartCenter: 0.5,
    hCycles: 0,
    hEasing: linearH,
    sEasing: linearS,
    lEasing: linearL,
    sRange: [1.000, 0.300],
    lRange: [1, 0],
    colorMode: 'hsl',
}).slice(1, 3);

const compoundRamp = (base, count) => generateColorRamp({
    total: count,
    hStart: tc(base).toHsl().h,
    hStartCenter: 0.5,
    hCycles: 1.0,
    hEasing: linearH,
    sEasing: linearS,
    lEasing: linearL,
    sRange: [1.000, 0.300],
    lRange: [1, 0],
    colorMode: 'hsl',
});

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
        if (!this.palette?.main) return nothing;

        const renderColor = (color, contrastColor, label) => {
            return html`
            <div style="background-color: ${color}; color: ${contrastColor}; border: 1px solid ${contrastColor};">
                ${label}${color}:
                <data value="${contrast(color, this.palette.bgColor)}" title="contrast bg">
                    ${contrast(color, this.palette.bgColor).toFixed(2)}
                </data>
                :
                <data value="${tc(color).toHsl().h}" title="hue">
                    ${tc(color).toHsl().h.toFixed(2)}
                </data>
                :
                <data value="${tc(color).toHsl().s}" title="saturation">
                    ${tc(color).toHsl().s.toFixed(2)}
                </data>
                :
                <data value="${tc(color).toHsl().l}" title="luminance">
                    ${tc(color).toHsl().l.toFixed(2)}
                </data>
                :
                <data value="${tc(color).getBrightness()}" title="brightness">
                    ${tc(color).getBrightness().toFixed(2)}
                </data>
            </div>
        `;
        }

        const colorPalette = (palette) => html`
            <div>${map(palette??[], color => renderColor(tcHSL(color), palette.fgColor))}</div>
        `;

        return html`
            ${renderColor(this.palette.bgColor, this.palette.fgColor, html`<b>Background:</b> `)}
            ${renderColor(this.palette.fgColor, this.palette.bgColor, html`<b>Foreground:</b> `)}
            ${renderColor(this.palette.accentColor, this.palette.bgColor, html`<b>Accent:</b> `)}
            ${renderColor(this.palette.linkColor, this.palette.bgColor, html`<b>Link:</b> `)}
            ${renderColor(this.palette.linkVisitedColor, this.palette.bgColor, html`<b>Visited Link:</b> `)}
            ${renderColor(this.palette.tintColor, this.palette.avgColor)}
            ${renderColor(this.palette.avgColor, this.palette.tintColor)}
            <div class="colors">${html`${colorPalette(this.palette.main)}`}</div>`;
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

const colorsFromImage = (url, amount) => prominent(url, {amount: amount || 10, group: 40, format: 'hex'});

const /* filter */ onLightness = (min, max) => (col) => {
    const hsl = tc(col)?.toHsl();
    return hsl?.l >= (min || 0) && hsl?.l <= (max || 1);
}
const /* filter */ isLight = (col) => tc(col)?.getBrightness() > 80;

const /* filter */ isDark = (col) => tc(col)?.getBrightness() < 140;

const /* filter */ onSaturation = (min, max) => (col) => {
    const hsl = tc(col)?.toHsl();
    return hsl?.s >= (min || 0) && hsl?.s <= (max || 1);
}

const /* filter */ wcagAAA = (base) => (col) => contrast(col, base) >= 7
const /* filter */ wcagAA = (base) => (col) => contrast(col, base) >= 4.5
const /* filter */ linkContrast = (base) => (col) => contrast(col, base) >= 3.2

const /* filter */ onContrastTo = (base, min, max) => (col) => {
    const con = contrast(col, base);
    return con >= (min || 0) && con <= (max || 21)
};
const /*filter */ noExtremes = (col) => {
    col = tc(col);
    return col.getBrightness() < 230 && col.getBrightness() > 30;
}
const /* filter */ not = (c, diff) => (n) => Math.abs(colorDiff(c, n)) >= (diff || 0.5);
const /*filter */ notLightDark = (c, diff) => (n) => not(c.light, diff)(n) && not(c.dark, diff)(n)

const /* sort */ byBrightness = (a, b) => tc(b).getBrightness() - tc(a).getBrightness()
const /* sort */ byContrastTo = (base) => (a, b) => contrast(b, base) - contrast(a, base);
const /* sort */ bySaturation = (a, b) => tc(b).toHsv().s - tc(a).toHsv().s;
const /* sort */ byDiffTo = (base) => (a, b) => Math.abs(colorDiff(a, base)) - Math.abs(colorDiff(b, base));

const defaultBgColors = new LightDark('#EFF0F1','#232627');
const defaultAccentColors = new LightDark('#663399', '#9370DB');

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
