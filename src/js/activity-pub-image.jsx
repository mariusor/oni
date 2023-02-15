import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";

export class ActivityPubImage extends ActivityPubObject {
    static styles = [css`
        img {
            max-width: 100%; 
            max-height: 12vw;
        }
    `, ActivityPubObject.styles];
    static properties = {
        it: {type: Object},
    };

    constructor(it) {
        super(it);
    }

    render() {
        let src = this.iri();
        if (!src) {
            src = this.url();
        }
        return html`${this.renderMetadata()}
        <img src=${src ?? nothing} title="${this.name()}"/>`;
    }
}
