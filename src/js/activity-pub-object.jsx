import {css, html, LitElement, nothing} from "lit";
import {fetchActivityPubIRI, isLocalIRI, pluralize, renderTimestamp} from "./utils";
import {until} from "lit-html/directives/until.js";
import {map} from "lit-html/directives/map.js";
import {ActivityPubItem, ObjectTypes} from "./activity-pub-item";

export class ActivityPubObject extends LitElement {
    static styles = css`
        :host {
            color: var(--fg-color);
        }
        a {
            color: var(--link-color);
        }
        a:hover {
            text-shadow: 0 0 1rem var(--accent-color), 0 0 .3rem var(--bg-color);
        }
        a:visited {
            color: var(--link-visited-color);
        }
        a:active {
            color: var(--link-active-color);
        }
        p a[rel=mention], p a[rel=tag] {
            font-size: .9rem;
            font-weight: bold;
        }
        article > * {
            margin: .1rem;
        }
        article header * {
            padding: 0;
            margin: 0;
        }
        article header h2 {
            font-size: 1.2rem;
        }
        article header h1 {
            font-size: 1.2rem;
        }
        article {
            display: flex;
            flex-direction: column;
        }
        article header {
            align-self: start;
        }
        :host footer {
            align-self: end;
        }
        footer aside {
            font-size: 0.8em;
        }
        oni-activity, oni-note, oni-event, oni-video, oni-audio, oni-tag {
            margin-top: 1rem;
            display: flex;
            flex-direction: column;
        }
        .attachment {
            display: flex;
        }
        .attachment > * {
            display: inline-block;
            max-width: 30%;
        }
    `;

    static properties = {
        it: {
            type: ActivityPubItem,
            converter: {
                toAttribute : (value, type) => {
                    return JSON.stringify(value);
                },
                fromAttribute : (value, type)  => {
                    return new ActivityPubItem(JSON.parse(value));
                },
            },
        },
        showMetadata: {type: Boolean},
        inline: {type: Boolean},
    };

