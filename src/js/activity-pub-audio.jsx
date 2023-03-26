import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";

export class ActivityPubAudio extends ActivityPubObject {
    static styles = [css`
        audio {
            max-width: 100%; 
            max-height: 12vw;
            align-self: start;
        }`, ActivityPubObject.styles];

    constructor(it) {
        super(it);
    }

    render() {
        return html`<article><audio src=${this.iri() ?? nothing}></audio> <footer>${this.renderMetadata()}</footer></article>`;
    }
}
