import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {ifDefined} from "lit-html/directives/if-defined.js";
import {ActivityPubItem, ActivityTypes, ActorTypes} from "./activity-pub-item";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {ActivityPubActivity} from "./activity-pub-activity";
import {until} from "lit-html/directives/until.js";
import {ActivityPubActor} from "./activity-pub-actor";
import {renderActivityByType, renderActorByType, renderObjectByType} from "./utils";

export class ActivityPubCollection extends ActivityPubObject {
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
            type: ActivityPubItem,
            converter: {
                toAttribute: (val, typ) => JSON.stringify(val),
                fromAttribute: (val, typ) => ActivityPubItem.load(val),
            },
        },
        showMetadata: {type: Boolean},
        inline: {type: Boolean},
        threaded: {type: Boolean},
    };

    constructor(showMetadata) {
        super(showMetadata);
        this.threaded = false;
    }

    renderNext() {
        if (this.it.hasOwnProperty("next")) {
            return html`<a href=${this.it.getNext()}>Next</a>`;
        }
        return nothing;
    }

    renderPrev() {
        if (this.it.hasOwnProperty("prev")) {
            return html`<a href=${this.it.getPrev()}>Prev</a>`;
        }
        return nothing;
    }

    renderPrevNext() {
        const prev = this.renderPrev();
        const next = this.renderNext();
        if (prev === nothing && next === nothing) {
            return nothing;
        }
        return html`
            <nav>
                <ul> ${ifDefined(prev)} ${ifDefined(next)}</ul>
            </nav>`;
    }

    renderItems() {
        const items = this.it.getItems();

        if (this.threaded) {
            items.sort((a, b) => -1*sortByPublished(a, b))
        }
        let itemsInline = this.inline || !(this.it.iri()?.includes('inbox') || this.it.iri()?.includes('outbox'));

        return html`${items.map(it => {
            const type = it.hasOwnProperty('type')? it.type : 'unknown';

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

    isOrdered() {
        return this.it.type.toLowerCase().includes('ordered');
    }

    render() {
        if (!ActivityPubItem.isValid(this.it)) return nothing;

        const collection = () => {
            if (this.it.getItems().length === 0) {
                return nothing;
            }

            const list = this.isOrdered()
                ? html`
                        <ol>${this.renderItems()}</ol>`
                : html`
                        <ul>${this.renderItems()}</ul>`;

            return html`
                    ${list}
                    ${this.renderPrevNext()}
                `;
        }
        return html`${collection()}`;
    }
}

export function sortByPublished(a, b) {
    const aHas = a.hasOwnProperty('published');
    const bHas = b.hasOwnProperty('published');
    if (!aHas && !bHas) {
        return (a.id <= b.id) ? 1 : -1;
    }
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return Date.parse(b.published) - Date.parse(a.published);
}
