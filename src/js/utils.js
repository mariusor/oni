import {html} from "lit";
import {map} from "lit-html/directives/map.js";

export function rgb(rgb) {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
};

export function rgba(rgb, a) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
};

export function brightness(rgb) {
    //return ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
    // from https://www.nbdtech.com/Blog/archive/2008/04/27/Calculating-the-Perceived-Brightness-of-a-Color.aspx
    return 255 - Math.sqrt((rgb.r * rgb.r * .241 + rgb.g * rgb.g * .691 + rgb.b * rgb.b * .068));
};

export function getColorScheme(bri) {
    let scheme;
    if (Math.abs(bri - 120) < 75) {
        if (bri >= 130) {
            scheme = 'dark';
        } else {
            scheme = 'light';
        }
    } else if (bri > 120) {
        scheme = 'dark';
    } else {
        scheme = 'light';
    }
    return scheme;
};

export function getBestContrastColor(hex, colors){
    const hBrightness = brightness(hexToRGB(hex));
    let maxBrightnessDiff = 130;
    let result = prefersDarkTheme() ? '#000000' : '#ffffff';
    colors.forEach(function (col) {
        if (hex == col) return;
        const cBrightness = brightness(hexToRGB(col))
        if (hBrightness - cBrightness < maxBrightnessDiff) return;

        maxBrightnessDiff = hBrightness - cBrightness;
        result = col;
    });
    return result;
}

export function hexToRGB(hex) {
    function hexToR(h) {return parseInt((cutHex(h)).substring(0,2),16)}
    function hexToG(h) {return parseInt((cutHex(h)).substring(2,4),16)}
    function hexToB(h) {return parseInt((cutHex(h)).substring(4,6),16)}
    function hexToA(h) {return (cutHex(h)).substring(6,8) ?parseInt((cutHex(h)).substring(6,8),16):255}
    function cutHex(h) {return (h.charAt(0)=="#") ? h.substring(1,7):h}
    return {r: hexToR(hex), g: hexToG(hex), b: hexToB(hex), a: hexToA(hex)};
}

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
        const token = localStorage.getItem('token');
        if (token) {
            headers.Authorization = 'Bearer ' + token;
        }
    } else {
        // generate HTTP-signature for the actor
    }
    const response = await fetch(iri, {headers: headers}).catch(console.error);
    if (typeof response == 'undefined') {
        return null;
    }
    if (response.status != 200) {
        response.json().then(value => {
            if (value.hasOwnProperty('errors')) {
                console.error(value.errors)
            } else {
                console.error(value);
            }
        });
        return null;
    }
    const it = await response.json();
    return it;
};

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

export function isAuthenticated() {
    return (localStorage.getItem('token') || '').length > 0;
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
    return `${Math.round(val)} ${pluralize(val, unit)} ${when}`;
}

function pluralize(d, unit) {
    let l = unit.length;
    if (Math.round(d) == 1) {
        return unit;
    }
    if (l > 2 && unit[l - 1] == 'y' && isCons(unit[l - 2])) {
        unit = `${unit.substring(0, l - 1)}ie`;
    }
    return `${unit}s`;
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
