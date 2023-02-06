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
            return nothing;
        }
        return this.it.hasOwnProperty('id') ? this.it.id : "/";
    }

    type() {
        if (this.it == null) {
            return nothing;
        }
        return this.it.hasOwnProperty('type') ? this.it.type : 'tag';
    }

    published() {
        if (this.it == null) {
            return nothing;
        }
        return this.it.hasOwnProperty('published') ? this.it.published : nothing;
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
                    <obi-natural-language-value>${unsafeHTML(this.it.content)}</obi-natural-language-value>`;
        }
    }

    render() {
        if (this.it == null) {
            return nothing;
        }
        return html`
            <link rel="stylesheet" href="/main.css"/>
            <div id=${this.iri()} class=${this.type()}> ${this.renderByType() ?? nothing}</div>
        `
    }
}
