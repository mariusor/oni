import {css, html, LitElement, nothing} from "lit";
import {fetchActivityPubIRI} from "./utils";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";

export class ActivityPubObject extends LitElement {
    static styles = css``;
    static properties = {it: {type: Object}};

    constructor(it) {
        super();
        this.it = it;
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

    renderByType() {
        if (this.it == null) {
            return nothing;
        }
        switch (this.it.type) {
            case 'Image':
                return html`<img src=${this.it.id ?? nothing}/>`;
            case 'Note':
                return html`
                    <obi-natural-language-value>${unsafeHTML(this.it.content) ?? nothing}</obi-natural-language-value>`;
        }
    }

    render() {
        if (this.it == null) {
            return nothing;
        }
        return html`
            <link rel="stylesheet" href="/main.css"/>
            <div id=${this.iri() || nothing} class=${this.type() || nothing }> ${this.renderByType() ?? nothing}</div>
        `
    }
}
