import {css, html, LitElement, nothing} from "lit";
import {fetchActivityPubIRI, isLocalIRI, pastensify} from "./utils";
import {until} from "lit-html/directives/until.js";

export const ObjectTypes = [ 'Image', 'Audio', 'Video', 'Note', 'Article', 'Page', 'Document' ];

export class ActivityPubObject extends LitElement {
    static styles = css`
    :host aside {
        opacity: 0.8;
        font-size: 0.8rem;
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
        return [this.it.published || null];
    }

    name() {
        return [this.it.name || null];
    }

    summary() {
        return [this.it.summary || null];
    }

    content() {
        return [this.it.content || null];
    }

    renderByType() {
    }

    async renderAttributedTo() {
        const act = await this.load('attributedTo');
        if (!act) {
            return nothing;
        }

        let username = act.preferredUsername;
        if (isLocalIRI(act.id)) {
            username = `${username}@${new URL(act.id).hostname}`
        }
        return html`by <a href=${act.id}><oni-natural-language-values it=${JSON.stringify(username)}></oni-natural-language-values></a>`
    }

    renderMetadata() {
        const auth = this.renderAttributedTo();
        const published = this.it.hasOwnProperty('published') ?
            html`at <time datetime=${this.published()}>${this.published()}</time> ` :
            nothing;

        return html`<aside>Published ${published}${until(auth, "by unknown")}</aside>`
    }

    render() {
        if (this.it == null) {
            return nothing;
        }
        return html`
            <div id=${this.iri() || nothing} class=${this.type() || nothing}>
                ${this.renderMetadata()}
            </div>`
    }
}

ActivityPubObject.renderByType = function (it) {
    if (it == null) {
        return nothing;
    }
    switch (it.type) {
        case 'Video':
            return html`<oni-video it=${JSON.stringify(it)}></oni-video>`;
        case 'Audio':
            return html`<oni-audio it=${JSON.stringify(it)}></oni-audio>`;
        case 'Image':
            return html`<oni-image it=${JSON.stringify(it)}></oni-image>`;
        case 'Note':
        case 'Article':
            return html`<oni-note it=${JSON.stringify(it)}></oni-note>`;
    }
    return html`<oni-object it=${JSON.stringify(it)}></oni-object>`
}
