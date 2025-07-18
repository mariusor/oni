import {css, html, LitElement, nothing} from "lit";
import {fetchActivityPubIRI} from "./client.js";
import {pluralize, renderTimestamp} from "./utils.js";
import {until} from "lit-html/directives/until.js";
import {map} from "lit-html/directives/map.js";
import {ActivityPubItem, ObjectTypes} from "./activity-pub-item";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";

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
        a:has(oni-natural-language-values) {
            text-decoration: none;
        }
        article header * {
            padding: 0;
            margin: 0;
        }
        article header h1 {
            font-size: 1.32rem;
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
        figure {
            margin-bottom: 0;
            position: relative;
            max-width: fit-content;
        }
        footer aside {
            font-size: 0.8em;
        }
        oni-activity, oni-note, oni-event, oni-video, oni-audio, oni-image, oni-tag {
            display: flex;
            flex-direction: column;
        }
        .attachment {
            display: flex;
            flex-wrap: wrap;
            gap: .2rem;
            justify-content: space-between;
        }
        .tag {
            display: inline-block;
            margin: 0;
            padding: 0;
            font-size: .8rem;
            line-height: 1rem;
        }
    `;

    static properties = {
        it: {
            type: ActivityPubItem,
            converter: {
                toAttribute: (val, typ) => JSON.stringify(val),
                fromAttribute: (val, typ) => ActivityPubItem.load(val),
            },
        },
        showMetadata: {type: Boolean},
        inline: {type: Boolean},
    };

    updated(changedProperties) {
        if (!changedProperties.has('it')) return;
        if (typeof this.it !== 'string') return;
        if (this.it.at(0) === '"' && this.it.at(-1) === '"') {
            this.it = this.it.replaceAll('"', '');
        }
        if (!URL.canParse(this.it)) return;
        fetchActivityPubIRI(this.it)
            .then(value => {
                if (typeof value === 'undefined') {
                    console.warn('invalid response received');
                } else if (!value.hasOwnProperty("id")) {
                    console.warn(`invalid return structure`, value);
                } else if (value.hasOwnProperty("errors")) {
                    console.warn(value.errors);
                } else {
                    this.it = new ActivityPubItem(value);
                }
            }).catch(console.warn);
    }

    constructor(showMetadata) {
        super();

        if (typeof showMetadata === 'undefined') showMetadata = false;

        this.showMetadata = showMetadata;

        const json = (this.renderRoot?.querySelector('script') || this.querySelector('script'))?.text;
        if (json) {
            this.it = ActivityPubItem.load(json);
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

    async dereferenceProperty(prop) {
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
            this.it.actor = await this.dereferenceProperty('actor');
            if (this.it.actor) {
                return new ActivityPubItem(this.it.actor);
            }
        }
        if (this.it.hasOwnProperty('attributedTo')) {
            this.it.attributedTo = await this.dereferenceProperty('attributedTo');
            if (this.it.attributedTo) {
                return new ActivityPubItem(this.it.attributedTo);
            }
        }
        return null;
    }

    async renderAuthor() {
        let act = await this.fetchAuthor();
        if (!act) return nothing;

        if (!Array.isArray(act)) {
            act = [act];
        }

        return html`by ${map(act, act => html`<oni-actor class="no-avatar" it=${JSON.stringify(act)} inline="true"></oni-actor>`)}`;
    }

    renderTag() {
        let tags = this.it.getTag();
        if (!tags) {
            return nothing;
        }
        if (!Array.isArray(tags)) {
            tags = [tags];
        }
        return html`
            <aside class="tag">
                <ul>
                    ${tags.map(
                            value => html`
                                <li>${until(ActivityPubObject.renderByType(value, false), html`Loading`)}</li>`
                    )}
                </ul>
            </aside>`;
    }

    showChildren(e) {
        const self = e.target;
        const show = self.open;
        self.querySelectorAll('bandcamp-embed').forEach((it) => {
            it.show = show;
        });
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
            <details @toggle=${this.showChildren}>
                <summary>${pluralize(attachment.length, 'attachment')}</summary>
                <aside class="attachment">
                    ${attachment.map(
                            value => until(ActivityPubObject.renderByType(value), html`Loading`)
                    )}
                </aside>
            </details>`;
    }

    renderBookmark() {
        const hasName = this.it.getName().length > 0;
        return !hasName ? html`<a href="${this.it.iri() ?? nothing}">
            <oni-icon alt="Bookmark this item" name="bookmark"></oni-icon>
        </a>` : nothing
    }

    renderMetadata() {
        if (!this.showMetadata) return nothing;
        if (!this.it.hasOwnProperty("attributedTo") && !this.it.hasOwnProperty('actor')) return nothing;

        const auth = this.renderAuthor();
        let action = 'Published';

        let published = this.it.getPublished();
        const updated = this.it.getUpdated();
        if (updated && updated > published) {
            action = 'Updated';
            published = updated;
        }
        return html`
            <aside>
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
            <oni-natural-language-values name="name" it=${JSON.stringify(name)}></oni-natural-language-values>
            <oni-icon alt="Bookmark" name="bookmark"></oni-icon>
        </a>`;
    }

    renderContent() {
        const content = this.it.getContent();
        if (content.length === 0) {
            return nothing;
        }
        return html`
            <oni-natural-language-values name="content" it=${JSON.stringify(content)}></oni-natural-language-values>`;
    }

    renderSummary() {
        const summary = this.it.getSummary();
        if (summary.length === 0) {
            return nothing;
        }

        return html`
            <oni-natural-language-values name="summary" it=${JSON.stringify(summary)}></oni-natural-language-values>`;
    }

    async renderReplyCount() {
        if (this.inFocus()) {
            return nothing;
        }

        const replies = await this.dereferenceProperty('replies');
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

        if (!this.it.hasOwnProperty('replies')) {
            return nothing;
        }
        const replies = this.dereferenceProperty('replies');
        if (replies === null) {
            return nothing;
        }

        return html`
            <oni-collection it=${JSON.stringify(until(replies, []))}></oni-collection>`;
    }

    inFocus() {
        return this.it.iri() === window.location.href;
    }

    render() {
        if (this.it == null) {
            return nothing;
        }

        return html`${ActivityPubObject.renderByType(this.it)}, "Loading")}${until(this.renderReplies())}`;
    }

    static isValid(it) {
        return ActivityPubItem.isValid(it) && ObjectTypes.indexOf(it.type) > 0;
    }
}

ActivityPubObject.renderByMediaType = function (it, inline) {
    it = new ActivityPubItem(it);
    if (!it?.hasOwnProperty('mediaType')) {
        return nothing;
    }

    if (it.mediaType.indexOf('image/') === 0) {
        return html`<oni-image it=${JSON.stringify(it)} ?inline=${inline}></oni-image>`;
    }
    if (it.mediaType.indexOf('text/html') === 0) {
        return unsafeHTML(it.content);
    }

    let src = it.getUrl();
    let name;
    if (typeof src === 'string') {
        src = {href: src};
        name = src;
    }
    if (!name) {
        name = it.getSummary()[0];
    }
    if (!name) {
        name = it.getName()[0];
    }
    if (!name) {
        name = it.getType();
    }

    return html`<div><a href=${src.href}>${unsafeHTML(name) ?? src.href}</a></div>`;
}

ActivityPubObject.renderByType = async function (it, showMetadata) {
    if (it === null) {
        return nothing;
    }

    if (typeof it === 'string') {
        it = await fetchActivityPubIRI(it);
        if (it === null) return nothing;
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

