import {css, html, LitElement, nothing} from "lit";
import {fetchActivityPubIRI, isLocalIRI} from "./client.js";
import {pluralize, renderHtml, renderHtmlText, renderTimestamp, sanitize, showBandCampEmbeds} from "./utils.js";
import {until} from "lit-html/directives/until.js";
import {map} from "lit-html/directives/map.js";
import {ActivityPubItem, getHref, ObjectTypes} from "./activity-pub-item";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";

export class ActivityPubObject extends LitElement {
    static styles = css`
        a:link {
            color: var(--link-color);
        }
        a:visited {
            color: var(--link-visited-color);
        }
        a:hover {
            --c: oklch(from var(--link-color) calc(l - .2) c h);
            color: var(--c);
            text-shadow: 0 0 1rem var(--c), 0 0 .3rem var(--bg-color);
        }
        a:active {
            color: oklch(from var(--link-visited-color) l c calc(h + .2));
        }
        a:has(oni-natural-language-values) {
            text-decoration: none;
        }
        article header h1 {
            display: flex;
        }
        h1 {
            margin-block: .78rem;
            font: 700 1.6rem / 1.125 sans-serif;
        }
        h2 {
            margin-block: .7rem;
            font: 700 1.4rem / 1.125 sans-serif;
        }
        h3 {
            margin-block: .62rem;
            font: 700 1.28rem / 1.125 sans-serif;
        }
        h4 {
            margin-block: .6rem;
            font: 600 1.125rem / 1.125 sans-serif;
        }
        h5 {
            margin-block: .58rem;
            font: 600 1.04rem / 1.125 sans-serif;
        }
        h6 {
            margin-block: .56rem;
            font: 600 .98rem / 1.125 sans-serif;
        }
        article {
            display: flex;
            flex-direction: column;
        }
        article header {
            width: 100%;
            align-self: start;
        }
        article aside:has(img) {
            display: grid;
            justify-content: center;
            grid-auto-flow: column;
            gap: 1rem;
        }
        :host footer {
            border-bottom: .1rem solid color-mix(in srgb, var(--accent-color), transparent 30%);
            font-size: .84rem;
            margin-top: .3rem;
            width: 100%;
            display: flex;
            flex-direction: row;
            align-self: end;
            justify-content: space-between;
            gap: 1rem;
            min-height: 1.2rem;
        }
        figure {
            margin-bottom: 0;
            position: relative;
            max-width: fit-content;
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
            display: inline-block;
            padding: 0;
            margin: 0;
        }
        .reactions li {
            list-style: none;
            display: inline-block;
            padding: 0;
            margin: 0;
        }
        .reactions li a {
            text-decoration: none;
            color: var(--fg-color);
        }
        .replies *, .attachments * {
            font-size: .9rem;
        }
        @media(max-width: 480px) {
            :host footer {
                display: inline-block;
                text-align: right;
            }
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
        if (this.it?.at(0) === '"' && this.it.at(-1) === '"') {
            this.it = this.it?.replaceAll('"', '');
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
        this.it = {};

        this.showMetadata = !!showMetadata;
        this.inline = false;

        // NOTE(marius): this method of loading the ActivityPub object from a script tag is not very robust,
        // as if any of the textual properties (content, summary, etc) contain a </script> tag, the JSON.parse() of the
        // tag content will fail. If anyone has a good solution for this, please drop a line on the mailing list.
        const json = (this.renderRoot?.querySelector('script') || this.querySelector('script'))?.text;
        if (json) {
            this.inline = false;
            this.showMetadata = true;
            // NOTE(marius): we're expecting an array here
            this.it = ActivityPubItem.load(json);
        }
    }

    async dereferenceProperty(prop) {
        if (!this.it.hasOwnProperty(prop)) {
            return null;
        }
        // TODO(marius): need to take into account if the prop is an array of strings, or an array of ActivityPubItems
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
        if (textualObjectTypes.indexOf(this.it.type) >= 0) {
            const allText = `${this.it.getContent().join()}${this.it.getSummary().join()}`;
            tags = tags.filter(tag => {
                const href = getHref(tag);
                return !allText.includes(href);
            });
        }
        if (tags.length === 0) return nothing;

        return html`
            <aside>
                <oni-items class="tag" it=${JSON.stringify(tags)} ?showMetadata=${false} ?inline=${false}></oni-items>
            </aside>`;
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
            <details @toggle=${showBandCampEmbeds} class="attachments">
                <summary>${pluralize(attachment.length, 'attachment')}</summary>
                <aside>
                    <oni-items class="attachment" it=${JSON.stringify(attachment)}></oni-items>
                </aside>
            </details>`;
    }

    renderInReplyTo() {
        if (window.location.toString().includes('replies')) {
            // NOTE(marius): ugly way to not render reply icons when in the replies page
            return nothing;
        }
        let replyTo =  this.it.getInReplyTo();
        if (!(replyTo?.length > 0)) return nothing;
        if (!Array.isArray(replyTo)) {
            replyTo = [replyTo];
        }
        return html` in reply to ${map(replyTo, reply => html`<a href="${reply ?? nothing}">
            <oni-icon title="Go to parent" name="reply"></oni-icon>
        </a>`)}`;
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
        if ((!auth || auth === nothing) && !published) {
            return nothing;
        }

        return html`
            ${until(this.renderReactions())}
            <aside>
                ${action} ${renderTimestamp(published)} ${until(auth)}
                ${until(this.renderInReplyTo())}
                ${this.renderBookmark()}
            </aside>`;
    }

    renderBookmark() {
        const icon = isLocalIRI(this.it.iri()) ? "bookmark" : "external-href";
        const name = this.it.getName();
        return html`<a href="${this.it.iri() ?? nothing}" title=${name ?? nothing}>
            <oni-icon title="Navigate ${renderHtmlText(name) ?? 'to this item'}" name=${icon}></oni-icon>
        </a>`;
    }

    renderName() {
        const name = this.it.getName();
        if (!(name?.length > 0)) return nothing;

        const icon = isLocalIRI(this.it.iri()) ? "bookmark" : "external-href";
        return html`<a href=${this.it.iri() ?? nothing}>
            <oni-natural-language-values name="name" it=${JSON.stringify(name)}></oni-natural-language-values>
            <oni-icon title="Navigate to '${renderHtmlText(name)}'" name=${icon}></oni-icon>
        </a>`;
    }

    renderContent() {
        const content = this.it.getContent();
        if (!(content?.length > 0)) return nothing;
        const type = this.it.getType().toLowerCase();
        return html`
            <oni-natural-language-values data-container-type=${type} name="content" it=${JSON.stringify(content)}></oni-natural-language-values>`;
    }

    renderSummary() {
        const summary = this.it.getSummary();
        if (!(summary.length > 0)) return nothing;

        return html`
            <oni-natural-language-values name="summary" it=${JSON.stringify(summary)}></oni-natural-language-values>`;
    }

    async renderReactions() {
        return html`<ul class="reactions">
            ${until(this.renderReactionsLikes())} 
            ${until(this.renderReactionsAnnounces())}
            ${until(this.renderReactionsReplies())}
        </ul>`;
    }

    async renderReactionsAnnounces() {
        if (!this.it.hasOwnProperty('shares') || window.location?.href?.includes('shares')) {
            return nothing;
        }
        let shares = this.it.shares;
        shares = await fetchActivityPubIRI(shares);
        if (shares.totalItems === 0) {
            return nothing;
        }

        return html`${map(groupActivities(shares),
                g => html`<li>${renderActivityGroup(g)}</li>`
        )}`;
    }

    async renderReactionsReplies() {
        if (!this.it.hasOwnProperty('replies') || window.location?.href?.includes('replies')) {
            return nothing;
        }
        let replies = this.it.replies;
        replies = await fetchActivityPubIRI(replies);
        if (replies.totalItems === 0) {
            return nothing;
        }

        return html`${map(groupActivities(replies),
                g => html`<li>${renderActivityGroup(g)}</li>`
        )}`;
    }

    async renderReactionsLikes() {
        if (!this.it.hasOwnProperty('likes') || window.location?.href?.includes('likes')) {
            return nothing;
        }
        let likes = this.it.likes;
        likes = await fetchActivityPubIRI(likes);
        if (likes.totalItems === 0) {
            return nothing;
        }

        return html`${map(groupActivities(likes),
                g => html`<li>${renderActivityGroup(g)}</li>`
        )}`;
    }

    render() {
        if (this.it == null) {
            return nothing;
        }

        return ActivityPubObject.renderByType(this.it);
    }

    static isValid(it) {
        return ActivityPubItem.isValid(it) && ObjectTypes.indexOf(it.type) >= 0;
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
    if (it.mediaType.indexOf('audio/') === 0) {
        return html`<oni-audio it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-audio>`;
    }
    if (it.mediaType.indexOf('video/') === 0) {
        return html`<oni-video it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-video>`;
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
    if (!(name?.length > 0)) {
        name = renderHtml(it.getSummary());
    }
    if (!(name?.length > 0)) {
        name = renderHtml(it.getName());
    }
    if (!(name?.length > 0)) {
        name = it.getType();
    }

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
    if (!it.hasOwnProperty('type') || !it.type) {
        return html`<oni-tag it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-tag>`;
    }
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
        return html`<a href="${it.id}">${name}</a>`;
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
        case 'Page':
            return html`<oni-page it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-page>`;
        case 'Tombstone':
            return html`<oni-tombstone it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-tombstone>`;
        case 'Mention':
            return html`<oni-tag it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-tag>`;
        case 'Event':
            return html`<oni-event it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-event>`;
    }
    return nothing;
}

const textualObjectTypes = ['Note', 'Article'];

const groupActivities = (items) =>
    Map.groupBy(items.getItems(), groupReactTypes).entries().map((iter) => {
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
            iri: items.iri(),
            type: key.toLowerCase(),
            count: value.length,
            icon: getURL(value),
            actors: actors,
        };
    });


function groupReactTypes (it) {
    if (!it?.hasOwnProperty('type')) return null;
    if (ObjectTypes.indexOf(it.type) >= 0) {
        return 'reply'; // NOTE(marius): this is a bit suspect
    }
    return it?.type;
}

function renderActivityGroup (group) {
    let count = 1;
    if (group.hasOwnProperty('count')) {
        count = group.count;
    }
    let iri = "#";
    if (group.hasOwnProperty('iri')) {
        iri = group.iri;
    }

    let icon = html`<oni-icon name="${group.type}"></oni-icon>`;
    if (group?.icon) {
        icon = html`<oni-image it=${group.icon} ?inline=${true}></oni-image>`;
    }
    const reactions = {
        'announce': 'share',
        'object': 'reply',
    }
    const reaction = reactions[group.type] ?? group.type.toLowerCase();
    return html`<a href="${iri}">${icon} ${pluralize(count, reaction)}</a>`;
}
