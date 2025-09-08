import {ActivityPubObject} from "./activity-pub-object";
import {css, html, nothing} from "lit";
import {ActivityTypes, ActorTypes} from "./activity-pub-item";
import {renderActivityByType, renderActorByType, renderObjectByType} from "./utils";
import {until} from "lit-html/directives/until.js";
import {sortByPublished} from "./activity-pub-collection";
import {fetchActivityPubIRI} from "./client";

export class ActivityPubItems extends ActivityPubObject {
    static styles = [css`
        ul, ol { width: 100%; }
        :host ul, :host ol {
            padding: 0;
            margin: 0;
            list-style: none;
        }
        :host li {
            margin-top: .4rem;
            overflow: hidden;
            border-bottom: 1px solid var(--fg-color);
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
            width: 32%;
        }
        :host(.attachment) ul > li:has(bandcamp-embed) {
            width: 380px;
        }
    `, ActivityPubObject.styles];

    static properties = {
        it: {type: Array},
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

    async renderItems() {
        if (!Array.isArray(this.it)) {
            this.it = [this.it];
        }
        if (this.threaded) {
            this.it.sort((a, b) => -1 * sortByPublished(a, b))
        }

        for (let i = 0; i < this.it.length; i++) {
            let it = this.it[i];
            if (typeof it !== 'object') {
                this.it[i] = await fetchActivityPubIRI(it);
            }
        }

        return html`${this.it.map((it, i) => {
            return until(this.renderItem(it, i, this.inline));
        })}`
    }

    renderItem(it, i, itemsInline) {
        const type = it.hasOwnProperty('type') ? it.type : 'unknown';

        let renderedItem;
        if (ActivityTypes.indexOf(type) >= 0) {
            renderedItem = renderActivityByType(it, true, itemsInline);
        } else if (ActorTypes.indexOf(type) >= 0) {
            renderedItem = renderActorByType(it, this.showMetadata, itemsInline);
        } else {
            renderedItem = renderObjectByType(it, this.showMetadata, itemsInline);
        }

        return html`<li>${renderedItem}</li>`
    }

    render() {
        if (this.it.length === 0) {
            return nothing;
        }

        const list = this.ordered ?
            html`
                <ol>${until(this.renderItems())}</ol>` :
            html`
                <ul>${until(this.renderItems())}</ul>`;

        return html`${list}`;
    }
}

