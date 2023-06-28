import tinycolor from "tinycolor2";
import {average, prominent} from "color.js";
import {ActivityPubItem} from "./activity-pub-item";
import {html, nothing} from "lit";

const tc = tinycolor;
export const contrast = tc.readability;
export const mostReadable = tc.mostReadable;

export function prefersDarkTheme() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
};

export function OnReady(a) {
    'loading' == document.readyState ? document.addEventListener && document.addEventListener('DOMContentLoaded', a) : a.call()
};

const fetchHeaders = {Accept: 'application/activity+json', 'Cache-Control': 'no-store'};

export async function fetchActivityPubIRI(iri) {
    let headers= fetchHeaders;
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
};

export function hostFromIRI(iri) {
    try {
        return (new URL(iri)).host;
    } catch (err) {
        return '';
    }
};

export function baseIRI(iri) {
    try {
        const u = new URL(iri);
        u.pathname = '/';
        return u.toString();
    } catch (err) {
        return '';
    }
};

export function pastensify(verb) {
    if (typeof verb !== 'string') return verb;
    if (verb == 'Undo') {
        return 'Reverted';
    }
    if (verb == 'Create') {
        return 'Published';
    }
    if (verb[verb.length - 1] === 'e') return `${verb}d`;
    return `${verb}ed`;
};

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

export function editableContent(root) {
    root = root.renderRoot.querySelector('body[contenteditable]');
    root.childNodes.forEach(node => {
        if (node.nodeName.toLowerCase() === 'slot') {
            // the slot should be removed if empty, otherwise it overwrites the value
            root.removeChild(node);
        }
        if (node.nodeType === 8) {
            // Lit introduced comments
            root.removeChild(node);
        }
    });

    return root.innerHTML.trim();
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
        shadowColor: style.getPropertyValue('--shadow-color').trim(),
        linkColor: style.getPropertyValue('--link-color').trim(),
        linkActiveColor: style.getPropertyValue('--link-active-color').trim(),
        linkVisitedColor: style.getPropertyValue('--link-visited-color').trim(),
        colorScheme: prefersDarkTheme() ? 'dark' : 'light',
    };

    const strongerColor = (col) => tc(palette.bgColor).isDark() ?
        col.lighten(10).saturate(15)
        : col.darken(20).saturate(10)
    const goodContrast = (c) => contrast(tc(c), tc(palette.bgColor)) > 2;
    const goodSaturation = (c) => tc(c).toHsl().s > 60;
    const not = (c) => (n) => {
        return Math.abs(contrast(tc(c), tc(palette.bgColor)) - contrast(tc(n) - tc(palette.bgColor))) > 1
    }

    let colors;
    if (imageURL) {
        const avgColor = await average(imageURL, {format: 'hex'});
        if (avgColor !== null) {
            palette.bgColor = avgColor;
            palette.colorScheme = tc(avgColor).isDark() ? 'dark' : 'light';
            palette.bgImageURL = imageURL;
            root.style.setProperty('--bg-color', avgColor.trim());
            root.style.setProperty('backgroundImage', `linear-gradient(${tc(avgColor).setAlpha(0).toRgb()}, ${tc(avgColor).setAlpha(1).toRgb()}), url(${imageURL});`)
        }
        palette.colors = await prominent(imageURL, {amount: 20, group: 5, format: 'hex', sample: 4});
    }

    if (iconURL) {
        let iconColors = await prominent(iconURL, {amount: 20, group: 5, format: 'hex', sample: 4});

        palette.colors = iconColors?.concat(palette.colors).filter(arrayUnique);
        palette.iconURL = iconURL;

        colors = palette.colors;

        const accentColors = colors.filter(goodSaturation).filter(goodContrast);
        console.debug(accentColors);
        const shadowColor = mostReadable(palette.bgColor, accentColors,{level:"AA", size:"large"});
        if (shadowColor !== null) {
            palette.shadowColor = shadowColor.toHexString();
            palette.linkVisitedColor = shadowColor.toHexString();
            palette.linkActiveColor = palette.linkVisitedColor;
            //palette.linkColor = strongerColor(shadowColor)?.toHexString();

            colors = colors.filter(not(shadowColor));
        }

        const fgColor = mostReadable(palette.bgColor, colors,{level:"AAA", size:"small"});
        if (fgColor !== null) {
            palette.fgColor = fgColor.toHexString();
            colors = colors.filter(not(fgColor));
        }


        const linkVisitedColor = mostReadable(palette.bgColor, colors, {level: "AA", size: "small"});
        if (linkVisitedColor !== null) {
            palette.linkVisitedColor = linkVisitedColor.toHexString();
            //palette.linkColor = strongerColor(linkVisitedColor)?.toHexString();
            colors = colors.filter(not(linkVisitedColor));
        }
        const linkColor = mostReadable(palette.bgColor, colors, {level: "AAA", size: "small"});
        if (linkColor !== null) {
            palette.linkColor = linkColor.toHexString();
            palette.linkActiveColor = strongerColor(linkColor)?.toHexString();
        }
    }
    palette.colors = colors;

    localStorage.setItem('palette', JSON.stringify(palette));
    return palette;
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

function arrayUnique(value, index, array) {
    return (value !== null) && array.indexOf(value) === index;
}
