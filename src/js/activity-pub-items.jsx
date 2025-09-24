import {ActivityPubObject} from "./activity-pub-object";
import {css, html, nothing} from "lit";
import {ActivityPubItem, ActivityTypes, ActorTypes} from "./activity-pub-item";
import {pluralize, renderActivityByType, renderActorByType, renderObjectByType} from "./utils";
import {until} from "lit-html/directives/until.js";
import {fetchActivityPubIRI} from "./client";
import {ActivityPubActivity} from "./activity-pub-activity";
import {Thread} from "./items-threading";
import {sortByPublished} from "./activity-pub-collection";
import {when} from "lit-html/directives/when.js";

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
        :host ul details summary {
            margin-left: -.8rem;
        }
        :host ul details {
            padding-left: 1.2rem;
        }
        li > oni-image, li > oni-audio, li > oni-video {
            margin-top: .6rem;
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

    renderItem(it, i, itemsInline, slot) {
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
            <li>${until(renderedItem)}${slot}</li>`
    }

    render() {
        if (!Array.isArray(this.it)) {
            this.it = [this.it];
        }
        if (!(this.it?.length > 0)) {
            return nothing;
        }

        this.filterActivitiesByObjectIds();

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
            ${thread.map((node, i) => {
                const slot = html`${when(
                    node.children.length > 0,
                    () => html`<details open><summary>${pluralize(node.children.length, 'reply')}</summary><ul>${until(this.renderThreaded(node.children))}</ul></details>`,
                )}`;

                if (node.item === null) return html`${slot}`;
                return until(this.renderItem(node.item, i, this.inline, slot));
            })}
        `;
    }

    async renderThreadedItems() {
        this.it.sort(sortByPublished);

        return html`
            <ul>${this.renderThreaded(Thread(this.it))}</ul> `;
    }
}

