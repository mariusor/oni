import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {when} from "lit-html/directives/when.js";
import {ActivityPubItem} from "./activity-pub-item";
import {ActivityPubNote} from "./activity-pub-note";
import {until} from "lit-html/directives/until.js";

export class ActivityPubVideo extends ActivityPubObject {
    static styles = [css`
        video {
            max-width: 100%; 
            max-height: 12vw;
            align-self: start;
        }`, ActivityPubNote.styles];

    constructor() {
        super();
    }

    render() {
        if (!ActivityPubItem.isValid(this.it)) return nothing;
        const alt = this.it.getSummary();
        const metadata = this.renderMetadata();
        return html`
            <figure>
                <video playsinline controls preload="metadata" src=${this.it.iri() ?? nothing}></video>
                ${when(alt.length > 0,
            () => html`<figcaption>
                    <oni-natural-language-values name="summary" it=${JSON.stringify(alt)}></oni-natural-language-values>
                </figcaption>`,
            () => nothing
        )}
            </figure>
            ${this.renderTag()}
            ${metadata !== nothing ? html`<footer>${metadata}</footer>` : nothing}
            ${until(this.renderReplies())}
        `;
    }
}
