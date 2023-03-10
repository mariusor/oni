import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";

export class ActivityPubTag extends ActivityPubObject {
    static styles = css``;

    constructor(it) {
        super(it);
    }

    render() {
        if (this.it == null) {
            return nothing;
        }
        return html`<span><a href="${this.iri()}">${this.name()}</a></span> `;
    }
}
