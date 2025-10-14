import {ActivityPubObject} from "./activity-pub-object";
import {css, html, nothing} from "lit";
import {ActivityTypes, ActorTypes} from "./activity-pub-item";
import {pluralize, renderActivityByType, renderActorByType, renderObjectByType} from "./utils";
import {until} from "lit-html/directives/until.js";
import {fetchActivityPubIRI} from "./client";
import {ActivityPubActivity} from "./activity-pub-activity";
import {Thread} from "./items-threading";
import {sortByPublished} from "./activity-pub-collection";
import {when} from "lit-html/directives/when.js";
import {map} from "lit-html/directives/map.js";

export class ActivityPubItems extends ActivityPubObject {
    static styles = [css`
        ul, ol { width: 100%; }
        :host ul, :host ol {
            padding: 0;
            margin: 0;
            list-style: none;
        }
        :host(.attachment) ul {
            display: flex;
            gap: .2rem;
            justify-content: flex-start;
            flex-wrap: wrap;
        }
        :host(.tag) ul {
            display: inline;
            margin: 0;
            padding: 0;
            font-size: .9rem;
            line-height: 1rem;
        }
        :host(.attachment) li, :host(.tag) li {
            border: 0;
        }
        :host(.attachment) li *, :host(.tag) li * {
            border: 0;
        }
        :host(.tag) ul {
            display: inline-flex;
            flex-wrap: wrap;
            padding: 0;
            margin: 0;
            gap: .12rem;
        }
        :host(.tag) li {
            list-style: none;
        }
        :host(.attachment) ul > li {
            display: inline-block;
            flex: 1 1 32%;
        }
        details ul li {
            margin-left: 1.2rem;
        }
    `, ActivityPubObject.styles];

    static properties = {
        it: {type: Array},
        threaded: {type: Boolean},
        ordered: {type: Boolean},
        parent: {type: String}
    };

    constructor(showMetadata) {
        super(showMetadata);
        if (!this.it) this.it = [];
        this.threaded = false;
        this.ordered = false;
        if (!this.parent) this.parent = null;
    }

    filterActivitiesByObjectIds() {
        if (!(this.it?.length > 0)) return;

        this.it.sort((a, b) => sortByPublished(b, a))

        let objectsIds = [];
        // NOTE(marius): if we have multiple activities operating on the same object,
        // we filter out all but the first
        this.it = this.it.filter(it => {
            if (!ActivityPubActivity.isValid(it)) return true;
            if (it.hasOwnProperty('object')) {
                if (objectsIds.indexOf(it.object.id) < 0) {
                    objectsIds.push(it.object.id);
                    return true;
                }
            }
            return false;
        });
    }

    async renderItems() {
        // TODO(marius): move this to another place
        for (let i = 0; i < this.it.length; i++) {
            let it = this.it[i];
            if (typeof it !== 'object') {
                this.it[i] = await fetchActivityPubIRI(it);
            }
        }

        const items = html`${this.it.map((it, i) => {
            return until(this.renderItem(it, i, this.inline));
        })}`;

        return until(this.ordered ? html`
            <ol>${items}</ol>` : html`
            <ul>${items}</ul>`);
    }

    renderItem(it, i, itemsInline, slot = null) {
        if (!it) {
            if (!slot) { return nothing; }
            return html`<li>${slot}</li>`;
        }

        const type = it.hasOwnProperty('type') ? it.type : 'unknown';

        let renderedItem;
        if (ActivityTypes.indexOf(type) >= 0) {
            renderedItem = renderActivityByType(it, true, itemsInline);
        } else if (ActorTypes.indexOf(type) >= 0) {
            renderedItem = renderActorByType(it, this.showMetadata, true);
        } else {
            renderedItem = renderObjectByType(it, this.showMetadata, itemsInline);
        }

        // NOTE(marius): slot is used for rendering child comments in a threaded items list
        return html`
            <li>${renderedItem}${slot}</li>`
    }

    render() {
        if (!Array.isArray(this.it)) {
            this.it = [this.it];
        }
        if (!(this.it?.length > 0)) {
            return nothing;
        }

        this.filterActivitiesByObjectIds();

        // NOTE(marius): resort the items in chronological order
        // because filter Activities by Object ids sorts it reverse chronological,
        // in order to keep the older activities in.
        this.it.sort(sortByPublished);

        return html`${
            until(
                when(
                    this.threaded,
                    () => this.renderThreadedItems(),
                    () => this.renderItems()
                )
            )}`;
    }

    renderThreaded(thread) {
        return html`
            ${map(thread, (node, i) => {
                const slot = html`${when(
                    node.children.length > 0,
                    () => html`<details><summary>${pluralize(count(node.children), 'reply')}</summary><ul>${until(this.renderThreaded(node?.children))}</ul></details>`,
                )}`;

                return html`${until(this.renderItem(node.item, i, this.inline, slot))}`;
            })}
        `;
    }

    async renderThreadedItems() {
        const thread = Thread(this.it);
        return html`
            <details open>
                <summary>${pluralize(count(thread), 'reply')}</summary>
                <ul>${until(this.renderThreaded(thread))}</ul>
            </details>`;
    }
}

const count = (children) => {
    let total = children?.length;
    children.forEach(child => { total += count(child?.children) })

    return total;
}
