import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {until} from "lit-html/directives/until.js";
import {ObjectTypes, ActivityPubItem, ActivityTypes} from "./activity-pub-item";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {map} from "lit-html/directives/map.js";
import {pastensify, renderActorByType, renderObjectByType, renderTimestamp} from "./utils";

export class ActivityPubActivity extends ActivityPubObject {
    static styles = [
        ActivityPubObject.styles,
        css`
            :host > oni-image {
                margin-top: .6rem;
            }
        `,
    ];

    constructor() {
        super(true);
    }

    renderInline() {
        if (!this.it.hasOwnProperty('actor')) return nothing;
        const action = pastensify(this.it.type, true);
        return html`
            ${renderObjectByType(this.it.getObject(), false, true)}
            ${action} by ${renderActorByType(this.it.getActor(), false, true)}
            ${renderTimestamp(this.it.getPublished(), true)}`;
    }

    async renderActor(showMetadata) {
        if (!this.it.hasOwnProperty('actor')) return nothing;

        await this.dereferenceProperty('actor');
        return this.it.actor.getPreferredUsername() ?? this.it.actor.getName();
    }

    async renderObject(showMetadata) {
        if (!this.it.hasOwnProperty('object')) return nothing;
        await this.dereferenceProperty('object');
        if (!Array.isArray(this.it.object)) {
            this.it.object = [this.it.object];
        }

        const actor = this.it.hasOwnProperty('actor')? this.it.actor : null;
        return html`${map(this.it.object, function (ob) {
            if (ObjectTypes.indexOf(ob.type) >= 0) {
                return renderObjectByType(ob, showMetadata, true);
            }
            return unsafeHTML(`<!-- Unknown activity object ${ob.type} -->`);
        })}`;
    }

    render() {
        if (!ActivityPubActivity.isValidForRender(this.it)) return unsafeHTML(`<!-- Unknown Activity type ${this.it.type} -->`);

        return html`${until(this.renderObject(false))}`;
    }

    static isValid (it) {
        return ActivityPubItem.isValid(it) && ActivityTypes.indexOf(it.type) >= 0 && it.hasOwnProperty('object');
    }

    static isValidForRender (it) {
        return this.isValid(it) && renderableActivityTypes.indexOf(it.type) >= 0;
    }
}

const renderableActivityTypes = ['Create', 'Announce', 'Like', 'Dislike', 'Delete' , 'Follow'];

// TODO(marius): having these functions be async renders them as [object Promise] in the HTML
ActivityPubActivity.renderByType = /*async*/ function (it, showMetadata, inline) {
    if (it === null) {
        return nothing;
    }
    // if (typeof it === 'string') {
    //     it = await fetchActivityPubIRI(it);
    //     if (it === null) return nothing;
    // }
    switch (it.type) {
    //     case 'Delete':
    //         return html`<oni-delete it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-delete>`;
        case 'Update':
        case 'Create':
            return html`<oni-create it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-create>`;
        case 'Announce':
            return html`<oni-announce it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-announce>`;
        case 'Follow':
            return html`<oni-follow it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-follow>`;
        case 'Like':
        case 'Dislike':
            return html`<oni-appreciation it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-appreciation>`;
        default:
            return html`<oni-activity it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-activity>`;
    }
}
