import {ActivityPubObject} from "./activity-pub-object";
import {css, html, nothing} from "lit";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {ActivityPubItem, ActivityTypes, ActorTypes} from "./activity-pub-item";
import {ActivityPubActivity} from "./activity-pub-activity";
import {renderActivityByType, renderActorByType, renderObjectByType} from "./utils";
import {ActivityPubActor} from "./activity-pub-actor";
import {until} from "lit-html/directives/until.js";
import {sortByPublished} from "./activity-pub-collection";

export class ActivityPubItems extends ActivityPubObject {
    static styles = [css`
        :host ul, :host ol {
            padding: 0;
            margin: 0;
            list-style: none;
        }
        :host li {
            overflow: hidden;
            border-bottom: 1px solid var(--fg-color);
        }
    `, ActivityPubObject.styles];

    static properties = {
        it: {
            type: Array,
        },
        showMetadata: {type: Boolean},
        inline: {type: Boolean},
        threaded: {type: Boolean},
        ordered: {type: Boolean},
    };

    constructor(showMetadata) {
        super(showMetadata);
        this.threaded = false;
        this.ordered = false;
        this.inline = false;
    }

    renderItems() {
        const items = this.it;

        if (this.threaded) {
            items.sort((a, b) => -1*sortByPublished(a, b))
        }
        let itemsInline = this.inline;

        return html`${items.map(it => {
            const type = it.hasOwnProperty('type') ? it.type : 'unknown';

            let renderedItem = unsafeHTML(`<!-- Unknown activity object ${type} -->`);
            if (ActivityTypes.indexOf(type) >= 0) {
                if (!ActivityPubActivity.isValidForRender(it)) return nothing;
                renderedItem = renderActivityByType(it, true, itemsInline);
            } else if (ActorTypes.indexOf(type) >= 0) {
                if (!ActivityPubActor.isValid(it)) return nothing;
                renderedItem = renderActorByType(it, this.showMetadata, itemsInline);
            } else {
                if (!ActivityPubObject.isValid(it)) return nothing;
                renderedItem = renderObjectByType(it, this.showMetadata, itemsInline);
            }

            return html` <li>${until(renderedItem)}</li>`
        })}`
    }

    render() {
        const collection = () => {
            if (this.it.length === 0) {
                return nothing;
            }

            const list = this.ordered ?
                html`<ol>${this.renderItems()}</ol>` :
                html`<ul>${this.renderItems()}</ul>`;

            return html`${list}`;
        }
        return html`${collection()}`;
    }
}

