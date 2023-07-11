import {html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";

export class ActivityPubTag extends ActivityPubObject {
    static styles = ActivityPubObject.styles;

    constructor(it) {
        super(it);
    }

    render() {
        if (this.it == null) {
            return nothing;
        }
        const rel = this.it.type === 'Mention' ? 'mention' : 'tag';
        return html`<span><a rel="${rel}" href="${this.it.iri()}">${this.it.getName()}</a></span>`;
    }
}
