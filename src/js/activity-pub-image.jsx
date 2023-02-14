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
        return html`${this.renderMetadata()}
        <img src=${this.iri() ?? nothing} title="${this.name()}"/>`;
    }
}
