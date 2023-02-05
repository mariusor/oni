import {css, html, LitElement} from "lit";
import {fetchActivityPubIRI} from "./utils";

export class ActivityPubObject extends LitElement {
    static styles = css``;
    static properties = {it: {type: Object}};

    constructor() {
        super();
    }

    async load(prop) {
        if (!this.it.hasOwnProperty(prop)) {
            return;
        }
        let it = this.it[prop];
        if (typeof it === 'string') {
            it = await fetchActivityPubIRI(it);
        }
        return it;
    }

    iri () {
        return typeof this.it.id != 'undefined' ? this.it.id : "/";
    }

    type() {
        return this.it.hasOwnProperty('type') ? this.it.type : 'tag';
    }

    published() {
        return this.it.hasOwnProperty('published') ? this.it.published : 'unknown';
    }

    render() {
        return html`<div id=${this.iri()}></div>`
    }
}
