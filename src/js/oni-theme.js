import {readability, TinyColor} from "@ctrl/tinycolor";
import {average, prominent} from "color.js";
import {ActivityPubItem, getHref} from "./activity-pub-item";
import {css, html, LitElement, nothing, unsafeCSS} from "lit";
import {map} from "lit-html/directives/map.js";
import {isMainPage} from "./utils";

export class Palette {
    bgColor;
    fgColor;
    accentColor;
    linkColor;
    linkActiveColor;
    linkVisitedColor;
    imageURL;
    iconURL;
    colorScheme;
    imageColors = [];
    iconColors = [];

    constructor() {
        const root = document.documentElement;
        const style = getComputedStyle(root);

        this.bgColor = style.getPropertyValue('--bg-color').trim();
        this.fgColor = style.getPropertyValue('--fg-color').trim();
        this.accentColor = style.getPropertyValue('--accent-color').trim();
        this.linkColor = style.getPropertyValue('--link-color').trim();
        this.linkActiveColor = style.getPropertyValue('--link-active-color').trim();
        this.linkVisitedColor = style.getPropertyValue('--link-visited-color').trim();
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
        const root = document.body;
        root.style.setProperty('--fg-color', this.fgColor);
        root.style.setProperty('--bg-color', this.bgColor);
        root.style.setProperty('--accent-color', this.accentColor);
        root.style.setProperty('--link-color', this.linkColor);
        root.style.setProperty('--link-visited-color', this.linkVisitedColor);
        root.style.setProperty('--link-active-color', this.linkActiveColor);
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
                palette.linkActiveColor = _palette.linkActiveColor;
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
            :host {
                --bg-color: ${this.bgColor};
                --fg-color: ${this.fgColor};
                --accent-color: ${this.accentColor};
                --link-color: ${this.linkColor};
                --link-visited-color: ${this.linkVisitedColor};
                --link-active-color: ${this.linkActiveColor};
            }
            :host header {
                background-size: cover;
                background-clip: padding-box;
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
            palette.iconURL = iconURL;
            palette.iconColors = (await colorsFromImage(iconURL));
            avgColor = await average(iconURL, {format: 'hex'});
            console.debug(`loaded icon colors ${palette.iconURL}:`, palette.iconColors);
        }

        if (imageURL) {
            palette.imageURL = imageURL;
            palette.imageColors = (await colorsFromImage(imageURL));
            //avgColor = await average(imageURL, {format: 'hex'});
            console.debug(`loaded image colors ${palette.imageURL}:`, palette.imageColors);
        }

        const maxBgSaturation = 0.45;

        if (avgColor) {
            let tgBg = tc(avgColor);
            if (tgBg.toHsl().s > maxBgSaturation) {
                tgBg = tgBg.desaturate(100*Math.abs(tgBg.toHsl().s - maxBgSaturation));
            }
            palette.bgColor = tgBg.toHexString();
            palette.colorScheme = tc(avgColor).isDark() ? 'dark' : 'light';
        }

        let paletteColors = palette.imageColors;
        if (palette.imageColors.length === 0) {
            paletteColors = palette.iconColors;
        }
        if (paletteColors.length > 0) {
            palette.accentColor = getAccentColor(palette, paletteColors) || palette.accentColor;
            paletteColors = paletteColors.filter(not(palette.accentColor, 1));

            palette.linkColor = getAccentColor(palette, paletteColors) || palette.linkColor;
            paletteColors = paletteColors.filter(not(palette.linkColor, 1));

            palette.linkVisitedColor = getClosestColor(palette, paletteColors, palette.linkColor) || palette.linkVisitedColor;
            paletteColors = paletteColors.filter(not(palette.linkVisitedColor, 1));

            palette.linkActiveColor = getClosestColor(palette, paletteColors, palette.linkColor) || palette.linkActiveColor;
        }

        if (palette.imageColors.length + palette.iconColors.length > 0) {
            const allColors = [... new Set(palette.imageColors.concat(palette.iconColors))];
            palette.fgColor = getFgColor(palette, allColors)  || palette.fgColor;
        }

        return palette;
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

const colorsFromImage = (url) => prominent(url, {amount: 50, group: 40, format: 'hex', sample: 128});

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
const /* filter */ not = (c, diff) => (n) => Math.abs(colorDiff(c, n)) >= (diff || 2);
const /* sort */ byContrastTo = (base) => (a, b) => contrast(b, base) - contrast(a, base);
const /* sort */ bySaturation = (a, b) => tc(b).toHsv().s - tc(a).toHsv().s;
const /* sort */ byDiff = (base) => (a, b) => Math.abs(colorDiff(a, base)) - Math.abs(colorDiff(b, base));

function getFgColor(palette, colors) {
    colors = Array.isArray(colors) ? colors : [colors];

    console.debug(`fg colors`, colors);
    return mostReadable(colors, palette.bgColor)?.toHexString();
}

function mostReadable(colors, toColor) {
    colors = Array.isArray(colors) ? colors : [colors];
    colors = [...(new Set(colors))];

    console.debug(`unique colors`, colors);
    if (colors.length === 1) {
        colors = tc(colors.at(0)).polyad(4).map(col => col.toHexString());
        console.debug(`tetrad colors`, colors);
    }
    colors = colors
        .filter(onContrastTo(toColor, 4, 21))
        .sort(byContrastTo(toColor));

    console.debug(`sorted colors`, colors);
    const most = colors?.at(0);
    const least = colors?.at(-1);
    console.debug(`most readable to ${toColor} is ${most}, not ${least}: ${contrast(most, toColor)}/${contrast(least, toColor)}`);
    return tc(colors.at(0));
}

function getClosestColor(palette, colors, color) {
    colors = Array.isArray(colors) ? colors : [colors];

    colors = colors
        .filter(onContrastTo(palette.bgColor, 3, 7))
        .sort(byDiff(color))
        .reverse();
    return colors.at(0);
}

function getAccentColor(palette, colors) {
    colors = Array.isArray(colors) ? colors : [colors];

    const filterColors = (colors) => colors
        .filter(onSaturation(0.4))
        .filter(onLightness(0.4, 0.6));

    let accentColors = colors;
    for (let i = 0; i < 10; i++) {
        accentColors = filterColors(accentColors);
        if (accentColors.length > 0) break;

        colors.forEach((value, index) => {
            accentColors[index] = tc(value).saturate(10).toHexString()
        });
    }
    if (!(accentColors.length > 0)) {
        return "";
    }
    console.debug(`accent colors`, accentColors);
    return mostReadable(accentColors, palette.bgColor)?.toHexString();
}

export class PaletteElement extends LitElement {
    static styles = [css``];

    constructor() {
        super();
    }

    render() {
        const palette = Palette.fromStorage();

        if (!palette) return nothing;
        if (!isMainPage()) return nothing;
        if (!window.location.hostname.endsWith('local')) return nothing;

        const colorMap = (ordered) => {
            console.debug(`map colors`, ordered);
            return html`
                ${map(ordered, value => {
                    console.debug(`rendering color ${value}`)
                    const color = (value === palette.bgColor) ? palette.fgColor : palette.bgColor;
                    return html`
                        <div style="padding: .2rem 1rem; background-color: ${value}; color: ${color}; font-size:.8em;">
                            <small>
                                ${value}
                                :
                                <data value="${colorDiff(value, palette.bgColor)}" title="diff">
                                    ${colorDiff(value, palette.bgColor).toFixed(2)}
                                </data>
                                :
                                <data value="${contrast(value, palette.bgColor)}" title="contrast bg">
                                    ${contrast(value, palette.bgColor).toFixed(2)}
                                </data>
                                :
                                <data value="${contrast(value, palette.fgColor)}" title="contrast fg">
                                    ${contrast(value, palette.fgColor).toFixed(2)}
                                </data>
                                :
                                <data value="${tc(value).toHsl().h}" title="hue">${tc(value).toHsl().h.toFixed(2)}
                                </data>
                                :
                                <data value="${tc(value).toHsl().s}" title="saturation">
                                    ${tc(value).toHsl().s.toFixed(2)}
                                </data>
                                :
                                <data value="${tc(value).toHsl().l}" title="luminance">${tc(value).toHsl().l.toFixed(2)}
                                </data>
                            </small>
                        </div>
                    `
                })}
            `;
        }
        return html`
            ${colorMap(palette.iconColors)}<br/>
            ${colorMap(palette.imageColors)}
        `;
    }
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

