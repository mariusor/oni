import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {activity, loadPalette} from "./utils";
import {ActivityPubItem} from "./activity-pub-item";
import {until} from "lit-html/directives/until.js";
import {TinyColor} from "@ctrl/tinycolor";


const tc = (c) => new TinyColor(c)

export class ActivityPubActor extends ActivityPubObject {
    static styles = [css`
        :host header {
            padding: 1rem;
            display: flex;
            justify-content: start;
            align-items: flex-end;
            justify-items: start;
            column-gap: 1.4rem;
        }
        header section {
            display: flex;
            flex-direction: column;
            flex-wrap: nowrap;
            align-content: center;
            justify-content: center;
            align-items: flex-start;
        }
        section h1, section h2 {
            margin: .2rem 0;
        }
        section h2 {
            font-weight: 300;
        }
        section h1 a oni-natural-language-values {
            color: var(--accent-color);
            text-shadow: 0 0 1rem var(--accent-color), 0 0 .3rem var(--bg-color);
        }
        header > a img {
            border: .1vw solid var(--accent-color);
            border-radius: 0 1.6em 1.6em 1.6em;
            shape-outside: margin-box;
            box-shadow: 0 0 1rem var(--accent-color), 0 0 .3rem var(--bg-color);
            background-color: color-mix(in srgb, var(--accent-color), transparent 80%);
            max-height: 10em;
            margin-bottom: -.4rem;
        }
        section ul {
            display: inline-block;
            margin: 0.3rem 0 0 -1.2rem;
            padding: 0.3rem 1.4rem;
            border-radius: 1.6em;
            background-color: color-mix(in srgb, var(--accent-color), transparent 80%);
        }
        @media(max-width: 480px) {
            :host header {
                display: block;
                width: auto;
            }
            :host header h1 {
                margin-top: 1rem;
            }
            section ul {
                display: none;
            }
        }
        section ul a, section ul a:visited, section ul a:active {
            color: var(--accent-color);
            text-shadow: 0 0 1rem var(--bg-color), 0 0 .3rem var(--accent-color);
        }
        section ul li {
            list-style: none;
            display: inline-block;
            margin-right: .8rem;
        }
        :host aside small::before {
            content: "(";
        }
        :host aside small::after {
            content: ")";
        }
        a[target=external] {
            font-size: .9rem;
            font-weight: light;
        }
        :host oni-natural-language-values[name=content] {
            display: block;
            margin: 0 1rem;
        }
        :host oni-natural-language-values[name=summary] {
            font-size: .8em;
        }
    `,ActivityPubObject.styles];

    constructor(it) {
        super(it);
    }

    async updateSelf(e) {
        e.stopPropagation();

        const outbox = this.it.getOutbox();

        if (!outbox || !this.authorized) return;
        let headers = {};
        if (this.authorized) {
            const auth = this._auth.authorization;
            headers.Authorization = `${auth?.token_type} ${auth?.access_token}`;
        }

        const it = this.it;
        const prop = e.detail.name;

        it[prop] = e.detail.content;

        const update = {
            type: "Update",
            actor: this.it.iri(),
            object: it,
        }

        activity(outbox, update, headers)
            .then(response => {
                response.json().then((it) => this.it = new ActivityPubItem(it));
            }).catch(console.error);
    }

    renderOAuth() {
        const endPoints = this.it.getEndPoints();
        if (!endPoints.hasOwnProperty('oauthAuthorizationEndpoint')) {
            return nothing;
        }
        if (!endPoints.hasOwnProperty('oauthTokenEndpoint')) {
            return nothing;
        }
        const authURL = new URL(endPoints.oauthAuthorizationEndpoint)
        const tokenURL = endPoints.oauthTokenEndpoint;

        return html`
            <oni-login-link
                    authorizeURL=${authURL}
                    tokenURL=${tokenURL}
            ></oni-login-link>`;
    }

    renderIcon() {
        const icon = this.it.getIcon();
        if (!icon) {
            return nothing;
        }
        if (typeof icon == 'string') {
            return html`<img src="${icon}" alt="icon"/>`;
        } else {
            const url = icon.id || icon.url;
            if (url) {
                return html`<img src="${url}" alt="icon"/>`;
            }
        }
        return nothing;
    }

