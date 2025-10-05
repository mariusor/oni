import {html, nothing} from "lit";
import {until} from "lit-html/directives/until.js";
import {ObjectTypes, ActorTypes} from "./activity-pub-item";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {map} from "lit-html/directives/map.js";
import {renderObjectByType} from "./utils";
import {ActivityPubActivity} from "./activity-pub-activity";

export class ActivityPubCreate extends ActivityPubActivity {
    static styles = [ActivityPubActivity.styles,];

    constructor() {
        super(true);
    }

    async renderObject(showMetadata) {
        await this.dereferenceProperty('object');
        if (typeof this.it.object !== 'object') return nothing;

        if (!Array.isArray(this.it.object)) {
            this.it.object = [this.it.object];
        }

        const actor = this.it.hasOwnProperty('actor') ? this.it.actor : null;
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
                return html`${until(renderObjectByType(ob, showMetadata, false))}`;
            }
            return unsafeHTML(`<!-- Unknown activity object ${ob.type} -->`);
        })}`;
    }

    render() {
        return html`${until(this.renderObject(this.showMetadata))}`;
    }
}

