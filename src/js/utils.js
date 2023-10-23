import tinycolor from "tinycolor2";
import {average, prominent} from "color.js";
import {ActivityPubItem} from "./activity-pub-item";
import {html, nothing} from "lit";
import {map} from "lit-html/directives/map.js";

const tc = tinycolor;
export const contrast = tc.readability;
export const mostReadable = tc.mostReadable;

export function prefersDarkTheme() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
};

export function OnReady(a) {
    'loading' === document.readyState ? document.addEventListener && document.addEventListener('DOMContentLoaded', a) : a.call()
}

const fetchHeaders = {Accept: 'application/activity+json', 'Cache-Control': 'no-store'};

export async function fetchActivityPubIRI(iri) {
    let headers = fetchHeaders;
    if (isLocalIRI(iri)) {
        const auth = authorization();
        if (auth.hasOwnProperty('token_type') && auth.hasOwnProperty('access_token')) {
            headers.Authorization = `${auth.token_type} ${auth.access_token}`;
        }
    } else {
        // generate HTTP-signature for the actor
    }
    const response = await fetch(iri, {headers: headers, mode: 'no-cors'}).catch(console.error);
    if (response.status === 200) {
        return await response.json();
    }
    return null;
}

export function isLocalIRI(iri) {
    if (typeof iri !== 'string') {
        return false;
    }
    return iri.indexOf(window.location.hostname) > 0;
}

export function hostFromIRI(iri) {
    try {
        return (new URL(iri)).host;
    } catch (err) {
        return '';
    }
}

export function baseIRI(iri) {
    try {
        const u = new URL(iri);
        u.pathname = '/';
        return u.toString();
    } catch (err) {
        return '';
    }
}

export function pastensify(verb) {
    if (typeof verb !== 'string') return verb;
    if (verb === 'Undo') {
        return 'Reverted';
    }
    if (verb === 'Create') {
        return 'Published';
    }
    if (verb[verb.length - 1] === 'e') return `${verb}d`;
    return `${verb}ed`;
}

function splitCollectionIRI(iri) {
    const u = new URL(iri);
    const pieces = u.pathname.split('/');
    u.search = '';
    const col = pieces[pieces.length - 1];
    u.pathname = u.pathname.replace(col, '');
    return [u.toString(), col];
}

export function isAuthorized() {
    const auth = authorization();
    return auth.hasOwnProperty('access_token') && auth.hasOwnProperty('token_type') &&
        auth.access_token.length > 0 && auth.token_type.length > 0;
}

export function isMainPage() {
    return window.location.pathname === '/';
}

export function editableContent(root) {
    root = root.renderRoot.querySelector('body[contenteditable]');
    root?.childNodes?.forEach(node => {
        if (node.nodeName.toLowerCase() === 'slot') {
            // the slot should be removed if empty, otherwise it overwrites the value
            root.removeChild(node);
        }
        if (node.nodeType === 8) {
            // Lit introduced comments
            root.removeChild(node);
        }
    });

    return root?.innerHTML.trim();
};

export function relativeDuration(seconds) {
    const minutes = Math.abs(seconds / 60);
    const hours = Math.abs(minutes / 60);

    let val = 0.0;
    let unit = "";
    if (hours < 1) {
        if (minutes < 1) {
            val = seconds;
            unit = "second";
        } else {
            val = minutes;
            unit = "minute";
        }
    } else if (hours < 24) {
        val = hours;
        unit = "hour";
    } else if (hours < 168) {
        val = hours / 24;
        unit = "day";
    } else if (hours < 672) {
        val = hours / 168;
        unit = "week";
    } else if (hours < 8760) {
        val = hours / 730;
        unit = "month";
    } else if (hours < 87600) {
        val = hours / 8760;
        unit = "year";
    } else if (hours < 876000) {
        val = hours / 87600;
        unit = "decade";
    } else {
        val = hours / 876000;
        unit = "century";
    }
    return [val, unit];
}

export function relativeDate(old) {
    const seconds = (Date.now() - Date.parse(old)) / 1000;
    if (seconds >= 0 && seconds < 30) {
        return "now";
    }

    let when = "ago";
    if (seconds < 0) {
        // we're in the future
        when = "in the future";
    }
    const [val, unit] = relativeDuration(seconds);

    return `${pluralize(val, unit)} ${when}`;
}

export function pluralize(d, unit) {
    d = Math.round(d);
    const l = unit.length;
    if (l > 2 && unit[l - 1] == 'y' && isCons(unit[l - 2])) {
        unit = `${unit.substring(0, l - 1)}ie`;
    }
    if (d > 1) {
        unit = `${unit}s`
    }
    return `${d} ${unit}`;
}

function isCons(c) {
    function isVowel(v) {
        return ['a', 'e', 'i', 'o', 'u'].indexOf(v) >= 0;
    }
    return !isVowel(c);
}

