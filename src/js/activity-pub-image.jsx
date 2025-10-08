import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {ActivityPubNote} from "./activity-pub-note";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {renderHtmlText} from "./utils";
import {when} from "lit-html/directives/when.js";

export class ActivityPubImage extends ActivityPubObject {
    static styles = [css`
        :host {
            display: block;
            padding: 0 2px 0;
        }
        img {
            border-radius: .4rem;
            outline: .08rem solid color-mix(in srgb, var(--accent-color), transparent 55%);
            outline-offset: -.08rem;
            max-width: 100%;
            height: auto;
        }
        img.small {
            max-width: 1rem;
            max-height: 1rem;
            vertical-align: text-top;
            outline: unset;
        }
        figure {
            margin: auto;
        }
        figcaption {
            position: absolute;
            padding: 1rem;
            display: inline-block;
            max-width: 30%;
        }
        figure details[open] summary {
            padding-bottom: .4rem;
        }
        figure details {
            color: var(--fg-color);
            cursor: pointer;
            font-size: .9rem;
            line-height: 1.4rem;
            backdrop-filter: blur(10px) saturate(180%) contrast(85%) brightness(40%);
            padding: .2rem .4rem;
            border-radius: .4rem;
        }
        figure summary {
            font-size: .75rem;
            list-style-type: none;
            font-variant: small-caps;
            font-weight: bold;
            padding: 0 .2rem;
        }
        dialog {
            border: none;
            background-color: transparent;
            overflow: clip;
            margin: auto;
            max-width: 98%;
        }
        dialog a {
            position: absolute;
            right: 0;
            display: inline-block;
            font-size: .9rem;
            backdrop-filter: blur(10px) saturate(180%) contrast(85%) brightness(40%);
            margin: 1rem 2rem 0 0;
            padding: .2rem .4rem;
            border-radius: .4rem;
            z-index: 1;
        }
        dialog::backdrop {
            backdrop-filter: blur(40px) contrast(85%) brightness(60%);
        }
        dialog img {
            max-width: 98vw;
            max-height: 95vh;
        }
        @media (max-width: 960px) {
            dialog img {
                max-width: 100%;
            }
        }
        `, ActivityPubNote.styles];

    static properties = {
        _showAlt: {type: Boolean},
    };

    constructor() {
        super(false);
    }

    renderInline() {
        const src = this.it.getUrl() || [{href : this.it.iri()}];
        if (!(src?.length > 0)) {
            return nothing;
        }
        const name = renderHtmlText(this.it.getName());
        const alt = renderHtmlText(this.it.getSummary());
        const smallest = Array.isArray(src) ?
            src.reduce(
                (prev, cur) => (cur?.width <= prev?.width) ? cur : prev
            ) :
            {href : src};

        return html`<img loading="lazy" src=${smallest?.href ?? nothing} title="${name ?? alt}" alt="${alt ?? nothing}" class="small""/>`;
    }

    showModal(e) {
        e.preventDefault();
        e.stopPropagation();
        this.shadowRoot?.querySelector("dialog")?.showModal();
    }

    hideModal(e) {
        e.preventDefault();
        e.stopPropagation();
        this.shadowRoot?.querySelector("dialog")?.close();
    }

    render() {
        if (!ActivityPubImage.isValid(this.it)) return unsafeHTML(`<!-- Invalid image object -->`);
        if (this.inline) {
            return this.renderInline();
        }

        let src = this.it.iri();
        const url = this.it.getUrl();
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

        const name = renderHtmlText(this.it.getName());
        const alt = renderHtmlText(this.it.getSummary());
        const needsFullSize = url.length > 0 || largest?.width > 1920;

        const altElement = this.renderAlt(name, alt);

        const image = (src, sources, sizes) => html`
            <figure>
                <figcaption>${altElement}</figcaption>
                <img @click=${this.showModal} loading="lazy" src=${src ?? nothing}
                     title="${name ?? alt}" alt="${alt ?? nothing}"
                     srcSet=${sources ?? nothing} sizes=${sizes ?? nothing} />
            </figure>`;
        return html`
            ${when(
                needsFullSize,
                    () => html`
                        <dialog closedby="any">
                            <a @click=${this.hideModal} href="#"><oni-icon name="close" alt="Close dialog"></oni-icon></a>
                            ${image(largest?.href)}
                        </dialog>
                    `,
            )}
            ${image(src, sources, sizes)}
            ${this.renderTag()}
            ${metadata !== nothing ? html`<footer>${metadata}</footer>` : nothing}
        `;
    }

    renderAlt(name, alt) {
        if (!(alt?.length > 0) && !(name?.length > 0)) return nothing;

        let expando = 'alt';
        if (!(alt?.length > 0)) {
            alt = name;
        } else {
            if (this._showAlt && name?.length > 0) {
                expando = name;
            }
        }

        return html`
            <details @toggle=${() => this._showAlt = !this._showAlt}>
                <summary>${expando}</summary>
                ${unsafeHTML(alt)}
            </details>`;

    }

    static isValid(it) {
        return typeof it === 'object' && it !== null &&
            (
                (it.hasOwnProperty('type') && it.type === 'Image') ||
                (it.hasOwnProperty('mediaType') && it.mediaType.startsWith('image/')) // NOTE(marius): This is for Pixelfed attachments.
            );
    }
}
