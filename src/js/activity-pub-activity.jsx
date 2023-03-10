import {css, html, nothing} from "lit";
import {ActivityPubObject, ObjectTypes} from "./activity-pub-object";
import {until} from "lit-html/directives/until.js";
import {ActorTypes} from "./activity-pub-actor";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {map} from "lit-html/directives/map.js";

export const ActivityTypes = [ 'Create', 'Update', 'Delete', 'Accept', 'Reject', 'TentativeAccept', 'TentativeReject', 'Follow', 'Block', 'Ignore' ];

export class ActivityPubActivity extends ActivityPubObject {
    static styles = css` :host { color: var(--fg-color); }`;

    constructor() {
        super();
    }

    async renderActor() {
    }

    async renderObject() {
        let raw = await this.load('object');
        if (raw === null) {
            return nothing;
        }
        if (!Array.isArray(raw)) {
            raw = [raw];
        }

        const actor = this.it.hasOwnProperty('actor')? this.it.actor : null;
        return html`${map(raw, function (ob) {
            if (!ob.hasOwnProperty('attributedTo')) {
                ob.attributedTo = actor;
            }
            if (!ob.hasOwnProperty('type')) {
                return html`<oni-tag it=${JSON.stringify(ob)}></oni-tag>`;
            }
            if (ActorTypes.indexOf(ob.type) >= 0) {
                return html`<oni-actor it=${JSON.stringify(ob)}></oni-actor>`;
            }
            if (ObjectTypes.indexOf(ob.type) >= 0) {
                return ActivityPubObject.renderByType(ob);
            }
            return unsafeHTML(`<!-- Unknown activity object ${ob.type} -->`);
        })}`
    }

    render() {
        if (!ActivityPubActivity.validForRender(this.it)) { return nothing; }
        return html`${until(this.renderObject())} ${unsafeHTML(`<!-- Actor ${until(this.renderActor())}-->`)}`;
    }
}

ActivityPubActivity.validForRender = function (it) {
    return (it.type === 'Create') && it.hasOwnProperty('object');
}
