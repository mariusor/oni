import {css, html, nothing} from "lit";
import {until} from "lit-html/directives/until.js";
import {when} from "lit-html/directives/when.js";
import {ActivityPubActor} from "./activity-pub-actor";
import {ActivityPubObject} from "./activity-pub-object";
import {activity, isAuthorized, isMainPage, loadPalette, mainActorOutbox, renderColors} from "./utils";
import tc from "tinycolor2";
import {AuthController} from "./auth-controller";
import {ActivityPubItem} from "./activity-pub-item";

export class OniMainActor extends ActivityPubActor {
    static styles = [css`
        :host main {
            background-size: cover;
            padding: 1rem;
            background-clip: padding-box;
        }
        main header {
            display: grid;
            gap: .4rem .8rem;
            grid-template-columns: minmax(0.8fr, min-content) 1.2fr;
            grid-template-rows: 3rem auto;
            grid-template-areas: "icon name"
            "icon description";
            place-content: space-evenly start;
            justify-items: stretch;
            place-items: start;
        }
        header h1 {
            grid-area: name;
            margin: .2rem 0;
        }
        header > a {
            grid-area: icon;
            text-decoration: none;
            display: block;
        }
        header aside {
            grid-area: description;
        }
        header aside oni-natural-language-values {
            /*margin: 0 0 0 1rem;*/
            font-size: .9rem;
        }
        header h1 a oni-natural-language-values {
            color: var(--accent-color);
            text-shadow: 0 0 1rem var(--accent-color), 0 0 .3rem var(--bg-color);
        }
        header img {
            border: .1vw solid var(--accent-color);
            border-radius: 0 1.6em 1.6em 1.6em;
            shape-outside: margin-box;
            box-shadow: 0 0 1rem var(--accent-color), 0 0 .3rem var(--bg-color);
            background-color: color-mix(in srgb, var(--accent-color), transparent 80%);
            width: 100%;
            max-height: 14em;
            margin-bottom: -1.4rem;
        }
        header ul {
            margin: 0;
            padding: 0.6rem 1.4rem;
            border-radius: 1.6em;
            background-color: color-mix(in srgb, var(--accent-color), transparent 80%);
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
    `, ActivityPubObject.styles];
    static properties = {
        colors: {type: Array},
    };

    _auth = new AuthController(this);

    constructor(it) {
        super(it);
        this.addEventListener('content.change', this.updateSelf)
    }

    get authorized() {
        return this._auth.authorized && isMainPage();
    }

    async updateSelf(e) {
        e.stopPropagation();

        const outbox = this.it.outbox;
        if (!outbox || !this.authorized) return;
        let headers = {};
        if (this.authorized) {
            const auth = this._auth.authorization;
            headers.Authorization = `${auth?.token_type} ${auth?.access_token}`;
        }

        const it = this.it;
        const prop = e.detail.name;
        const val = e.detail.content;

        it[prop] = val;

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

    outbox() {
        if (!this.it.hasOwnProperty('outbox')) {
            return null;
        }
        return this.it.outbox
    }

    collections() {
        let collections = super.collections();
        if (this.it.hasOwnProperty('inbox') && this.authorized) {
            collections.push(this.it.inbox);
        }
        if (this.it.hasOwnProperty('outbox')) {
            collections.push(this.it.outbox);
        }
        if (this.it.hasOwnProperty('liked')) {
            collections.push(this.it.liked);
        }
        if (this.it.hasOwnProperty('followers')) {
            collections.push(this.it.followers);
        }
        if (this.it.hasOwnProperty('followed')) {
            collections.push(this.it.followed);
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
        if (this.it.getPreferredUsername().length > 0) {
            return html`
                <oni-natural-language-values
                        name="preferredUsername"
                        it=${JSON.stringify(this.it.getPreferredUsername())}
                        ?contenteditable=${this.authorized}
                ></oni-natural-language-values>
            `;
        }
        return nothing;
    }

    renderSummary() {
        const summary = this.it.getSummary();
        if (summary.length === 0) {
            return nothing;
        }

        return html`<oni-natural-language-values
                name="summary"
                it=${JSON.stringify(summary)}
                ?contenteditable=${this.authorized}
        ></oni-natural-language-values>`;
    }

    renderContent() {
        const content = this.it.getContent();
        if (content.length === 0) {
            return nothing;
        }
        return html`<oni-natural-language-values
                name="content"
                it=${JSON.stringify(content)}
                ?contenteditable=${this.authorized}
        ></oni-natural-language-values>`;
    }


    renderOAuth() {
        if (!this.it.hasOwnProperty('endpoints')) {
            return nothing;
        }
        const endPoints = this.it.endpoints;
        if (!endPoints.hasOwnProperty('oauthAuthorizationEndpoint')) {
            return nothing;
        }
        if (!endPoints.hasOwnProperty('oauthTokenEndpoint')) {
            return nothing;
        }
        const authURL = endPoints.oauthAuthorizationEndpoint;
        const tokenURL = endPoints.oauthTokenEndpoint;

        return html`
            <oni-login-link
                    authorizeURL=${authURL}
                    tokenURL=${tokenURL}
            ></oni-login-link>`;
    }

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
                :host main {
                    background-image: linear-gradient(${col.setAlpha(0.5).toRgbString()}, ${col.setAlpha(1).toRgbString()}), url(${img});
                }`
            )}
        `;
    }

    render() {
        const style = html`${until(this.renderPalette())}`;
        const colors = html`${until(renderColors(this.it))}`

        const iri = this.it.iri();

        console.info(`rendering and checking authorized: ${this.authorized}`, );

        const hasSlot = this.querySelectorAll('*').length > 0;
        return html`${this.renderOAuth()}
        <style>${style}</style>
        <main>
            <header>
                <a href=${iri}>${this.renderIcon()}</a>
                <h1><a href=${iri}>${this.renderPreferredUsername()}</a></h1>
                <aside>
                    ${this.renderSummary()}
                    ${this.renderUrl()}
                </aside>
            </header>
            <nav>${this.renderCollections()}</nav>
        </main>
        ${when(
            hasSlot,
                () => html`<slot></slot>`,
                () => this.renderContent()
        )}
        ${colors}
        `;
    }
}
