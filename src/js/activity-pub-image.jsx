import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {when} from "lit-html/directives/when.js";

export class ActivityPubImage extends ActivityPubObject {
    static styles = [css`
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
        let src = this.it.iri();
        if (!src) {
            src = this.it.getUrl();
        }
        const alt = this.renderAltText();
        return html`<img src=${src ?? nothing} title="${alt}" alt="${alt}" class="small""/>`;
    }

    render() {
        let src = this.it.iri();
        if (!src) {
            src = this.it.getUrl();
        }
        if (this.inline) {
            return this.renderInline();
        }
        const alt = this.renderAltText();
        const metadata = this.renderMetadata();
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
                    <img src=${src ?? nothing} title="${alt}" alt="${alt}" />
                </figure>
                ${this.renderTag()}
                ${metadata != nothing ? html`<footer>${metadata}</footer>` : nothing}
        `;
    }
}
