import {css, html, LitElement, nothing} from "lit";
import {fetchActivityPubIRI, isLocalIRI} from "./client.js";
import {pluralize, renderTimestamp, sanitize} from "./utils.js";
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
            font-size: .84rem;
        }
        details summary {
            cursor: pointer;
        }
        oni-note, oni-event, oni-video, oni-audio, oni-image, oni-tag, 
        oni-activity, oni-announce, oni-create {
            display: flex;
            flex-direction: column;
        }
        oni-note[inline], oni-event[inline], oni-video[inline],
        oni-audio[inline], oni-image[inline], oni-tag[inline], 
        oni-activity[inline], oni-announce[inline], oni-create[inline] {
            display: inline-block;
        }
        .attachment {
            display: flex;
            flex-wrap: wrap;
            gap: .2rem;
            justify-content: flex-start;
        }
        .tag {
            display: inline;
            margin: 0;
            padding: 0;
            font-size: .9rem;
            line-height: 1rem;
        }
        .reactions {
            display: flex;
            justify-content: flex-end;
            font-size: .8rem;
            line-height: 1rem;
        }
        .reactions ul {
            display: inline-block;
            padding: 0;
            margin: 0;
        }
        .reactions ul li {
            list-style: none;
            padding: 0;
            margin: 0;
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
                    this.it = value;
                }
            }).catch(console.warn);
    }

    constructor(showMetadata) {
        super();

        if (typeof showMetadata === 'undefined') showMetadata = false;

        this.showMetadata = showMetadata;

        // NOTE(marius): this method of loading the ActivityPub object from a script tag is not very robust,
        // as if any of the textual properties (content, summary, etc) contain a </script> tag, the JSON.parse() of the
        // tag content will fail. If anyone has a good solution for this, please drop a line on the mailing list.
        const json = (this.renderRoot?.querySelector('script') || this.querySelector('script'))?.text;
        if (json) {
            this.it = ActivityPubItem.load(json);
        }
    }

    async dereferenceProperty(prop) {
        if (!this.it.hasOwnProperty(prop)) {
            return null;
        }
        if (typeof this.it[prop] === 'string') {
            fetchActivityPubIRI(this.it[prop]).then(it => this.it[prop] = it);
        }
    }

    async fetchAuthor() {
        await this.dereferenceProperty('actor')
        await this.dereferenceProperty('attributedTo');
        return this.it.actor || this.it.attributedTo;
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
        const allText = this.it.getContent().join();
        tags = tags.filter(value => {
            return !(value.hasOwnProperty('id') && allText.includes(value.id));
        });
        return html`
            <aside class="tag">
                <ul>
                    ${tags.map(
                        value => html`<li>${until(ActivityPubObject.renderByType(value, false), html`Loading`)}</li>`
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

    renderInReplyTo() {
        let replyTo =  this.it.getInReplyTo();
        if (!replyTo || replyTo?.length === 0) return nothing;
        if (!Array.isArray(replyTo)) {
            replyTo = [replyTo];
        }
        return html` in reply to ${map(replyTo, reply => html`<a href="${reply ?? nothing}">
            <oni-icon title="Go to parent" name="replies"></oni-icon>
        </a>`)}`;
    }

    renderPermaLink(hideOnName = true) {
        const textualObjectTypes = ['Note', 'Article', 'Page', 'Document', 'Tombstone', 'Event', 'Mention', ''];
        const name = this.it.getName();
        const textualWithName = textualObjectTypes.indexOf(this.it.type) >= 0 && (name?.length > 0 && hideOnName);
        const icon = isLocalIRI(this.it.iri()) ? "bookmark" : "external-href";
        return !textualWithName ? html`<a href="${this.it.iri() ?? nothing}" title=${name ?? nothing}>
            <oni-icon title="Navigate to this item" name=${icon}></oni-icon>
        </a>` : nothing
    }

    renderMetadata() {
        if (!this.showMetadata) return nothing;

        let auth = nothing;
        if (this.it.hasOwnProperty("attributedTo") || this.it.hasOwnProperty('actor')) {
            auth = this.renderAuthor();
        }
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
                ${until(this.renderInReplyTo())}
                ${this.renderPermaLink()}
            </aside>`;
    }

    renderName() {
        const name = this.it.getName();
        if (name.length === 0) {
            return nothing;
        }
        return html`<a href=${this.it.iri() ?? nothing}>
            <oni-natural-language-values name="name" it=${JSON.stringify(name)}></oni-natural-language-values>
            ${this.renderPermaLink(false)}
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

        const replies = await fetchActivityPubIRI(this.it.replies);
        if (replies === null) {
            return nothing;
        }

        if (!replies.hasOwnProperty('totalItems') || replies.totalItems === 0) {
            return nothing;
        }

        return html` - <span>${pluralize(replies.totalItems, 'reply')}</span>`;
    }

    async renderAnnounceCount() {
        const shares = await fetchActivityPubIRI(this.it.shares);
        if (shares === null) {
            return nothing;
        }

        if (!shares.hasOwnProperty('totalItems') || shares.totalItems === 0) {
            return nothing;
        }

        return html` - <span>${pluralize(shares.totalItems, 'share')}</span>`;
    }

    async renderLikeCount() {
        const likes = await fetchActivityPubIRI(this.it.likes);
        if (likes === null) {
            return nothing;
        }

        if (!likes.hasOwnProperty('totalItems') || likes.totalItems === 0) {
            return nothing;
        }

        return html` - <span>${pluralize(likes.totalItems, 'like')}</span>`;
    }

    async renderReactions() {
        return html`<aside class="reactions">
            ${until(this.renderLikes())} ${until(this.renderAnnounces())}
        </aside>`;
    }

    async renderAnnounces() {
        if (!this.inFocus()) {
            return nothing;
        }

        if (!this.it.hasOwnProperty('shares')) {
            return nothing;
        }
        let shares = this.it.shares;
        shares = await fetchActivityPubIRI(shares);
        if (shares.totalItems === 0) {
            return nothing;
        }

        return html`<ul class="shares">${map(groupActivities(shares),
                g => html`<li>${renderActivityGroup(g)}</li>`
        )}</ul>`;
    }

    async renderLikes() {
        if (!this.inFocus()) {
            return nothing;
        }

        if (!this.it.hasOwnProperty('likes')) {
            return nothing;
        }
        let likes = this.it.likes;
        likes = await fetchActivityPubIRI(likes);
        if (likes.totalItems === 0) {
            return nothing;
        }

        return html`<ul class="appreciations">${map(groupActivities(likes),
                g => html`<li>${renderActivityGroup(g)}</li>`
        )}</ul>`;
    }

    async renderReplies() {
        if (!this.inFocus()) {
            return nothing;
        }

        if (!this.it.hasOwnProperty('replies')) {
            return nothing;
        }
        let replies = this.it.replies;
        replies = await fetchActivityPubIRI(replies);
        if (replies.totalItems === 0) {
            return nothing;
        }
        return html`
            <details>
                <summary>${pluralize(replies.totalItems, 'reply')}</summary>
                <oni-collection it=${JSON.stringify(replies)} ?showMetadata=${true} ?threaded=${true}></oni-collection>
            </details>`;
    }

    inFocus() {
        return this.it.iri() === window.location.href;
    }

    render() {
        if (this.it == null) {
            return nothing;
        }

        return ActivityPubObject.renderByType(this.it);
    }

    static isValid(it) {
        return ActivityPubItem.isValid(it) && ObjectTypes.indexOf(it.type) > 0;
    }
}

ActivityPubObject.renderByMediaType = function (it, showMetadata, inline) {
    it = new ActivityPubItem(it);
    if (!it?.hasOwnProperty('mediaType')) {
        return nothing;
    }

    if (it.mediaType.indexOf('image/') === 0) {
        return html`<oni-image it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-image>`;
    }
    if (it.mediaType.indexOf('text/html') === 0) {
        it.content = sanitize(it.content);
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

    name = sanitize(name);
    return html`<div><a href=${src.href}>${unsafeHTML(name) ?? src.href}</a></div>`;
}

// TODO(marius): having these functions be async renders them as [object Promise] in the HTML
ActivityPubObject.renderByType = /*async*/ function (it, showMetadata, inline) {
    if (it === null) {
        return nothing;
    }
    // if (typeof it === 'string') {
    //     it = await fetchActivityPubIRI(it);
    //     if (it === null) return nothing;
    // }
    if (inline) {
        showMetadata = false;
    }
    if (inline) {
        let name = 'tag';
        if (it.hasOwnProperty('type')) {
            name = it.type;
        }
        if (it.hasOwnProperty('name')) {
            name = it.name;
        }
        if (it.hasOwnProperty('preferredUsername')) {
            name = it.preferredUsername;
        }
        return html`a <a href="${it.id}">${name}</a>`;
    }

    if (!it.hasOwnProperty('type')) {
        return html`<oni-tag it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-tag>`;
    }

    switch (it.type) {
        case 'Document':
            return ActivityPubObject.renderByMediaType(it, showMetadata, inline);
        case 'Video':
            return html`<oni-video it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-video>`;
        case 'Audio':
            return html`<oni-audio it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-audio>`;
        case 'Image':
            return html`<oni-image it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-image>`;
        case 'Note':
        case 'Article':
            return html`<oni-note it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-note>`;
        case 'Tombstone':
            return html`<oni-tombstone it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-tombstone>`;
        case 'Mention':
            return html`<oni-tag it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-tag>`;
        case 'Event':
            return html`<oni-event it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-event>`;
    }
    return nothing;
}

const groupActivities = (activities) =>
    Map.groupBy(activities.getItems(),
        it => (it.hasOwnProperty('type') ? it.type : null)
    ).entries().map((iter) => {
        const key = iter[0];
        const value = iter[1];

        let actors = value.flatMap(appIt => {
            if (!appIt.hasOwnProperty('actor') && !appIt.hasOwnProperty('attributedTo')) return null;
            return appIt.actor??appIt.attributedTo;
        });
        actors = actors.filter((act, index) => actors.indexOf(act) === index)
        const getURL = (value) => {
            if (value.hasOwnProperty('url')) return value.url;
            if (value.hasOwnProperty('icon')) return value.icon;
            if (value.hasOwnProperty('image')) return value.image;
            if (value.hasOwnProperty('name')) return value.name;
            if (value.hasOwnProperty('content')) return value.content;
            return null;
        };
        return {
            type: key.toLowerCase(),
            count: value.length,
            icon: getURL(value),
            actors: actors,
        };
    });

function renderActivityGroup (group) {
    let count = 1;
    if (group.hasOwnProperty('count')) {
        count = group.count;
    }

    const type = `icon-${group.type}`;
    let icon = html`<oni-icon name="${type}"></oni-icon>`;
    if (group?.icon) {
        icon = html`<oni-image it=${group.icon} ?inline=${true}></oni-image>`;
    }
    return html`${icon} ${pluralize(count, group.type)}`;
}
