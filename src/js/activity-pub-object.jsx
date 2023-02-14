import {css, html, LitElement, nothing} from "lit";
import {fetchActivityPubIRI} from "./utils";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";

export class ActivityPubObject extends LitElement {
    static styles = css`
    :host img {
        max-width: 100% !important;
    }
    `;
    static properties = {it: {type: Object}};

    constructor(it) {
        super();
        if (typeof it === 'string') {
            fetchActivityPubIRI(it).then(value => this.it = value);
        } else {
            this.it = it;
        }
    }

    collections() {
        let collections = []
        if (this.it.hasOwnProperty('replies')) {
            collections.push(this.it.replies);
        }
        if (this.it.hasOwnProperty('likes')) {
            collections.push(this.it.likes);
        }
        if (this.it.hasOwnProperty('shares')) {
            collections.push(this.it.shares);
        }
        return collections;
    }

    async load(prop) {
        if (!this.it.hasOwnProperty(prop)) {
            return null;
        }
        let it = this.it[prop];
        if (typeof it === 'string') {
            it = await fetchActivityPubIRI(it);
        }
        return it;
    }

    iri() {
        if (this.it == null) {
            return null;
        }
        return this.it.hasOwnProperty('id') ? this.it.id : null;
    }

    type() {
        if (this.it == null) {
            return null;
        }
        return this.it.hasOwnProperty('type') ? this.it.type : null;
    }

    published() {
        if (this.it == null) {
            return null;
        }
        return this.it.hasOwnProperty('published') ? this.it.published : null;
    }

    summary() {
        if (typeof this.it.summary == "string") {
            return [this.it.summary];
        }
        return this.it.summary == null ? [] : this.it.summary;
    }

    renderByType() {
        if (this.it == null) {
            return nothing;
        }
        switch (this.it.type) {
            case 'Image':
                return html`<img src=${this.iri() ?? nothing} style="max-width: 100%"/>`;
            case 'Note':
                return html`
                    <oni-natural-language-values it=${this.it.content ?? nothing}></oni-natural-language-values>
                `;
        }
    }

    render() {
        if (this.it == null) {
            return nothing;
        }
        return html`
            <div id=${this.iri() || nothing} class=${this.type() || nothing}>${this.renderByType() ?? nothing}</div>
        `
    }
}