    renderUrl() {
        let url = this.it.getUrl();
        if (!url) {
            return nothing;
        }
        if (!Array.isArray(url)) {
            url = [url];
        }

        return html`
            <ul>
                ${url.map((u) => html`
                    <li><a target="external" rel="me noopener noreferrer nofollow" href=${u}>
                        ${u}
                        <oni-icon name="external-href"></oni-icon>
                    </a></li>`)}
            </ul>`;
    }

    renderPreferredUsername() {
        const name = this.it.getPreferredUsername();
        if (name.length === 0) {
            return nothing;
        }
        return html`<oni-natural-language-values name="preferredUsername" it=${JSON.stringify(name)}></oni-natural-language-values>`;
    }

    renderSummary() {
        const summary = this.it.getSummary();
        if (summary.length === 0) {
            return nothing;
        }

        return html`<oni-natural-language-values name="summary" it=${JSON.stringify(summary)}></oni-natural-language-values>`;
    }

    renderContent() {
        const content = this.it.getContent();
        if (content.length === 0) {
            return nothing;
        }
        return html`<oni-natural-language-values name="content" it=${JSON.stringify(content)}></oni-natural-language-values>`;
    }

    async renderBgImage() {
        const palette = await loadPalette(this.it);
        if (!palette) {
            return nothing;
        }

        const col = tc(palette.bgColor);
        const haveBgImg = palette.hasOwnProperty('bgImageURL') && palette.bgImageURL.length > 0;
        if (!haveBgImg || !col) {
            return nothing;
        }

        const img = palette.bgImageURL;
        return html`:host header {
                background-size: cover;
                background-clip: padding-box;
                background-image: linear-gradient(${col.setAlpha(0.5).toRgbString()}, ${col.setAlpha(1).toRgbString()}), url(${img});
            }`;
    }

    async renderPalette() {
        const palette = await loadPalette(this.it);
        if (!palette) return nothing;

        return html`
            :host {
                --bg-color: ${palette.bgColor};
                --fg-color: ${palette.fgColor};
                --link-color: ${palette.linkColor};
                --link-visited-color: ${palette.linkVisitedColor};
                --link-active-color: ${palette.linkActiveColor};
                --accent-color: ${palette.accentColor};
            }
            ${until(this.renderBgImage(), nothing)}
        `;
    }

    collections() {
        let collections = super.collections();
        if (this.authorized) {
            const inbox = this.it.getInbox();
            if (inbox !== null ) {
                collections.push(inbox);
            }
            const liked = this.it.getLiked();
            if (liked !== null) {
                collections.push(liked);
            }
            const followers = this.it.getFollowers();
            if (followers !== null) {
                collections.push(followers);
            }
            const following = this.it.getFollowing();
            if (following !== null) {
                collections.push(following);
            }
        }
        const outbox = this.it.getOutbox();
        if (outbox !== null) {
            collections.push(outbox);
        }
        return collections;
    }

    renderCollections(slot) {
        slot = slot || html`<a href="#"></a>`;
        const c = this.collections();
        if (c.length === 0) {
            return slot;
        }
        return html`<oni-collection-links it=${JSON.stringify(c)}>${slot}</oni-collection-links>`;
    };

    render() {
        const style = html`<style>${until(this.renderPalette())}</style>`;

        const iri = this.it.iri();

        //console.info(`rendering and checking authorized: ${this.authorized}`,);
        return html`${this.renderOAuth()}
            ${style}
            <header>
                <a href=${iri}>${this.renderIcon()}</a>
                <section>
                    <h1><a href=${until(iri,"#")}>${this.renderPreferredUsername()}</a></h1>
                    <h2>${this.renderSummary()}</h2>
                    <nav>${this.renderUrl()}</nav>
                </section>
            </header>
            <nav>${ until(this.renderCollections(), html`<hr/>`)}</nav>
            ${this.renderContent()}
        `;
    }
}
