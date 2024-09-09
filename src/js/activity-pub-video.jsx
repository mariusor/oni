import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {when} from "lit-html/directives/when.js";

export class ActivityPubVideo extends ActivityPubObject {
    static styles = [css`
        video {
            max-width: 100%; 
            max-height: 12vw;
            align-self: start;
        }`, ActivityPubObject.styles];

    constructor(it) {
        super(it);
    }

    render() {
        const alt = this.it.getSummary();
        const metadata = this.renderMetadata();
        return html`
            <figure>
                <video controls preload="metadata" src=${this.it.iri() ?? nothing}></video>
                ${when(alt.length > 0,
            () => html`<figcaption>
                    <oni-natural-language-values name="summary" it=${JSON.stringify(alt)}></oni-natural-language-values>
                </figcaption>`,
            () => nothing
        )}
            </figure>
            ${metadata != nothing ? html`<footer>${metadata}</footer>` : nothing}
        `;
    }
}
