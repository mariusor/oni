import {css, html, LitElement, nothing} from "lit";
import {fetchActivityPubIRI, isLocalIRI, relativeDate} from "./utils";
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

    url() {
        if (this.it == null) {
            return null;
        }
        return this.it.hasOwnProperty('url') ? this.it.url : null;
    }

    type() {
        if (this.it == null) {
            return null;
        }
        return this.it.hasOwnProperty('type') ? this.it.type : null;
    }

    published() {
        if (!this.it || !this.it.hasOwnProperty('published')) {
            return null;
        }
        const d = new Date();
        d.setTime(Date.parse(this.it.published));
        return d || null;
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

    attachment() {
        if (!this.it || !this.it.hasOwnProperty('attachment')) {
            return null;
        }
        return this.it.attachment;
    }

    renderAttachment() {
        const attachment = this.attachment()
        if (!attachment) {
            return nothing;
        }
        console.debug(attachment);
        if (Array.isArray(attachment)) {
            return html`<div class="attachment">${attachment.map(
                value => ActivityPubObject.renderByType(value)
            )}</div>`;
        }
        return html`<div class="attachment">${ActivityPubObject.renderByType(attachment)}</div>`
    }

    renderPublished() {
        const published = this.published()
        if (!published) {
            return nothing;
        }
        return html` <time datetime=${published.toUTCString()} title=${published.toUTCString()}>
            <oni-icon name="clock"></oni-icon> ${relativeDate(published)}
        </time>`;
    }

    renderMetadata() {
        if (!this.it.hasOwnProperty("attributedTo")){
            return nothing;
        }
        const auth = this.renderAttributedTo();
        return html`<aside>Published ${until(auth)}${this.renderPublished()}</aside>`;
    }

    renderName() {
        if (!this.it.hasOwnProperty("name")){
            return nothing;
        }
        return html`<div>
            <a href=${this.iri()}><oni-natural-language-values name="name" it=${JSON.stringify(this.name())}></oni-natural-language-values></a>
        </div>`;
    }

    renderContent() {
        if (!this.it.hasOwnProperty('content')) {
            return nothing;
        }
        return html`
            <div>
                <oni-natural-language-values name="content" it=${JSON.stringify(this.content())}></oni-natural-language-values>
            </div>`;
    }

    renderSummary() {
        if (this.it.hasOwnProperty('summary')) {
            return html`
                <aside>
                    <oni-natural-language-values name="summary" it=${JSON.stringify(this.summary())}></oni-natural-language-values>
                </aside>`;
        }
        return nothing;
    }

    render() {
        if (this.it == null) {
            return nothing;
        }
        return html`
            <div id=${this.iri() || nothing} class=${this.type() || nothing}>
                ${this.renderMetadata()}
                ${this.renderName()}
                ${this.renderSummary()}
                ${this.renderContent()}
            </div>`
    }
}

ActivityPubObject.renderByMediaType = function (it) {
    if (it == null || !it.hasOwnProperty('mediaType')) {
        return nothing;
    }
    switch (it.mediaType) {
        case 'image/png':
        case 'image/jpeg':
            return html`<oni-image it=${JSON.stringify(it)}></oni-image>`;
        default:
            return html`<a href=${it.url}>${it.name}</a>`;
    }
}

ActivityPubObject.renderByType = function (it) {
    if (it == null || !it.hasOwnProperty('type')) {
        return nothing;
    }
    switch (it.type) {
        case 'Document':
            return ActivityPubObject.renderByMediaType(it);
        case 'Video':
            return html`<oni-video it=${JSON.stringify(it)}></oni-video>`;
        case 'Audio':
            return html`<oni-audio it=${JSON.stringify(it)}></oni-audio>`;
        case 'Image':
            return html`<oni-image it=${JSON.stringify(it)}></oni-image>`;
        case 'Note':
        case 'Article':
            return html`<oni-note it=${JSON.stringify(it)}></oni-note>`;
        case 'Tombstone':
            return nothing;
    }
    return html`<oni-object it=${JSON.stringify(it)}></oni-object>`
}