export function authorization() {
    return JSON.parse(localStorage.getItem('authorization')) || {};
}

export function handleServerError(err) {
    let errMessage;
    if (err.hasOwnProperty('errors')) {
        console.error(err.errors);
        if (!Array.isArray(err.errors)) {
            err.errors = [err.errors];
        }
        err.errors.forEach((err) => {
            errMessage += ` ${err.message}`;
        })
    } else {
        console.error(err);
        errMessage += err.toString();
    }
    return errMessage;
}

export function mainActorOutbox() {
    return localStorage.getItem("outbox");
}

export function showError(e) {
    console.warn(e);
    alert(e);
}

function colorsFromImage (url) {
    return prominent(url, {amount: 30, group: 40, format: 'hex', sample: 8})
}

const /* filter */ onLightness = (min, max) => (col) => tc(col)?.toHsl()?.l >= (min || 0)
    && tc(col)?.toHsl()?.l <= (max || 1);
const /* filter */ onSaturation = (min, max) => (col) => tc(col)?.toHsl()?.s >= (min || 0)
    && tc(col)?.toHsl()?.s <= (max || 1);
const /* filter */ onContrastTo = (base, min, max) => (col) => contrast(col, base) >= (min || 0)
    && contrast(col, base) <= (max || 21);
const /* filter */ not = (c, diff) => (n) => Math.abs(colorDiff(c, n)) >= (diff || 2);
const /* sort */ byContrastTo = (base) => (a, b) => contrast(b, base) - contrast(a, base);
const /* sort */ bySaturation = (a, b) => tc(b).toHsv().s - tc(a).toHsv().s;
const /* sort */ byDiff = (base) => (a, b) => Math.abs(colorDiff(a, base)) - Math.abs(colorDiff(b, base));

export async function loadPalette(it) {
    const imageURL = apURL(it.getImage());
    const iconURL = apURL(it.getIcon());

    if (localStorage.getItem('palette')) {
        const palette = JSON.parse(localStorage.getItem('palette'));
        //console.debug('refreshing palette?', !(palette.bgImageURL == imageURL && palette.iconURL == iconURL))
        if (palette.bgImageURL == imageURL && palette.iconURL == iconURL) {
            return palette;
        }
    }

    const root = document.documentElement;
    const style = getComputedStyle(root);
    const palette = {
        bgColor: style.getPropertyValue('--bg-color').trim(),
        fgColor: style.getPropertyValue('--fg-color').trim(),
        accentColor: style.getPropertyValue('--accent-color').trim(),
        linkColor: style.getPropertyValue('--link-color').trim(),
        linkActiveColor: style.getPropertyValue('--link-active-color').trim(),
        linkVisitedColor: style.getPropertyValue('--link-visited-color').trim(),
        colorScheme: prefersDarkTheme() ? 'dark' : 'light',
        imageColors: [],
        iconColors: [],
    };

    let iconColors = [];
    let imageColors = [];
    if (imageURL) {
        palette.bgImageURL = imageURL;

        imageColors = (await colorsFromImage(imageURL))?.filter(validColors);
        const avgColor = await average(imageURL, {format: 'hex'});
        if (avgColor) {
            console.debug(`bgColor: ${avgColor}`)
            palette.bgColor = avgColor;
            palette.colorScheme = tc(avgColor).isDark() ? 'dark' : 'light';
            console.debug(`color scheme: ${palette.colorScheme}`)

            root.style.setProperty('--bg-color', avgColor.trim());
            root.style.setProperty('backgroundImage', `linear-gradient(${tc(avgColor).setAlpha(0).toRgb()}, ${tc(avgColor).setAlpha(1).toRgb()}), url(${imageURL});`)
        }
    }

    if (iconURL) {
        palette.iconURL = iconURL;
        iconColors = (await colorsFromImage(iconURL))?.filter(validColors);
    }

    palette.imageColors = imageColors;
    palette.iconColors = iconColors;

    palette.accentColor = getAccentColor(palette, iconColors) || palette.accentColor;
    iconColors = iconColors.filter(not(palette.accentColor, 1));

    palette.linkColor = getAccentColor(palette, iconColors) || palette.linkColor;
    iconColors = iconColors.filter(not(palette.linkColor, 1));

    palette.linkVisitedColor = getClosestColor(palette, iconColors, palette.linkColor) || palette.linkVisitedColor;
    iconColors = iconColors.filter(not(palette.linkVisitedColor, 1));

    palette.linkActiveColor = getClosestColor(palette, iconColors, palette.linkColor) || palette.linkActiveColor;

    palette.fgColor = getFgColor(palette, imageColors) || palette.fgColor;

    localStorage.setItem('palette', JSON.stringify(palette));
    return palette;
}

function getFgColor(palette, colors) {
    colors = colors || [];

    return mostReadable(palette.bgColor, colors)?.toHexString();
}

