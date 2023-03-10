import {css, html, LitElement, nothing} from "lit";
import {fetchActivityPubIRI, isLocalIRI, relativeDate} from "./utils";
import {until} from "lit-html/directives/until.js";
import {map} from "lit-html/directives/map.js";

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

export const ObjectTypes = ['Image', 'Audio', 'Video', 'Note', 'Article', 'Page', 'Document', 'Tombstone', ''];

export class ActivityPubObject extends LitElement {
    static styles = css`
        :host aside {
            opacity: 0.8;
            font-size: 0.8rem;
        }
        main {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        main > * {
            margin: .1rem;
        }
        main aside {
            align-self: end;
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
        if (!this.it.hasOwnProperty('name')) {
            return [];
        }
        let s = this.it.name;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    summary() {
        if (!this.it.hasOwnProperty('summary')) {
            return [];
        }
        let s = this.it.summary;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    content() {
        if (!this.it.hasOwnProperty('content')) {
            return [];
        }
        let s = this.it.content;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    icon() {
        if (this.it == null) {
            return null;
        }
        return this.it.hasOwnProperty('icon') ? this.it.icon : null;
    }

    recipients() {
        let recipients = [];
        if (this.it == null) {
            return recipients;
        }
        if (this.it.hasOwnProperty('to')) {
            recipients.concat(this.it.to);
        }
        if (this.it.hasOwnProperty('cc')) {
            recipients.concat(this.it.cc);
        }
        if (this.it.hasOwnProperty('bto')) {
            recipients.concat(this.it.bto);
        }
        if (this.it.hasOwnProperty('bcc')) {
            recipients.concat(this.it.bcc);
        }
        if (this.it.hasOwnProperty('audience')) {
            recipients.concat(this.it.audience);
        }
        return recipients.flat()
            .filter((value, index, array) => array.indexOf(value) === index);
    }

    async renderAttributedTo() {
        let act = await this.load('attributedTo');
        if (!act) {
            return nothing;
        }
        if (!Array.isArray(act)) {
            act = [act];
        }

        return html`by ${map(act, function (act, i) {
            let username = act.preferredUsername;
            if (!isLocalIRI(act.id)) {
                username = `${username}@${new URL(act.id).hostname}`
            }
            return html`<a href=${act.id}><oni-natural-language-values it=${JSON.stringify(username)}></oni-natural-language-values></a>`
        })}`;
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
        return html`<aside>
            Published ${until(auth)}${this.renderPublished()} 
            <a href="${this.iri() ?? nothing}"><oni-icon name="share"></oni-icon></a>
        </aside>`;
    }

    renderName() {
        const name = this.name();
        if (name.length == 0) {
            return nothing;
        }
        return html`<div>
            <a href=${this.iri()}><oni-natural-language-values name="name" it=${JSON.stringify(name)}></oni-natural-language-values></a>
        </div>`;
    }

    renderContent() {
        const content = this.content();
        if (content.length == 0) {
            return nothing;
        }
        return html`<oni-natural-language-values name="content" it=${JSON.stringify(content)}></oni-natural-language-values>`;
    }

    renderSummary() {
        const summary = this.summary();
        if (summary.length == 0) {
            return nothing;
        }
        return html`<oni-natural-language-values name="summary" it=${JSON.stringify(summary)}></oni-natural-language-values>`;
    }

    render() {
        if (this.it == null) {
            return nothing;
        }
        return ActivityPubObject.renderByType(this.it);
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
            return html`<oni-tombstone it=${JSON.stringify(it)}></oni-tombstone>`;
        case 'Mention':
            return html`<oni-tag it=${JSON.stringify(it)}></oni-tag>`;
    }
    return html`<oni-object it=${JSON.stringify(it)}></oni-object>`
}
