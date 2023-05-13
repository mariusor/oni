import tinycolor from "tinycolor2";
import {average, prominent} from "color.js";
import {ActivityPubItem} from "./activity-pub-item";

export const contrast = tinycolor.readability;

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
    if (root.innerHTML.length === 0) {
        // Nothing slotted, load content from the shadow DOM.
        root = root.renderRoot.querySelector('div[contenteditable]');
    }
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

export function relativeDate(old) {
    const seconds = (Date.now() - Date.parse(old)) / 1000;
    const minutes = Math.abs(seconds / 60);
    const hours = Math.abs(minutes / 60);

    let val = 0.0;
    let unit = "";
    let when = "ago";

    if (seconds < 0) {
        // we're in the future
        when = "in the future";
    }
    if (seconds < 30) {
        return "now";
    }
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
    return `${pluralize(val, unit)} ${when}`;
}

export function pluralize(d, unit) {
    let l = unit.length;
    if (Math.round(d) == 1) {
        return unit;
    }
    if (l > 2 && unit[l - 1] == 'y' && isCons(unit[l - 2])) {
        unit = `${unit.substring(0, l - 1)}ie`;
    }
    return `${Math.round(d)} ${unit}s`;
}

function isCons(c) {
    const cons = ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'w', 'y', 'z'];
    for (const i in cons) {
        if (c == cons[i]) {
            return true;
        }
    }
    return false;
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
        console.debug('refreshing palette?', !(palette.bgImageURL == imageURL && palette.iconURL == iconURL))
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

    const strongerColor = (col) => tinycolor(palette.bgColor).isDark() ?
        tinycolor(col).lighten(10).saturate(15)
        : tinycolor(col).darken(20).saturate(10)

    if (imageURL) {
        const avgColor = await average(imageURL, {format: 'hex'});
        if (avgColor !== null) {
            palette.bgColor = avgColor;
            palette.colorScheme = tinycolor(avgColor).isDark() ? 'dark' : 'light';
            palette.bgImageURL = imageURL;
            root.style.setProperty('--bg-color', avgColor.trim());
            root.style.setProperty('backgroundImage', `linear-gradient(${tinycolor(avgColor).setAlpha(0).toRgb()}, ${tinycolor(avgColor).setAlpha(1).toRgb()}), url(${imageURL});`)
        }
    }

    if (iconURL) {
        let iconColors = await prominent(iconURL, {amount: 20, group: 30, format: 'hex', sample: 5});
        palette.colors = iconColors;
        palette.iconURL = iconURL;

        iconColors = iconColors.filter(col => {
            return tinycolor(col).toHsl().s > 0.18 && tinycolor(col).toHsl().s < 0.84
        })

        const shadowColor = tinycolor.mostReadable(palette.bgColor, iconColors);
        if (shadowColor !== null) {
            palette.shadowColor = shadowColor.toHexString();
            palette.linkVisitedColor = shadowColor.toHexString();
            palette.linkActiveColor = palette.linkVisitedColor;
            palette.linkColor = strongerColor(palette.linkVisitedColor)?.toHexString();
        }
        iconColors = iconColors
            .filter((value, index, array) => array.at(index) !== palette.shadowColor);

        let linkVisitedColor = tinycolor.mostReadable(palette.bgColor, iconColors, {level: "AAA", size: "small"});
        if (linkVisitedColor !== null && tinycolor.isReadable(linkVisitedColor, palette.bgColor, {
            level: "AAA",
            size: "small"
        })) {
            palette.linkVisitedColor = linkVisitedColor.toHexString();
            palette.linkActiveColor = palette.linkVisitedColor;
            palette.linkColor = strongerColor(palette.linkVisitedColor)?.toHexString();
        }
    }

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