function getClosestColor(palette, colors, color) {
    colors = colors || [];

    colors = colors
        .filter(onContrastTo(palette.bgColor, 3, 7))
        .sort(byDiff(color))
        .reverse();
    return colors.at(0);
}

function getAccentColor(palette, colors) {
    colors = colors || [];

    const filterColors = (colors) => colors
        .filter(onSaturation(0.4))
        .filter(onLightness(0.4, 0.6));

    let accentColors = colors;
    for (let i = 0; i < 10; i++) {
        accentColors = filterColors(accentColors);
        if (accentColors.length > 0) break;

        colors.forEach((value, index) => {
            accentColors[index] = tc(value).saturate().toHexString()
        });
    }
    return mostReadable(palette.bgColor, accentColors)?.toHexString();
}

export function renderColors() {
    const palette = JSON.parse(localStorage.getItem('palette'));

    if (!palette) return nothing;
    if (!window.location.hostname.endsWith('local')) return nothing;

    const colorMap = (ordered) => html`
        ${map(ordered, value => {
            const color = mostReadable(value, [palette.bgColor, palette.fgColor]);
            return html`
                <div style="padding: .2rem 1rem; background-color: ${value}; color: ${color}; font-size:.8em;">
                        <small>
                        ${value}
                        : <data value="${colorDiff(value, palette.bgColor)}" title="diff">${colorDiff(value, palette.bgColor).toFixed(2)}</data>
                        : <data value="${contrast(value, palette.bgColor)}" title="contrast bg">${contrast(value, palette.bgColor).toFixed(2)}</data>
                        : <data value="${contrast(value, palette.fgColor)}" title="contrast fg">${contrast(value, palette.fgColor).toFixed(2)}</data>
                        : <data value="${tc(value).toHsl().h}" title="hue">${tc(value).toHsl().h.toFixed(2)}</data>
                        : <data value="${tc(value).toHsl().s}" title="saturation">${tc(value).toHsl().s.toFixed(2)}</data>
                        : <data value="${tc(value).toHsl().l}" title="luminance">${tc(value).toHsl().l.toFixed(2)} </data>
                        </small>
                    </div>
            `
        })}
    `;
    return html`${colorMap(palette.iconColors)}<br/>${colorMap(palette.imageColors)}`;
}

function apURL(ob) {
    if (typeof ob === 'object' && ob !== null) {
        ob = new ActivityPubItem(ob);
        ob = ob.iri() || ob.getUrl();
    }
    return ob
}

export function renderTimestamp(published, relative = true) {
    if (!published) {
        return nothing;
    }
    return html`<time datetime=${published.toUTCString()} title=${published.toUTCString()}>
            <oni-icon name="clock"></oni-icon> ${relative ? relativeDate(published) : published.toLocaleString()}
        </time>`;
}

export function renderDuration(seconds) {
    if (!seconds) {
        return nothing;
    }
    const [val, unit] = relativeDuration(seconds)
    return html`<span>${pluralize(val, unit)}</span>`;
}

function validColors(value, index, array) {
    return array.indexOf(value) === index && not('#000000', 0.2)(value) && not('#ffffff', 0.2)(value);
}

// formulas from : https://www.easyrgb.com/en/math.php
function toXYZ(col) {
    col = tc(col)?.toRgb();
    col = {
        r: col.r / 255,
        g: col.g / 255,
        b: col.b / 255,
    }

    const convVal = (v) => 100*(v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92);

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

    const convVal = (v) => (v > 0.008856) ? Math.pow(v , 1/3) : (7.787 * v) + (16 / 116);

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
    return Math.sqrt(Math.pow(c2.a , 2) + Math.pow(c2.b , 2)) -
        Math.sqrt(Math.pow(c1.a , 2) + Math.pow(c1.b , 2))
}

export function getSelection(root) {
    let selection = document.getSelection();
    if (root && typeof root.shadowRoot?.getSelection == 'function') {
        selection = root.shadowRoot?.getSelection();
    }
    return selection;
}

export function execCommand (n) {
    if (!Array.isArray(n.execCommand)) n.execCommand = [n.execCommand];
    if (!Array.isArray(n.execCommandValue)) n.execCommandValue = [n.execCommandValue];

    for (const i in n.execCommand) {
        const command = n.execCommand[i];
        let val = n.execCommandValue[i] || '';

        if (typeof val == 'function') val = val();
        console.debug(`Executing command ${command}: ${val}`);
        if (typeof command === "string") {
            // NOTE(marius): this should be probably be replaced with something
            // based on the ideas from here: https://stackoverflow.com/a/62266439
            document.execCommand(command, false, val);
        } else {
            command(val);
        }
    }
}

export function newPost(e) {
    e.preventDefault();
    e.stopPropagation();

    alert("New post");
}

