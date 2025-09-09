import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {ActivityPubNote} from "./activity-pub-note";
import {until} from "lit-html/directives/until.js";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";

export class ActivityPubImage extends ActivityPubObject {
    static styles = [css`
        :host {
            display: block;
            padding: 0 2px 0;
        }
        img {
            border-radius: .4rem;
            border: 1px solid var(--accent-color);
            max-width: 100%;
            height: auto;
        }
        img.small {
            max-width: 1rem;
            max-height: 1rem;
            vertical-align: text-top;
        }
        figure {
            margin: auto;
        }
        figcaption {
            position: absolute;
            padding: 1rem;
            display: flex;
            align-items: start;
        }
        figure details {
            cursor: pointer;
            font-size: .75rem;
            background-color: color-mix(in srgb, black, transparent 60%);
            padding: .1rem .4rem;
            border-radius: .4rem;
        }
        figure summary {
            font-size: .8rem;
            list-style-type: none;
            font-variant: small-caps;
            font-weight: bold;
        }
        `, ActivityPubNote.styles];

    static properties = {
        _showAlt: {type: Boolean},
    };

    constructor() {
        super(false);
    }

    renderNameText = () => renderHtmlText(this.it.getName());

    renderAltText = () => renderHtmlText(this.it.getSummary());

    renderInline() {
        const src = this.it.getUrl() || [{href : this.it.iri()}];
        if (!(src?.length > 0)) {
            return nothing;
        }
        const alt = this.renderAltText();
        const smallest = Array.isArray(src) ?
            src.reduce(
                (prev, cur) => (cur?.width <= prev?.width) ? cur : prev
            ) :
            src;
        return html`<img loading="lazy" src=${smallest?.href ?? nothing} title="${alt}" alt="${alt}" class="small""/>`;
    }

    render() {
        if (!ActivityPubImage.isValid(this.it)) return unsafeHTML(`<!-- Invalid image object -->`);
        if (this.inline) {
            return this.renderInline();
        }

        let src = this.it.iri();
        const url = this.it.getUrl();
        const name = this.renderNameText();
        const alt = this.renderAltText();
        const metadata = this.renderMetadata();

        let largest = typeof(url) === 'string' ? {href: url} : url;
        let sources = nothing;
        let sizes = nothing;
        if (Array.isArray(url)) {
            const sorted = url.sort((a, b) => a?.width - b?.width);
            largest = sorted.reduce((prev, cur) => (cur?.width >= prev?.width ? cur : prev));
            sources = (
                url.length > 1 ?
                    sorted.map((u) => `${u?.href} ${u?.width}w`).join(", ") :
                    nothing
            );
            sizes = (
                url.length > 1 ? sorted.map(
                        u => `(${u?.width === largest?.width ? "min" : "max"}-width: ${u?.width + 80}px)`).join(", ") :
                    nothing
            );
        }
        if (typeof url === 'string' && !src) {
            src = url;
        }
        if (!src) return unsafeHTML(`<!-- Unknown image object with missing id or url -->`);

        const altElement = this.renderAlt(name, renderHtml(this.it.getSummary()));
        return html`
            <figure>
                ${altElement}
                <img loading="lazy" src=${src ?? nothing}
                     title="${name ?? alt}" alt="${alt}"
                     srcSet="${sources ?? nothing}" sizes="${sizes ?? nothing}"/>
            </figure>
            ${this.renderTag()}
            ${until(this.renderReactions())}
            ${metadata !== nothing ? html`<footer>${metadata}</footer>` : nothing}
            ${until(this.renderReplies())}
        `;
    }

    renderAlt(name, alt) {
        if (!(alt?.length > 0) && !(name?.length > 0)) return nothing;
        let summary = 'alt';
        if (this._showAlt && name?.length > 0) summary = name;

        return html`
            <figcaption>
                <details @toggle=${() => this._showAlt = !this._showAlt}>
                    <summary>${summary}</summary>
                    ${unsafeHTML(alt)}
                </details>
            </figcaption>`;

    }

    static isValid(it) {
        return typeof it === 'object' && it !== null &&
            (
                (it.hasOwnProperty('type') && it.type === 'Image') ||
                (it.hasOwnProperty('mediaType') && it.mediaType.startsWith('image/')) // NOTE(marius): This is for Pixelfed attachments.
            );
    }
}

function renderHtml(n) {
    if (!(n?.length > 0)) return null;
    const el = document.createElement('div');
    el.innerHTML = n;
    return el.innerHTML.trim();
}

function renderHtmlText(n) {
    if (!(n?.length > 0)) return null;
    const el = document.createElement('div');
    el.innerHTML = n;
    return el.innerText.trim();
}