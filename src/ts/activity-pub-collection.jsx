import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {when} from "lit-html/directives/when.js";
import {ifDefined} from "lit-html/directives/if-defined.js";

export class ActivityPubCollection extends ActivityPubObject {
    static styles = css``;

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

    render() {
        const t = html`${when(
            this.type().toLowerCase().includes('ordered'),
            () => { return html`<ol id=${this.iri()}><slot></slot></ol>`},
            () => { return html`<ul id=${this.iri()}><slot></slot></ul>`},
        )}`;
        return html`<div>${t}${this.renderPrevNext()}</div>`;
    }
}
