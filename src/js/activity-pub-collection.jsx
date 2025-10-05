import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {ifDefined} from "lit-html/directives/if-defined.js";
import {ActivityPubItem} from "./activity-pub-item";
import {urlRoot} from "./utils";
import {until} from "lit-html/directives/until.js";
import {fetchActivityPubIRI} from "./client";

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
        threaded: {type: Boolean},
        parent: {type: String},
    };

    constructor(showMetadata) {
        super(showMetadata);
        this.threaded = false;
        this.parent = null;
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

    isOrdered() {
        return this.it.type?.toLowerCase()?.includes('ordered') ?? false;
    }

    render() {
        if (!ActivityPubItem.isValid(this.it)) return nothing;

        let renderedParent = nothing;
        if (this.parent !== urlRoot(window.location.toString())) {
            if (typeof this.parent === 'string') {
                 fetchActivityPubIRI(this.parent).then(it => this.parent = it);
             }
            renderedParent = html`${until(ActivityPubObject.renderByType(this.parent, true, false))}`;
        }

        let itemsInline = this.inline || this.it.iri()?.includes('shares') || this.it.iri()?.includes('following');
        let threaded = this.threaded || this.it.iri()?.includes('replies');
        let parent = this.parent;
        if (typeof parent === 'object') parent = parent.iri();
        return html`${renderedParent}<oni-items 
                it=${JSON.stringify(this.it.getItems())} 
                ?ordered=${this.isOrdered()} 
                ?showMetadata=${this.showMetadata}
                ?inline=${itemsInline} 
                ?threaded=${threaded}
                parent=${parent ?? nothing}
        ></oni-items>
        ${this.renderPrevNext()}
        `;
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
    return Date.parse(b?.published) - Date.parse(a?.published);
}
