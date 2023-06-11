import {css, html, nothing} from "lit";
import {until} from "lit-html/directives/until.js";
import {when} from "lit-html/directives/when.js";
import {ActivityPubActor} from "./activity-pub-actor";
import {ActivityPubObject} from "./activity-pub-object";
import {contrast, isAuthorized, loadPalette, prefersDarkTheme} from "./utils";
import {map} from "lit-html/directives/map.js";
import tinycolor from "tinycolor2";

export class OniMainActor extends ActivityPubActor {
    static styles = [css`
        :host main {
            background-size: cover;
            padding: 1rem;
            background-clip: padding-box;
        }
        main header {
            display: grid;
            place-content: space-evenly start;
            place-items: start;
            grid-template-areas: "icon name" "icon description";
            grid-template-rows: minmax(3rem, min-content) auto;
            grid-template-columns: minmax(1fr, min-content) auto;
            column-gap: .8rem;
            row-gap: .4rem;
        }
        header h1 {
            grid-area: name;
            margin: .2rem 0;
        }
        header > a {
            grid-area: icon;
            text-decoration: none;
        }
        header aside {
            grid-area: description;
        }
        header aside oni-natural-language-values {
            margin: 0 0 .8rem 1rem;
            font-size: .9rem;
        }
        header h1 a oni-natural-language-values {
            color: var(--shadow-color);
            text-shadow: 0 0 1rem var(--shadow-color), 0 0 .3rem var(--bg-color);
        }
        header img {
            border: .1vw solid var(--shadow-color);
            border-radius: 0 1.6em 1.6em 1.6em;
            shape-outside: margin-box;
            max-height: 12vw;
            min-width: 12hw;
            box-shadow: 0 0 1rem var(--shadow-color), 0 0 .3rem var(--bg-color);
        }
        header ul {
            margin: 0;
            padding: .8rem;
            border-radius: 1.6em;
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
    `, ActivityPubObject.styles];
    static properties = {
        colors: {type: Array},
        authenticated: {type: Boolean},
    };

    constructor(it) {
        super(it);
        this.authenticated = isAuthorized();
    }

    outbox() {
        if (!this.it.hasOwnProperty('outbox')) {
            return null;
        }
        return this.it.outbox
    }

    collections() {
        let collections = super.collections();
        if (this.it.hasOwnProperty('inbox') && this.authenticated) {
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
        if (c.length == 0) {
            return nothing;
        }
        return html`
            <oni-collection-links it=${JSON.stringify(c)}></oni-collection-links>`;
    };

    renderIcon() {
        const icon = this.it.getIcon();
        if (!icon) {
            return nothing;
        }
        if (typeof icon == 'string') {
            return html`<img src=${icon}/>`;
        } else {
            const url = icon.id || icon.url;
            if (url) {
                return html`<img src=${url}/>`;
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
        const palette = loadPalette(this.it);
        return html`
            <ul style="background-color: ${tinycolor(palette.bgColor).setAlpha(0.8).toRgbString()};">
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
                        ?editable=${this.authenticated}
                ></oni-natural-language-values>
            `;
        }
        return nothing;
    }

    loggedIn(e) {
        this.authenticated = true;
        localStorage.setItem("outbox", this.outbox());
    }

    loggedOut(e) {
        this.authenticated = false;
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
                    @logged.in=${this.loggedIn}
                    @logged.out=${this.loggedOut}
            ></oni-login-link>`;
    }

    async renderPalette() {
        const palette = await loadPalette(this.it);
        if (!palette) return nothing;

        const col = tinycolor(palette.bgColor);
        const haveBgImg = palette.hasOwnProperty('bgImageURL') && palette.bgImageURL.length > 0 && col;
        const img = palette.bgImageURL;
        return html`
            :host {
                --bg-color: ${palette.bgColor};
                --fg-color: ${palette.fgColor};
                --link-color: ${palette.linkColor};
                --link-visited-color: ${palette.linkVisitedColor};
                --link-active-color: ${palette.linkActiveColor};
                --shadow-color: ${palette.shadowColor};
            }
            ${when(haveBgImg, () => html`
                :host main {
                    background-image: linear-gradient(${col.setAlpha(0).toRgbString()}, ${col.setAlpha(1).toRgbString()}), url(${img});
                }`
            )}
        `;
    }

    async renderColors() {
        const palette = await loadPalette(this.it);
        if (!palette || !palette.colors)  return nothing;
        if (!window.location.hostname.endsWith('local')) return nothing;

        const colors = palette.colors;
        let ordered = colors.sort((a, b) => contrast(b, palette.bgColor) - contrast(a, palette.bgColor))
        return html`
            ${map(ordered, value => {
                return html`
                    <span style="padding: .2rem 1rem; display: inline-block; width: 9vw; background-color: ${value}; color: ${palette.bgColor}">
                ${tinycolor(value).toHsl().s}
            </span>
                `
            })}`
    }

    render() {
        const style = html`${until(this.renderPalette())}`;
        const colors = html`${until(this.renderColors())}`

        const iri = this.it.iri();
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
        <slot></slot>
        ${colors}
        `;
    }
}
