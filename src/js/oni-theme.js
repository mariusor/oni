import {readability, TinyColor} from "@ctrl/tinycolor";
import {average, prominent} from "color.js";
import {ActivityPubItem, getHref} from "./activity-pub-item";
import {css, html, LitElement, nothing, unsafeCSS} from "lit";
import {map} from "lit-html/directives/map.js";
import {when} from "lit-html/directives/when.js";

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

function lightDarkFromColor(col) {
    const c = tc(col);
    console.debug(`received ${c.toHexString()}, brightness: ${c.getBrightness()} isLight: ${c.isLight()}, isDark: ${c.isDark()}`)
    const result = new LightDark();
    // NOTE(marius): we divide by 2.55 to get directly the percentage value passable to lighten()/darken()
    const oppositeLightnessAmount = Math.abs(c.getBrightness() - 128) / 2.55;
    if (c.isLight()) {
        result.light = c.toHexString();
        result.dark = c.darken(2 * oppositeLightnessAmount).toHexString();
        console.debug(`computed ${oppositeLightnessAmount} dark-color: ${tc(result.dark).toHexString()}, brightness: ${tc(result.dark).getBrightness()}`)
    } else {
        result.dark = c.toHexString();
        result.light = c.lighten(2 * oppositeLightnessAmount).toHexString();
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
            console.debug(`light/dark preference changed to ${e.matches ? "dark" : "light"} prefersDark?: ${prefersDarkTheme()}`);
        });
    }


    getFgColor(col) {
        col = tc(col)?.desaturate(10)?.toHexString() || col;
        const bgColor = lightDarkFromColor(col);
        const fgColor = new LightDark();
        [fgColor.light, fgColor.dark] = [bgColor.dark, bgColor.light];
        return fgColor;
    }

    getBgColor(col) {
        col = tc(col).desaturate(10)?.toHexString() || col;
        return lightDarkFromColor(col);
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

        const palette = new Palette();
        palette.imageURL = apURL(it?.image);
        palette.iconURL = apURL(it?.icon);

        let colorCount = 15;
        if (!palette.iconURL) {
            colorCount = 25;
        }
        if (palette.imageURL) {
            palette.imageColors = ((await colorsFromImage(palette.imageURL, colorCount)) || []).filter(noExtremes);
            const avgCol = await average(palette.imageURL, {format: 'hex'});
            palette.bgColor = palette.getBgColor(avgCol);
            console.debug(`loaded image ${palette.imageURL}: (bg ${palette.bgColor})`, palette.imageColors);
        } else {
            colorCount = 25;
        }

        if (palette.iconURL) {
            palette.iconColors = ((await colorsFromImage(palette.iconURL, colorCount)) || []).filter(noExtremes);
            const avgCol = await average(palette.iconURL, {format: 'hex'});
            palette.fgColor = palette.getFgColor(avgCol);
            console.debug(`loaded icon ${palette.iconURL}: (avg ${palette.fgColor}) brightness(l:${tc(palette.fgColor.light).getBrightness()}, d:${tc(palette.fgColor.dark).getBrightness()})`, palette.iconColors);
        }

        let colors = [...new Set([...palette.imageColors, ...palette.iconColors])];
        palette.linkColor = getLinkColor(colors, palette.bgColor);
        colors = colors.filter(notLightDark(palette.linkColor, 0.7));
        palette.accentColor = getAccentColor(colors, palette.bgColor);

        palette.linkVisitedColor = new LightDark();
        palette.linkVisitedColor.light = tc(palette.linkColor.light).darken(20).toHexString();
        palette.linkVisitedColor.dark = tc(palette.linkColor.dark).lighten(20).toHexString();

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
        if (this.palette?.iconColors?.length + this.palette?.imageColors?.length === 0) return nothing;

        const renderColor = (color, contrastColor, label) => html`
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

        const colorMap = (colors) => {
            return html`
                ${map(colors, color => {
                    const contrastColor = mostReadable([this.palette.fgColor, this.palette.bgColor], color);
                    return renderColor(color, contrastColor);
                })}
            `;
        }

        const bgColor = this.palette.bgColor;
        const iconLightColors = getLightColors(this.palette.iconColors).sort(byContrastTo(bgColor.light));
        const iconDarkColors = getDarkColors(this.palette.iconColors).sort(byContrastTo(bgColor.dark));
        const imageLightColors = getLightColors(this.palette.imageColors).sort(byContrastTo(bgColor.light));
        const imageDarkColors = getDarkColors(this.palette.imageColors).sort(byContrastTo(bgColor.dark));

        return html`
            ${renderColor(this.palette.bgColor, this.palette.fgColor, html`<b>Background:</b> `)}
            ${renderColor(this.palette.fgColor, this.palette.bgColor, html`<b>Foreground:</b> `)}
            ${renderColor(this.palette.accentColor, this.palette.bgColor, html`<b>Accent:</b> `)}
            ${renderColor(this.palette.linkColor, this.palette.bgColor, html`<b>Link:</b> `)}
            ${renderColor(this.palette.linkVisitedColor, this.palette.bgColor, html`<b>Visited Link:</b> `)}
            ${when(
                    this.palette.iconURL,
                    () => html`
                        <div class="colors">
                            <img alt="t" src="${this.palette.iconURL}" style="max-width:300px; height:100%"/>
                                <!--<div class="icon-colors">${html`${colorMap(this.palette.iconColors)}`}</div>-->

                            <div class="light-icon-colors">${html`${colorMap(iconLightColors)}`}</div>
                            <div class="dark-icon-colors">${html`${colorMap(iconDarkColors)}`}</div>
                        </div>`
            )}
            ${when(
                    this.palette.imageURL,
                    () => html`
                        <div class="colors">
                            <img alt="t" src="${this.palette.imageURL}" style="max-width:300px; height: 100%;"/>
                                <!--<div class="image-colors">${html`${colorMap(this.palette.imageColors)}`}</div>-->
                            <div class="light-image-colors">${html`${colorMap(imageLightColors)}`}</div>
                            <div class="dark-image-colors">${html`${colorMap(imageDarkColors)}`}</div>
                        </div>`
            )}
        `;
    }
}

function getDarkColors(colors) {
    return colors.filter(isDark);
}

function getLightColors(colors) {
    return colors.filter(isLight);
}

function bestColor(colors, toColor) {
    const defaultLight = [defaultAccentColors.light]
    const defaultDark = [defaultAccentColors.dark]

    const light = [...new Set([...defaultLight, ...colors])]
        .filter(isLight && wcagAA(toColor.light))
        .sort((a, b) => byContrastTo(toColor.light)(a, b)).reverse();
    const dark = [...new Set([...defaultDark, ...colors])]
        .filter(isDark && wcagAA(toColor.dark))
        .sort((a, b) => byContrastTo(toColor.dark)(a, b)).reverse();

    const result = new LightDark();
    result.light = light.at(0);
    result.dark = dark.at(0);
    return result;
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
const /* sort */ byDiff = (base) => (a, b) => Math.abs(colorDiff(a, base)) - Math.abs(colorDiff(b, base));

const defaultFgColors = {light: '#EFF0F1', dark: '#232627'};
const defaultAccentColors = {light: '#663399', dark: '#9370DB'};

function getFgColor(colors, toColor, wantsDark) {
    colors = Array.isArray(colors) ? [...new Set(colors)] : [];

    colors = [...new Set([...[defaultFgColors.light, defaultFgColors.dark], ...colors])];
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
            most = defaultFgColors.dark;
        } else {
            most = defaultFgColors.light;
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

const wcagColors = (colors, wcagFn) => colors
    .filter(wcagFn)
    .sort(bySaturation);

function getLinkColor(colors, toColor) {
    colors = Array.isArray(colors) ? colors : [colors];

    console.debug(`colors`, colors)
    const lightColors = getLightColors(colors).sort(byContrastTo(toColor.light));
    const darkColors = getDarkColors(colors).sort(byContrastTo(toColor.dark));

    console.debug(`dark colors`, darkColors);
    console.debug(`light colors`, lightColors);
    const result = new LightDark();
    result.light = saturatedFromColor(lightColors.at(0), toColor.light, false).toHexString();
    result.dark = saturatedFromColor(darkColors.at(0), toColor.dark, true).toHexString();
    return result;
}

function getAccentColor(colors, toColor) {
    colors = Array.isArray(colors) ? colors : [colors];

    const lightColors = getLightColors(colors).sort(byContrastTo(toColor.light));
    const darkColors = getDarkColors(colors).sort(byContrastTo(toColor.dark));
    console.debug(`light`, lightColors);
    console.debug(`dark`, darkColors);

    const result = new LightDark();
    result.light = saturatedFromColor(lightColors.at(0), toColor.light, false).toHexString();
    result.dark = saturatedFromColor(darkColors.at(0), toColor.dark, true).toHexString();
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
        finalColor = finalColor.desaturate(100 * Math.abs(finalColor.toHsl().s - maxBgSaturation));
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
    } while (contrast(contrastTo, finalColor) < minContrast && cnt < maxIter)

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
