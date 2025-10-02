import {html, nothing} from "lit";
import DOMPurify from "dompurify";
import {ActivityPubObject} from "./activity-pub-object";
import {ActivityPubActivity} from "./activity-pub-activity";
import {ActivityPubActor} from "./activity-pub-actor";

export function OnReady(a) {
    'loading' === document.readyState ? document.addEventListener && document.addEventListener('DOMContentLoaded', a) : a.call()
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

export function pastensify(verb, lowercase = false) {
    if (typeof verb !== 'string') return verb;
    if (verb.toLowerCase() === 'undo') {
        verb = 'Revert';
    }
    if (verb.toLowerCase() === 'create') {
        verb = 'Publish';
    }
    if (verb.toLowerCase() === 'announce') {
        verb = 'Share';
    }
    if (lowercase) {
        verb = verb.toLowerCase();
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

export function isMainPage() {
    return window.location.pathname === '/';
}

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

    return `${pluralize(Math.round(val), unit)} ${when}`;
}

export function pluralize(d, unit) {
    const l = unit.length;
    if (d !== 1) {
        if (unit[l - 1] === 'y' && isCons(unit[l - 2])) {
            unit = `${unit.substring(0, l - 1)}ie`;
        }
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

export const renderObjectByType = ActivityPubObject.renderByType;
export const renderActivityByType = ActivityPubActivity.renderByType;
export const renderActorByType = ActivityPubActor.renderByType;

export function activity(outbox, update, extraHeaders = {}, success = () => {}) {
    const headers = {
        'Content-Type': 'application/activity+json',
    };

    const req = {
        headers: {...headers, ...extraHeaders},
        method: "POST",
        body: JSON.stringify(update)
    };

    return fetch(outbox, req)
}

export function showError(e) {
    console.warn(e);
    alert(e);
}

export function renderTimestamp(published, relative = true) {
    if (!published) {
        return nothing;
    }
    return html`
        <time datetime=${published.toUTCString()} title=${published.toUTCString()}>
            <oni-icon name="clock"></oni-icon>
            ${relative ? relativeDate(published) : published.toLocaleString()}
        </time>`;
}

export function renderDuration(seconds) {
    if (!seconds) {
        return nothing;
    }
    const [val, unit] = relativeDuration(seconds)
    return html`<span>${pluralize(Math.round(val), unit)}</span>`;
}

const defaultSanitizerConfig = {
    ADD_TAGS: ['bandcamp-embed'],
    ADD_ATTR: ['src', 'url', 'class'],
    FORCE_BODY: true,
};


export function renderHtml(n) {
    if (!(n?.length > 0)) return null;
    const el = document.createElement('div');
    el.innerHTML = sanitize(n);
    return el.innerHTML.trim();
}

export function renderHtmlText(n) {
    if (!(n?.length > 0)) return null;
    const el = document.createElement('div');
    el.innerHTML = n;
    return el.innerText.trim() ?? '';
}

export function sanitize(value) {
    return DOMPurify.sanitize(value, defaultSanitizerConfig);
}

export function showBandCampEmbeds(e) {
    const self = e.target;
    const show = self.open;
    const items = self.querySelector('oni-items')?.shadowRoot;
    items?.querySelectorAll('bandcamp-embed').forEach((it) => {
        it.show = show;
    });
}

export function urlText(iri) {
    if (!URL.canParse(iri)) return iri;
    const u = URL.parse(iri)
    return `${u?.host}${(u?.pathname !== '/' ? u.pathname : '')}`;
}

export function urlRoot(iri) {
    if (typeof iri === 'string') iri = URL.parse(iri)
    iri.pathname = '';
    return iri.toString()
}

export const toTitleCase = (s) => typeof s  === 'string'
    ? `${s?.at(0)?.toLocaleUpperCase()}${s?.substring(1)}`
    : nothing;
