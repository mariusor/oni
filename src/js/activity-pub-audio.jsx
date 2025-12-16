import {css, html, nothing} from "lit";
import {ActivityPubItem, getHref} from "./activity-pub-item";
import {renderHtml, renderHtmlText} from "./utils";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {ActivityPubNote} from "./activity-pub-note";
import {ActivityPubObject} from "./activity-pub-object";

export class ActivityPubAudio extends ActivityPubObject {
    static styles = [css`
        audio {
            align-self: start;
            margin: auto;
            width: 100%;
            outline: .08rem solid color-mix(in srgb, var(--accent-color), transparent 55%);
            outline-offset: -0.08rem;
            border-radius: 0.4rem;
        }
        figure {
            margin: auto;
        }
        `, ActivityPubNote.styles];

    constructor() {
        super();
    }

    render() {
        if (!ActivityPubItem.isValid(this.it)) return nothing;
        const name = renderHtmlText(this.it.getName());
        const alt = renderHtmlText(this.it.getSummary());
        const altHTML = renderHtml(this.it.getSummary());

        const metadata = this.renderMetadata();
        const src = getHref(this.it);

        let altElement = nothing;
        if (altHTML) {
            altElement = html`<figcaption>${unsafeHTML(altHTML)}</figcaption>`;
        }
        return html`
            <figure>
                <audio controls preload="metadata"
                       title=${name ?? alt}
                       src=${src ?? nothing}
                ></audio>
                ${altElement}
            </figure>
            ${this.renderTag()}
            ${metadata !== nothing ? html`<footer>${metadata}</footer>` : nothing}
        `;
    }
}
