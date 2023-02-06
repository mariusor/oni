import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {ifDefined} from "lit-html/directives/if-defined.js";

export class ActivityPubCollection extends ActivityPubObject {
    static styles = css`
    div {
        max-width: 80%;
        overflow: hidden;
    }
    `;

    static properties = {
        it: {type: Object},
    }

    constructor() {
        super();
    }

    renderNext() {
        if (this.it.hasOwnProperty("next")) {
            return html`<a href=${this.it.next}>Next</a>`;
        }
        return nothing;
    }
    renderPrev() {
        if (this.it.hasOwnProperty("prev")) {
            return html`<a href=${this.it.prev}>Prev</a>`;
        }
        return nothing;
    }

    renderPrevNext() {
        const prev = this.renderPrev();
        const next = this.renderNext();
        if (prev == nothing && next == nothing) {
            return nothing;
        }
        return html`<nav><ul> ${ifDefined(prev)} ${ifDefined(next)} </ul></nav>`;
    }

    items() {
        if (this.it === null) { return []; }
        if (this.type().toLowerCase().includes('ordered') && this.it.hasOwnProperty('orderedItems')) {
            return this.it.orderedItems;
        } else if (this.it.hasOwnProperty('items')) {
            return this.it.items;
        }
        return [];
    }

    renderItems() {
        return html`${this.items().map(value => {
            return html`<oni-activity it=${JSON.stringify(value)}></oni-activity>`
        })}`
    }

    render() {
        if (this.items().length == 0) {
            return html`<div>Nothing to see here, please move along.</div>`;
        }
        const list = this.type().toLowerCase().includes('ordered')
            ? html`<ol>${this.renderItems()}</ol>`
            : html`<ul>${this.renderItems()}</ul>`;

        return html`<div>
            <link rel="stylesheet" href="/main.css" />
            ${list}
            ${this.renderPrevNext()}
        </div>`;
    }
}
