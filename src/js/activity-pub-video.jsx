import {css, html, nothing} from "lit";
import {ActivityPubItem, getHref} from "./activity-pub-item";
import {renderHtml, renderHtmlText} from "./utils";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {ActivityPubObject} from "./activity-pub-object";
import {ActivityPubNote} from "./activity-pub-note";

export class ActivityPubVideo extends ActivityPubObject {
    static styles = [css`
        video {
            max-width: 100%; 
            max-height: 100%; 
            align-self: start;
            border-radius: .4rem;
            outline: .08rem solid color-mix(in srgb, var(--accent-color), transparent 55%);
            outline-offset: -.08rem;
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
                <video playsinline controls preload="metadata" 
                       title="${name ?? alt}" 
                       src=${src ?? nothing}
                ></video>
                ${altElement}
            </figure>
            ${this.renderTag()}
            ${metadata !== nothing ? html`<footer>${metadata}</footer>` : nothing}
        `;
    }
}
