import {readability, TinyColor} from "@ctrl/tinycolor";
import {average, prominent} from "color.js";
import {ActivityPubItem, getHref} from "./activity-pub-item";
import {css, html, LitElement, nothing, unsafeCSS} from "lit";
import {map} from "lit-html/directives/map.js";
import {isMainPage} from "./utils";
import {when} from "lit-html/directives/when.js";

export class Palette {
    bgColor;
    fgColor;
    accentColor;
    linkColor;
    linkVisitedColor;
    imageURL;
    iconURL;
    colorScheme;
    imageColors = [];
    iconColors = [];

    constructor() {
        const style = getComputedStyle(document.documentElement);

        this.bgColor = style.getPropertyValue('--bg-color').trim();
        this.fgColor = style.getPropertyValue('--fg-color').trim();
        this.accentColor = style.getPropertyValue('--accent-color').trim();
        this.linkColor = style.getPropertyValue('--link-color').trim();
        this.colorScheme = prefersDarkTheme() ? 'dark' : 'light';
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
        root.style.accentColor = this.accentColor;
        root.style.backgroundColor = this.bgColor;
        root.style.color = this.fgColor;
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
                palette.colorScheme = _palette.colorScheme;
                palette.iconColors = _palette.iconColors;
                palette.imageColors = _palette.imageColors;
            }
        }
        return palette;
    }

    renderStyles() {
        this.setRootStyles();
        const col = tc(this.bgColor);
        return unsafeCSS(`
            :host header {
                background-size: cover;
                background-clip: padding-box;
                background-position: center;
                background-image: linear-gradient(${col.setAlpha(0.1).toRgbString()}, ${col.setAlpha(0.5).toRgbString()}, ${col.setAlpha(1).toRgbString()}), url(${this.imageURL});
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

        let avgColor = palette.bgColor;

        if (iconURL) {
            let colorCount = 5;
            palette.iconURL = iconURL;
            if (!imageURL) {
                colorCount = 10;
            }
            palette.iconColors = (await colorsFromImage(iconURL, colorCount));
            avgColor = await average(iconURL, {format: 'hex'});
            // console.debug(`loaded icon colors (avg ${avgColor}) ${palette.iconURL}:`, palette.iconColors);
        }

        if (imageURL) {
            palette.imageURL = imageURL;
            palette.imageColors = (await colorsFromImage(imageURL, 20));
            avgColor = await average(imageURL, {format: 'hex'});
            // console.debug(`loaded image colors (avg ${avgColor}) ${palette.imageURL}:`, palette.imageColors);
        }

        if (avgColor) {
            const maxBgSaturation = 0.45;

            let tgBg = tc(avgColor);
            if (tgBg.toHsl().s > maxBgSaturation) {
                tgBg = tgBg.desaturate(100*Math.abs(tgBg.toHsl().s - maxBgSaturation));
                if (prefersDarkTheme()) {
                    tgBg.lighten(10);
                } else {
                    tgBg.darken(10);
                }
            }
            palette.bgColor = tgBg.toHexString();
            palette.colorScheme = tc(avgColor).isDark() ? 'dark' : 'light';
        }

        let paletteColors = [... new Set([...palette.imageColors, ...palette.iconColors])];
        if (paletteColors.length > 0) {
            console.debug(`colors for fg`, paletteColors);
            palette.fgColor = getFgColor(paletteColors, palette.bgColor)
                || palette.fgColor;
            paletteColors = paletteColors.filter(color => color !== palette.fgColor);

            console.debug(`colors for accent`, paletteColors);
            palette.accentColor = getAccentColor(paletteColors, palette.bgColor)
                || palette.accentColor;
            paletteColors = paletteColors.filter(color => color !== palette.accentColor);

            console.debug(`colors for link`, paletteColors);
            palette.linkColor = getAccentColor(paletteColors, palette.bgColor)
                || tc(palette.fgColor).mix(palette.accentColor, 80).toHexString();
            paletteColors = paletteColors.filter(color => color !== palette.linkColor);

            console.debug(`colors for visited link`, paletteColors);
            palette.linkVisitedColor = getAccentColor(paletteColors, palette.bgColor)
                || tc(palette.linkColor).darken(10).toHexString();
        }

        return palette;
    }
}

export class PaletteElement extends LitElement {
    static styles = [css`
        div.colors {
            display: flex;
            gap: 2px;
            flex-wrap: wrap;
            flex-basis: content;
        }
        div.colors div {
            width: 220px;
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
        if (!isMainPage()) return nothing;
        if (!window.location.hostname.endsWith('local')) return nothing;
        if (this.palette?.iconColors?.length+this.palette?.imageColors?.length === 0) return nothing;

        const renderColor = (color, contrastColor, label) => html`
            <div style="padding: .2rem 1rem; background-color: ${color}; color: ${contrastColor}; border: 1px solid ${contrastColor}; font-size:.7rem;">
                ${label}${color}: <data value="${colorDiff(color, this.palette.bgColor)}" title="diff">
                    ${colorDiff(color, this.palette.bgColor).toFixed(2)}
                </data>:<data value="${contrast(color, this.palette.bgColor)}" title="contrast bg">
                    ${contrast(color, this.palette.bgColor).toFixed(2)}
                </data>:<data value="${contrast(color, this.palette.fgColor)}" title="contrast fg">
                    ${contrast(color, this.palette.fgColor).toFixed(2)}
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
            ${when(this.palette.iconColors,
                    () => html`${colorMap(this.palette.iconColors)}`
            )}
            ${when(this.palette.imageColors,
                    () => html`${colorMap(this.palette.imageColors)}`
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

const colorsFromImage = (url, amount) => prominent(url, {amount: amount || 10, group: 32, format: 'hex'});

const /* filter */ onLightness = (min, max) => (col) => {
    const hsl = tc(col)?.toHsl();
    return hsl?.l >= (min || 0) && hsl?.l <= (max || 1);
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

function getFgColor(colors, toColor) {
    colors = Array.isArray(colors) ? colors : [... new Set(colors)];

    const fgColors = colors
        .filter(onSaturation(0, 0.3))
        .filter(onContrastTo(toColor, 5, 19))
        .sort(byContrastTo(toColor));

    console.debug(`filtered colors`, fgColors);
    const most = fgColors.at(0);
    console.debug(`most readable to ${toColor} is ${most}: ${contrast(most, toColor)}`);
    return most;
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

function getAccentColor(colors, toColor) {
    colors = Array.isArray(colors) ? colors : [colors];

    let accentColors = colors
        .filter(onContrastTo(toColor, 2.8, 19))
        .filter(onSaturation(0.4, 1))
        .sort(bySaturation)
        .sort(byContrastTo(toColor)).reverse();

    console.debug(`filtered colors`, accentColors);
    const most = accentColors.at(0);
    console.debug(`most readable to ${toColor} is ${most}: ${contrast(most, toColor)}`);
    return most;
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