    constructor(it, showMetadata) {
        super();
        if (typeof it === 'string') {
            fetchActivityPubIRI(it).then(value => this.it = value);
        } else {
            this.it = it;
        }
        this.showMetadata = showMetadata;

        const json = this.querySelector('script')?.text;
        if (json && this.it === null) {
            this.it = new ActivityPubItem(JSON.parse(json));
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

    async fetchAuthor() {
        if (this.it.hasOwnProperty('actor')) {
            return await this.load('actor');
        }
        if (this.it.hasOwnProperty('attributedTo')) {
            return await this.load('attributedTo');
        }
        return null;
    }

    async renderAuthor() {
        let act = await this.fetchAuthor();
        if (!act) return nothing;

        if (!Array.isArray(act)) {
            act = [act];
        }

        return html`by ${map(act, function (act, i) {
            let username = act.preferredUsername;
            if (!isLocalIRI(act.id)) {
                username = `${username}@${new URL(act.id).hostname}`
            }
            return html`<a href=${act.id}><oni-natural-language-values name="preferredUsername" it=${JSON.stringify(username)}></oni-natural-language-values></a>`
        })}`;
    }

    renderAttachment() {
        let attachment = this.it.getAttachment();
        if (!attachment) {
            return nothing;
        }
        if (!Array.isArray(attachment)) {
            attachment = [attachment];
        }
        return html`
            <details>
                <summary>${pluralize(attachment.length, 'attachment')}</summary>
                <aside class="attachment">
                ${attachment.map(
                        value => until(ActivityPubObject.renderByType(value), html`Loading`)
                )}</aside>
            </details>`;
    }

    renderBookmark() {
        const hasName = this.it.getName().length > 0;
        return !hasName ? html`<a href="${this.it.iri() ?? nothing}"><oni-icon name="bookmark"></oni-icon></a>` : nothing
    }

    renderMetadata() {
        if (!this.showMetadata) return nothing;
        if (!this.it.hasOwnProperty("attributedTo") && !this.it.hasOwnProperty('actor'))  return nothing;

        const auth = this.renderAuthor();
        let action = 'Published';

        let published = this.it.getPublished();
        const updated = this.it.getUpdated();
        if (updated && updated > published) {
            action = 'Updated';
            published = updated;
        }
        return html`<aside>
            ${action} ${renderTimestamp(published)} ${until(auth)}
            ${until(this.renderReplyCount())}
            ${this.renderBookmark()}
        </aside>`;
    }

    renderName() {
        const name = this.it.getName();
        if (name.length === 0) {
            return nothing;
        }
        return html`<a href=${this.it.iri() ?? nothing}>
            <oni-natural-language-values name="name" it=${JSON.stringify(name)}></oni-natural-language-values><oni-icon name="bookmark"></oni-icon>
        </a>`;
    }

    renderContent() {
        const content = this.it.getContent();
        if (content.length === 0) {
            return nothing;
        }
        return html`<oni-natural-language-values name="content" it=${JSON.stringify(content)}></oni-natural-language-values>`;
    }

    renderSummary() {
        const summary = this.it.getSummary();
        if (summary.length === 0) {
            return nothing;
        }

        return html`<oni-natural-language-values name="summary" it=${JSON.stringify(summary)}></oni-natural-language-values>`;
    }

    async renderReplyCount() {
        if (this.inFocus()) {
            return nothing;
        }

        const replies = await this.load('replies');
        if (replies === null) {
            return nothing;
        }

        if (!replies.hasOwnProperty('totalItems') || replies.totalItems == 0) {
            return nothing;
        }

        return html` - <span>${pluralize(replies.totalItems, 'reply')}</span>`;
    }

    async renderReplies() {
        if (!this.inFocus()) {
            return nothing;
        }

        const replies = await this.load('replies');
        if (replies === null) {
            return nothing;
        }

        return html`<oni-collection it=${JSON.stringify(replies)}></oni-collection>`;
    }

    inFocus() {
        return this.it.iri() === window.location.href;
    }

    render() {
        if (this.it == null) {
            return nothing;
        }

        return html`${until(ActivityPubObject.renderByType(this.it), html`Loading`)}${until(this.renderReplies())}`;
    }
}

ActivityPubObject.renderByMediaType = function (it, inline) {
    if (!it?.hasOwnProperty('mediaType')) {
        return nothing;
    }

    if (it.mediaType.indexOf('image/') === 0) {
        return html`<oni-image it=${JSON.stringify(it)} ?inline=${inline}></oni-image>`;
    }
    return html`<a href=${it.url}>${it.name}</a>`;
}

ActivityPubObject.renderByType = async function (it, showMetadata) {
    if (it == null ) {
        return nothing;
    }

    if (typeof it === 'string') {
        it = await fetchActivityPubIRI(it);
    }

    if (!it.hasOwnProperty('type')) {
        return html`<oni-tag it=${JSON.stringify(it)} ?showMetadata=${showMetadata}></oni-tag>`;
    }

    switch (it.type) {
        case 'Document':
            return ActivityPubObject.renderByMediaType(it);
        case 'Video':
            return html`<oni-video it=${JSON.stringify(it)} ?showMetadata=${showMetadata}></oni-video>`;
        case 'Audio':
            return html`<oni-audio it=${JSON.stringify(it)} ?showMetadata=${showMetadata}></oni-audio>`;
        case 'Image':
            return html`<oni-image it=${JSON.stringify(it)} ?showMetadata=${showMetadata}></oni-image>`;
        case 'Note':
        case 'Article':
            return html`<oni-note it=${JSON.stringify(it)} ?showMetadata=${showMetadata}></oni-note>`;
        case 'Tombstone':
            return html`<oni-tombstone it=${JSON.stringify(it)} ?showMetadata=${showMetadata}></oni-tombstone>`;
        case 'Mention':
            return html`<oni-tag it=${JSON.stringify(it)} ?showMetadata=${showMetadata}></oni-tag>`;
        case 'Event':
            return html`<oni-event it=${JSON.stringify(it)} ?showMetadata=${showMetadata}></oni-event>`;
    }
    return nothing;
}

ActivityPubObject.validForRender = function (it) {
    return ObjectTypes.indexOf(it.type) > 0;
}
