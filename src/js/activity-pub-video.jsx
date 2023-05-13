import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";

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
        return html`<article><video src=${this.it.iri() ?? nothing}></video></article>
        <footer>${this.renderMetadata()}</footer>`;
    }
}
