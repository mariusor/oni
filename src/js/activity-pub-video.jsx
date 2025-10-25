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
        figcaption {
            position: absolute;
            padding: 1rem;
            display: inline-block;
            max-width: 30%;
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

        const altElement = html`
            <image-alt name=${name} alt=${alt} slot="alt"></image-alt>`;
        return html`
            <figure>
                <figcaption>${altElement}</figcaption>
                <video playsinline controls preload="metadata" 
                       title="${name ?? alt}" 
                       src=${src ?? nothing}
                ></video>
            </figure>
            ${this.renderTag()}
            ${metadata !== nothing ? html`<footer>${metadata}</footer>` : nothing}
        `;
    }
}
