import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {when} from "lit-html/directives/when.js";

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
        details {
            cursor: pointer;
            font-size: .8em;
            background-color: color-mix(in srgb, black, transparent 60%);
            padding: .1rem .4rem;
            border-radius: .4rem;
        }
        summary {
            list-style-type: none;
            font-variant: small-caps;
            font-weight: bold;
        }
        `, ActivityPubObject.styles];

    constructor(it) {
        super(it);
    }

    renderAltText() {
        const alt = document.createElement('div');
        alt.innerHTML = this.it.getSummary();
        return alt.innerText.trim();
    }

    renderInline() {
        const src = this.it.getUrl() || [{href : this.it.iri()}];
        if (src?.length === 0) {
            return nothing;
        }
        const alt = this.renderAltText();
        const smallest = Array.isArray(src) ?
            src.reduce(
                (prev, cur) => (cur?.width <= prev?.width) ? cur : prev
            ) :
            src;
        return html`<img src=${smallest?.href ?? nothing} title="${alt}" alt="${alt}" class="small""/>`;
    }

    render() {
        if (this.inline) {
            return this.renderInline();
        }

        const src = this.it.getUrl() || [{href : this.it.iri()}];
        const alt = this.renderAltText();
        const metadata = this.renderMetadata();

        let largest = typeof(src) === 'string' ? {href: src} : src;
        let sources = nothing;
        let sizes = nothing;
        if (Array.isArray(src)) {
            const sorted = src.sort((a, b) => a?.width - b?.width);
            largest = sorted.reduce((prev, cur) => (cur?.width >= prev?.width ? cur : prev));
            sources = (
                src.length > 1 ?
                    sorted.map((u) => `${u?.href} ${u?.width}w`).join(", ") :
                    nothing
            );
            sizes = (
                src.length > 1 ? sorted.map(
                        u => `(${u?.width === largest?.width ? "min" : "max"}-width: ${u?.width + 80}px)`).join(", ") :
                    nothing
            );
        }

        return html`
                <figure>
                    ${when(alt.length > 0,
                            () => html`
                                <figcaption>
                                    <details>
                                        <summary>alt</summary>
                                        ${alt}
                                    </details>
                                </figcaption>`,
                            () => nothing
                    )}
                    <img src=${largest.href ?? nothing}
                         title="${alt}" alt="${alt}"
                         srcSet="${sources ?? nothing}" sizes="${sizes ?? nothing}"/>
                </figure>
                ${this.renderTag()}
                ${metadata !== nothing ? html`<footer>${metadata}</footer>` : nothing}
        `;
    }
}
