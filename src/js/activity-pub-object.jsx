import {css, html, LitElement, nothing} from "lit";
import {fetchActivityPubIRI, isLocalIRI, pastensify} from "./utils";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {until} from "lit-html/directives/until.js";

export class ActivityPubItem {
    id = '';
    url = '';
    actor = '';
    object = '';

    constructor(it) {
        if (it.hasOwnProperty('id')) {
            this.id = it.id;
        }
        if (it.hasOwnProperty('url')) {
            this.url = it.url;
        }
        if (it.hasOwnProperty('actor')) {
            this.actor = it.actor;
        }
        if (it.hasOwnProperty('object')) {
            this.object = it.object;
        }
        return this;
    }
}

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

    async renderAttributedTo() {
        const act = await this.load('attributedTos');
        if (!act) {
            return nothing;
        }

        let username = act.preferredUsername;
        if (isLocalIRI(act.id)) {
            username = `${username}@${new URL(act.id).hostname}`
        }
        return html`by <a href=${act.id}><oni-natural-language-values it=${username}></oni-natural-language-values></a>`
    }

    renderMetadata() {
        const auth = until(this.renderAttributedTo());
        const published = this.it.hasOwnProperty('published') ?
            html`at <time datetime=${this.published()}>${this.published()}</time> ` :
            nothing;

        return html`${until(auth, `Published ${published}${auth}<br/>`)}`
    }

    render() {
        if (this.it == null) {
            return nothing;
        }
        return html`
            <div id=${this.iri() || nothing} class=${this.type() || nothing}>
                ${this.renderByType() ?? nothing}
                ${this.renderMetadata()}
            </div>
        `
    }
}
