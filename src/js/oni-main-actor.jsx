import {css, html, nothing} from "lit";
import {until} from "lit-html/directives/until.js";
import {when} from "lit-html/directives/when.js";
import {average, prominent} from "color.js";
import {ActivityPubActor} from "./activity-pub-actor";
import {ActivityPubObject} from "./activity-pub-object";
import {authorization, contrast, isAuthorized, prefersDarkTheme} from "./utils";
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
        oni-natural-language-values[name=preferredUsername]::before {
            content: "~";
        }
        a[target=external] {
            font-size: .9rem;
            font-weight: light;
        }
    `, ActivityPubObject.styles];
    static properties = {
        palette: {type: Object},
        colors: {type: Array},
        authenticated: {type: Boolean},
    };

    constructor(it) {
        super(it);
        this.palette = {};
        this.colors = [];
        this.authenticated = isAuthorized();

        this.addEventListener('content.change', this.updateActivityPubActor)
    }

    async loadPalette(it) {
        const root = document.documentElement;
        if (localStorage.getItem('palette')) {
            this.palette = JSON.parse(localStorage.getItem('palette'));
            return this.palette;
        }

        const style = getComputedStyle(root);
        this.palette = {
            bgColor: style.getPropertyValue('--bg-color').trim(),
            fgColor: style.getPropertyValue('--fg-color').trim(),
            shadowColor: style.getPropertyValue('--shadow-color').trim(),
            linkColor: style.getPropertyValue('--link-color').trim(),
            linkActiveColor: style.getPropertyValue('--link-active-color').trim(),
            linkVisitedColor: style.getPropertyValue('--link-visited-color').trim(),
            colorScheme: prefersDarkTheme() ? 'dark' : 'light',
        };

        let iconColors = await prominent(it.icon, {amount: 20, group: 30, format: 'hex', sample: 5});
        iconColors = iconColors.filter(col => tinycolor(col).toHsl().s > 0.18 && tinycolor(col).toHsl().s < 0.84)

        if (it.hasOwnProperty('image')) {
            const col = await average(it.image, {format: 'hex'});

            if (col !== null) {
                this.palette.bgColor = col;
                this.palette.colorScheme = tinycolor(col).isDark() ? 'dark' : 'light';
                this.palette.bgImageURL = it.image;
                root.style.setProperty('--bg-color', col.trim());
                root.style.setProperty('backgroundImage', `linear-gradient(${tinycolor(col).setAlpha(0).toRgb()}, ${tinycolor(col).setAlpha(1).toRgb()}), url(${it.image});`)
            }
        }

        this.colors = iconColors;

        const strongerColor = (col) => tinycolor(this.palette.bgColor).isDark() ?
            tinycolor(col).lighten(10).saturate(15)
            : tinycolor(col).darken(20).saturate(10)

        const shadowColor = tinycolor.mostReadable(this.palette.bgColor, iconColors);
        if (shadowColor !== null) {
            this.palette.shadowColor = shadowColor.toHexString();
            this.palette.linkVisitedColor = shadowColor.toHexString();
            this.palette.linkActiveColor = this.palette.linkVisitedColor;
            this.palette.linkColor = strongerColor(this.palette.linkVisitedColor)?.toHexString();
        }
        iconColors = iconColors.filter((value, index, array) => array.at(index) !== this.palette.shadowColor);
        let linkVisitedColor = tinycolor.mostReadable(this.palette.bgColor, iconColors, {level: "AAA", size: "small"});
        if (linkVisitedColor !== null && tinycolor.isReadable(linkVisitedColor, this.palette.bgColor, {
            level: "AAA",
            size: "small"
        })) {
            this.palette.linkVisitedColor = linkVisitedColor.toHexString();
            this.palette.linkActiveColor = this.palette.linkVisitedColor;
            this.palette.linkColor = strongerColor(this.palette.linkVisitedColor)?.toHexString();
        }
        localStorage.setItem('palette', JSON.stringify(this.palette));
        return this.palette;
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
        const icon = this.icon();
        if (!icon) {
            return nothing;
        }
        if (typeof icon == 'string') {
            return html`<img src=${icon}/>`;
        } else {
            return ActivityPubObject.renderByMediaType(icon);
        }
    }

    renderUrl() {
        let url = this.url();
        if (!url) {
            return nothing;
        }
        if (!Array.isArray(url)) {
            url = [url];
        }
        return html`
            <ul style="background-color: ${tinycolor(this.palette.bgColor).setAlpha(0.8).toRgbString()};">
                ${url.map((u) => html`
                    <li><a target="external" rel="me noopener noreferrer nofollow" href=${u}>
                        ${u}
                        <oni-icon name="external-href"></oni-icon>
                    </a></li>`)}
            </ul>`;
    }

    renderPreferredUsername() {
        if (this.preferredUsername().length > 0) {
            return html`
                <oni-natural-language-values
                        name="preferredUsername"
                        it=${JSON.stringify(this.preferredUsername())}
                        ?editable=${this.authenticated}
                ></oni-natural-language-values>
            `;
        }
        return nothing;
    }

    async updateActivityPubActor(e) {
        const it = this.it;
        const prop = e.detail.name;
        const val = e.detail.content;
        it[prop] = val;

        const update = {
            type: "Update",
            actor: this.iri(),
            object: it,
        }
        const headers = {
            'Content-Type': 'application/activity+json',
        }
        const auth = authorization();
        if (isAuthorized()) {
            headers.Authorization = `${auth.token_type} ${auth.access_token}`;
        }
        const req = {
            headers: headers,
            method: "POST",
            body: JSON.stringify(update)
        };
        console.debug(`will update to ${this.outbox()}`, update);
        const response = await fetch(this.outbox(), req)
            .catch(console.error);
    }

    loggedIn(e) {
        this.authenticated = true;
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
        this.palette = await this.loadPalette(this.it);
        if (!this.palette) {
            return nothing;
        }

        const p = this.palette;
        const col = tinycolor(p.bgColor);
        const img = p.bgImageURL;
        const haveBgImg = p.hasOwnProperty('bgImageURL') && img.length > 0 && col;
        return html`
            :host {
                --bg-color: ${p.bgColor};
                --fg-color: ${p.fgColor};
                --link-color: ${p.linkColor};
                --link-visited-color: ${p.linkVisitedColor};
                --link-active-color: ${p.linkActiveColor};
                --shadow-color: ${p.shadowColor};
            }
            ${when(haveBgImg, () => html`
                :host main {
                    background-image: linear-gradient(${col.setAlpha(0).toRgbString()}, ${col.setAlpha(1).toRgbString()}), url(${img});
                }`
            )}
        `;
    }

    renderColors() {
        let ordered = this.colors.sort((a, b) => contrast(b, this.palette.bgColor) - contrast(a, this.palette.bgColor))
        return html`
            ${map(ordered, value => {
                return html`
                    <span style="padding: .2rem 1rem; display: inline-block; width: 9vw; background-color: ${value}; color: ${this.palette.bgColor}">
                ${tinycolor(value).toHsl().s}
            </span>
                `
            })}`
    }

    render() {
        const style = html`${until(this.renderPalette())}`;

        return html`${this.renderOAuth()}
        <style>${style}</style>
        <main>
            <header>
                <a href=${this.iri()}>${this.renderIcon()}</a>
                <h1><a href=${this.iri()}>${this.renderPreferredUsername()}</a></h1>
                <aside>
                    ${this.renderSummary()}
                    ${this.renderUrl()}
                </aside>
            </header>
            <nav>${this.renderCollections()}</nav>
        </main>
        <slot ?contenteditable=${this.authenticated}></slot>
        `;
    }
}
