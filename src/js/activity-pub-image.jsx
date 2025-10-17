import {css, html, LitElement, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {ActivityPubNote} from "./activity-pub-note";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {renderHtmlText} from "./utils";
import {when} from "lit-html/directives/when.js";
import {classMap} from "lit-html/directives/class-map.js";

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

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
        img.can-expand {
            cursor: pointer;
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
        dialog {
            border: none;
            background-color: transparent;
            overflow: clip;
            margin: auto;
            max-width: 98%;
            outline: none;
        }
        dialog::backdrop {
            backdrop-filter: blur(40px) contrast(85%) brightness(60%);
        }
        dialog a:has(oni-icon) {
            font-size: .9rem;
            position: absolute;
            right: 0;
            display: inline-block;
            margin: 1rem 2rem 0 0;
            padding: .2rem .4rem;
            border-radius: .4rem;
            z-index: 1;
            backdrop-filter: blur(10px) saturate(180%) contrast(85%) brightness(40%);
            outline: none;
        }
        @media (max-width: 536px) {
            img.small {
                vertical-align: top;
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
        const src = this.it.getUrl() || [{href: this.it.iri()}];
        if (!(src?.length > 0)) {
            return nothing;
        }
        const name = renderHtmlText(this.it.getName());
        const alt = renderHtmlText(this.it.getSummary());
        const smallest = Array.isArray(src) ?
            src.reduce(
                (prev, cur) => (cur?.width <= prev?.width) ? cur : prev
            ) :
            {href: src};

        return html`<img class="small" loading="lazy"
                         src=${smallest?.href ?? nothing} title="${name ?? alt}" alt="${alt ?? nothing}"/>`;
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

        let largest = typeof (url) === 'string' ? {href: url} : url;
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

        const altElement = html`
            <image-alt name=${name} alt=${alt} slot="alt"></image-alt>`;
        return html`
            ${when(
                    needsFullSize,
                    () => html`
                        <dialog closedby="any">
                            <a @click=${this.hideModal} href="#">
                                <oni-icon name="close" alt="Close dialog"></oni-icon>
                            </a>
                            <image-popup src=${largest.href}>${altElement}</image-popup>
                        </dialog>`,
            )}
            <figure>
                <figcaption>${altElement}</figcaption>
                <img class=${classMap({'can-expand': needsFullSize && sources?.length > 0})}
                     @click=${this.showModal}
                     loading="lazy" src=${src ?? nothing}
                     title=${name ?? alt} alt=${alt ?? nothing}
                     srcSet=${sources ?? nothing} sizes=${sizes ?? nothing}/>
            </figure>
            ${this.renderTag()}
            ${metadata !== nothing ? html`
                <footer>${metadata}</footer>` : nothing}
        `;
    }

    static isValid(it) {
        return typeof it === 'object' && it !== null &&
            (
                (it.hasOwnProperty('type') && it.type === 'Image') ||
                (it.hasOwnProperty('mediaType') && it.mediaType.startsWith('image/')) // NOTE(marius): This is for Pixelfed attachments.
            );
    }
}

class ImageAlt extends LitElement {
    static styles = [css`
        details[open] summary {
            padding-bottom: .4rem;
        }
        details {
            color: var(--fg-color);
            cursor: pointer;
            font-size: .9rem;
            line-height: 1.4rem;
            backdrop-filter: blur(10px) saturate(180%) contrast(85%) brightness(40%);
            padding: .2rem .4rem;
            border-radius: .4rem;
        }
        summary {
            font-size: .75rem;
            list-style-type: none;
            font-variant: small-caps;
            font-weight: bold;
            padding: 0 .2rem;
        }
    `];

    static properties = {
        name: {type: String},
        alt: {type: String},
        _expando: {type: String}
    };

    constructor() {
        super();
        this.name = '';
        this.alt = '';
        this._expando = 'alt';
    }

    expandoSwitch() {
        const det = this.renderRoot?.querySelector('details');
        if (this.alt?.length > 0 && det?.open && this.name?.length > 0) {
            this._expando = this.name;
        } else {
            this._expando = 'alt';
        }
    }

    render() {
        if (!(this.alt.length > 0) && !(this.name.length > 0)) return nothing;

        let alt = this.alt;
        if (!(this.alt.length > 0)) {
            alt = this.name;
        }

        return html`
            <details @toggle=${this.expandoSwitch}>
                <summary>${this._expando}</summary>
                ${unsafeHTML(alt)}
            </details>
        `;
    }
}

class ImagePopUp extends LitElement {
    static styles = [css`
        img {
            border-radius: .4rem;
            outline: .08rem solid color-mix(in srgb, var(--accent-color), transparent 55%);
            outline-offset: -.08rem;
            max-width: 100%;
            height: auto;
        }
        img.can-expand {
            cursor: pointer;
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
        img {
            max-width: 98vw;
            max-height: 95vh;
        }
        a:has(oni-icon) {
            font-size: .9rem;
            position: absolute;
            display: inline-block;
            margin: 1rem 2rem 0 0;
            padding: .2rem .4rem;
            border-radius: .4rem;
            z-index: 1;
            backdrop-filter: blur(10px) saturate(180%) contrast(85%) brightness(40%);
            outline: none;
            right: 3rem;
        }
        a:has(oni-icon[name=zoom-in]) {
            cursor: zoom-in;
        }
        a:has(oni-icon[name=zoom-out]) {
            cursor: zoom-out;
        }
        @media (max-width: 960px) {
            img {
                max-width: 100%;
            }
        }
        @media (max-width: 536px) {
            img.small {
                vertical-align: top;
            }
        }
        `, ActivityPubNote.styles];

    static properties = {
        src: {type: String},
        img: {type: Element},
        zoomed: {type: Boolean}
    };

    constructor() {
        super();
        this.src = '';
        this.img = null;
        this.zoomed = false;
    }

    zoomDragStart(e) {
        if (!this.zoomed) return;
        this.dragStartPos = { x: e.clientX, y: e.clientY};
        this.img.style.cursor = 'move';
    }

    zoomDrag(e) {
        if (!this.zoomed) return;
        if (e.clientX + e.clientY === 0) {
            this.img.style.cursor = 'default';
            e.preventDefault();
            e.stopPropagation();

            return;
        }

        const multiplier = Math.max(
            this.img.naturalWidth/this.img.width*0.1,
            this.img.naturalHeight/this.img.height*0.1
        );
        const deltaX = (e.clientX - this.dragStartPos.x)*multiplier;
        const deltaY = (e.clientY - this.dragStartPos.y)*multiplier;

        const matches = this.img.style?.objectPosition?.matchAll(/(\d+)% (\d+)%/g);
        let origX = 50;
        let origY = 50;

        if (matches && matches.length > 2) {
            origX = parseInt(matches[1]);
            origY = parseInt(matches[2]);
        }

        this.img.style.objectPosition = `${clamp(origX+deltaX, 0, 100)}% ${clamp(origY+deltaY, 0, 100)}%`;
    }

    toggleZoom(e) {
        e.preventDefault();
        e.stopPropagation();

        this.zoomed = !this.zoomed;
        if (!this.img) {
            this.img = this.shadowRoot?.querySelector('figure img');
        }
        if (!this.zoomed) {
            this.img.draggable = false;
            this.img.removeAttribute('style');
        } else {
            this.img.draggable = true;
            this.img.style.objectFit = 'none';
        }
    }

    render() {
        const zoomDirection = this.zoomed ? 'out' : 'in';
        return html`
            <a @click=${this.toggleZoom} href="#">
                <oni-icon name="zoom-${zoomDirection}" alt="Zoom image ${zoomDirection}"></oni-icon>
            </a>
            <figure>
                <figcaption><slot name="alt"></slot></figcaption>
                <img @dragstart=${this.zoomDragStart}
                     @drag=${this.zoomDrag}
                     loading="lazy" src=${this.src}
                     title=${this.name ?? this.alt} alt=${this.alt ?? nothing}/>
            </figure>`;
    }
}

customElements.define('image-alt', ImageAlt);
customElements.define('image-popup', ImagePopUp);