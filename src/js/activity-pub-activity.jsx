import {css, html, nothing} from "lit";
import {ActivityPubObject, ObjectTypes} from "./activity-pub-object";
import {until} from "lit-html/directives/until.js";
import {isLocalIRI} from "./utils";
import {ActorTypes} from "./activity-pub-actor";

export const ActivityTypes = [ 'Create', 'Update', 'Delete', 'Accept', 'Reject', 'TentativeAccept', 'TentativeReject', 'Follow', 'Block', 'Ignore' ];

export class ActivityPubActivity extends ActivityPubObject {
    static styles = css` :host { color: var(--fg-color); }`;

    constructor() {
        super();
    }

    async renderActor() {
        const act = await this.load('actor');
        if (act === null) {
            return nothing;
        }
        let username = act.preferredUsername;

        if (isLocalIRI(act.id)) {
            username = `${username}@${new URL(act.id).hostname}`
        }
        return html`by <a href=${act.id}>
            <oni-natural-language-values it=${username}></oni-natural-language-values>
        </a>`
    }

    async renderObject() {
        const raw = await this.load('object');
        if (raw === null) {
            return nothing;
        }
        if (!raw.hasOwnProperty('attributedTo')) {
            raw.attributedTo = this.it.actor;
        }
        if (ActorTypes.find(t => t === raw.type)) {
            return html`<oni-actor it=${JSON.stringify(raw)}></oni-actor>`
        }
        if (ObjectTypes.find(t => t === raw.type)) {
            return html`<oni-object it=${JSON.stringify(raw)}></oni-object>`
        }
        return html`<!-- Unknown activity object ${raw.type} -->`;
    }

    render() {
        if (this.type() !== 'Create') { return nothing; }
        return html` ${until(this.renderObject())} `;
    }
}
