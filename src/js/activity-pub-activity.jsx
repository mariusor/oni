import {css, html, nothing} from "lit";
import {ActivityPubObject, ObjectTypes} from "./activity-pub-object";
import {until} from "lit-html/directives/until.js";
import {ActorTypes} from "./activity-pub-actor";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";

export const ActivityTypes = [ 'Create', 'Update', 'Delete', 'Accept', 'Reject', 'TentativeAccept', 'TentativeReject', 'Follow', 'Block', 'Ignore' ];

export class ActivityPubActivity extends ActivityPubObject {
    static styles = css` :host { color: var(--fg-color); }`;

    constructor() {
        super();
    }

    async renderActor() {
    }

    async renderObject() {
        const raw = await this.load('object');
        if (raw === null) {
            return nothing;
        }
        if (!raw.hasOwnProperty('attributedTo')) {
            raw.attributedTo = this.it.actor;
        }
        if (ActorTypes.indexOf(raw.type) >= 0) {
            return html`<oni-actor it=${JSON.stringify(raw)}></oni-actor>`
        }
        if (ObjectTypes.indexOf(raw.type) >= 0) {
            return ActivityPubObject.renderByType(raw);
        }
        return unsafeHTML(`<!-- Unknown activity object ${raw.type} -->`);
    }

    render() {
        if (!ActivityPubActivity.validForRender(this.it)) { return nothing; }
        return html`${until(this.renderObject())} ${unsafeHTML(`<!-- Actor ${until(this.renderActor())}-->`)}`;
    }
}

ActivityPubActivity.validForRender = function (it) {
    let validType = (it.hasOwnProperty('type') && it.type === 'Create');
    if (it.hasOwnProperty('object')) {
        if (it.object.hasOwnProperty('type') && it.object.type == 'Tombstone') {
            return false;
        }
    }
    return validType;

}
