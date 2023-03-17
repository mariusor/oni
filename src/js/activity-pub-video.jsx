import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";

export class ActivityPubVideo extends ActivityPubObject {
    static styles = [css`
        video {
            max-width: 100%; 
            max-height: 12vw;
            align-self: start;
        }`, ActivityPubObject.styles];
    static properties = {
        it: {type: Object},
    };

    constructor(it) {
        super(it);
    }

    render() {
        return html`<article><video src=${this.iri() ?? nothing}></video> <footer>${this.renderMetadata()}</footer></article>`;
    }
}
