import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {activity, loadPalette} from "./utils";
import {ActivityPubItem} from "./activity-pub-item";
import {until} from "lit-html/directives/until.js";
import {when} from "lit-html/directives/when.js";
import {TinyColor} from "@ctrl/tinycolor";


const tc = (c) => new TinyColor(c)

export class ActivityPubActor extends ActivityPubObject {
    static styles = [css`
        :host section {
            padding: 1rem;
            background-size: cover;
            background-clip: padding-box;
            display: grid;
            gap: 2em;
            justify-content: start;
            align-items: center;
            justify-items: start;
            grid-template-areas: "icon description";
            grid-template-columns: minmax(0, min-content) auto;
        }
        section header {
            grid-area: description;
            width: fit-content;
            min-width: 0;
        }
        header h1 {
            margin: .2rem 0;
        }
        header h1 a oni-natural-language-values {
            color: var(--accent-color);
            text-shadow: 0 0 1rem var(--accent-color), 0 0 .3rem var(--bg-color);
        }
        section > a {
            min-width: 0;
            grid-area: icon;
            text-decoration: none;
            display: inline-block;
            align-self: start;
        }
        section > a img {
            border: .1vw solid var(--accent-color);
            border-radius: 0 1.6em 1.6em 1.6em;
            shape-outside: margin-box;
            box-shadow: 0 0 1rem var(--accent-color), 0 0 .3rem var(--bg-color);
            background-color: color-mix(in srgb, var(--accent-color), transparent 80%);
            max-height: 14em;
            margin-bottom: -1.4rem;
        }
        header ul {
            display: inline-block;
            padding: 0.3rem 1.4rem;
            margin-left: -1.4rem;
            border-radius: 1.6em;
            background-color: color-mix(in srgb, var(--accent-color), transparent 80%);
        }
        @media(max-width: 480px) {
            :host section {
                display: inline-block;
                width: 100%;
            }
            :host section h1 {
                margin-top: 1rem;
            }
            header ul {
                display: none;
            }
        }
        header ul a, header ul a:visited, header ul a:active {
            color: var(--accent-color);
            text-shadow: 0 0 1rem var(--bg-color), 0 0 .3rem var(--accent-color);
        }
        header ul li {
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

        this.addEventListener('content.change', this.updateSelf)
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

    collections() {
        let collections = super.collections();
        const outbox = this.it.getOutbox();
        if (outbox !== null) {
            collections.push(outbox);
        }
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
        return collections;
    }

    renderCollections() {
        const c = this.collections();
        if (c.length === 0) {
            return nothing;
        }
        return html`<oni-collection-links it=${JSON.stringify(c)}></oni-collection-links>`;
    };

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


    // renderIcon() {
    //     const icon = this.it.getIcon();
    //     if (!icon) {
    //         return nothing;
    //     }
    //     if (typeof icon == 'string') {
    //         return html`<oni-image it=${JSON.stringify(icon)} ?inline=${this.inline}></oni-image>`;
    //     } else {
    //         return ActivityPubObject.renderByMediaType(icon, this.inline);
    //     }
    // }
    // renderIconName() {
    //         let username = this.it.getPreferredUsername();
    //         const iri = this.it.iri();
    //         if (!isLocalIRI(iri)) {
    //             username = `${username}@${new URL(iri).hostname}`
    //         }
    //         return html`
    //             <a href=${iri}> ${this.renderIcon()} ${username}</a>
    //         `;
    // }

    // renderUrl() {
    //     let url = this.it.getUrl();
    //     if (!url) return nothing;
    //     if (!Array.isArray(url)) url = [url];
    //
    //     return html`
    //         <ul>
    //             ${url.map((u) => html`
    //                 <li><a target="external" rel="me noopener noreferrer nofollow" href=${u}>
    //                     <oni-icon name="external-href"></oni-icon>
    //                     ${u}</a></li>`)}
    //         </ul>`;
    // }
    // renderPreferredUsername() {
    //     if (this.it.getPreferredUsername().length === 0) {
    //         return nothing;
    //     }
    //     return html`<oni-natural-language-values it=${JSON.stringify(this.preferredUsername())}></oni-natural-language-values>`;
    // }

    async renderPalette() {
        const palette = await loadPalette(this.it);
        if (!palette) return nothing;

        const col = tc(palette.bgColor);
        const haveBgImg = palette.hasOwnProperty('bgImageURL') && palette.bgImageURL.length > 0 && col;
        const img = palette.bgImageURL;
        return html`
            :host {
                --bg-color: ${palette.bgColor};
                --fg-color: ${palette.fgColor};
                --link-color: ${palette.linkColor};
                --link-visited-color: ${palette.linkVisitedColor};
                --link-active-color: ${palette.linkActiveColor};
                --accent-color: ${palette.accentColor};
            }
            ${when(haveBgImg, () => html`
                :host section {
                    background-image: linear-gradient(${col.setAlpha(0.5).toRgbString()}, ${col.setAlpha(1).toRgbString()}), url(${img});
                }`
        )}
        `;
    }


    render() {
        const style = html`${until(this.renderPalette())}`;

        const iri = this.it.iri();

        //console.info(`rendering and checking authorized: ${this.authorized}`,);
        return html`${this.renderOAuth()}
            <style>${style}</style>
            <section>
                <a href=${iri}>${this.renderIcon()}</a>
                <header>
                    ${this.renderUrl()}
                    <h1><a href=${until(iri,"#")}>${this.renderPreferredUsername()}</a></h1>
                    ${this.renderSummary()}
                </header>
            </section>
            <nav>${ until(this.renderCollections(), html`<hr/>`)}</nav>
            ${this.renderContent()}
        `;
    }
}
