import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {until} from "lit-html/directives/until.js";
import {ObjectTypes, ActorTypes, ActivityPubItem} from "./activity-pub-item";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {map} from "lit-html/directives/map.js";

export class ActivityPubActivity extends ActivityPubObject {
    static styles = [
        ActivityPubObject.styles,
        css`
            :host > oni-image {
                margin-top: 1rem;
            }
        `,
    ];

    constructor() {
        super(true);
    }

    async renderActor() {
        if (!this.it.hasOwnProperty('actor')) return nothing;

        await this.dereferenceProperty('actor');
        return this.it.actor.getName();
    }

    async renderObject(showMetadata) {
        if (!this.it.hasOwnProperty('object')) return nothing;
        await this.dereferenceProperty('object');
        if (!Array.isArray(this.it.object)) {
            this.it.object = [this.it.object];
        }

        const actor = this.it.hasOwnProperty('actor')? this.it.actor : null;
        return html`${map(this.it.object, function (ob) {
            if (!ob.hasOwnProperty('attributedTo')) {
                ob.attributedTo = actor;
            }
            if (!ob.hasOwnProperty('type') || ob.type === '') {
                return html`<oni-tag it=${JSON.stringify(ob)} ?showMetadata=${showMetadata}></oni-tag>`;
            }
            if (ActorTypes.indexOf(ob.type) >= 0) {
                return html`<oni-actor it=${JSON.stringify(ob)} ?showMetadata=${showMetadata}></oni-actor>`;
            }
            if (ObjectTypes.indexOf(ob.type) >= 0) {
                return until(ActivityPubObject.renderByType(ob, showMetadata), `Loading`);
            }
            return unsafeHTML(`<!-- Unknown activity object ${ob.type} -->`);
        })}`
    }

    render() {
        if (!ActivityPubActivity.isValid(this.it)) return nothing;

        return html`${until(this.renderObject(true), "Loading")}`;
    }

    static isValid (it) {
        return ActivityPubItem.isValid(it) && it.type === 'Create' && it.hasOwnProperty('object');
    }
}

