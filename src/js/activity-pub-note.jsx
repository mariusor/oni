import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";

export class ActivityPubNote extends ActivityPubObject {
    static styles = [css``, ActivityPubObject.styles];

    static properties = {
        it: {type: Object},
    };

    constructor(it) {
        super(it);
    }

    render() {
        return html`${this.renderMetadata()}
        <oni-natural-language-values it=${JSON.stringify(this.content())}></oni-natural-language-values>
        ${this.renderAttachment()}`
    }
}
