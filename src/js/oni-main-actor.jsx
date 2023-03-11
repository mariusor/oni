import {css, html, nothing} from "lit";
import {until} from "lit-html/directives/until.js";
import {when} from "lit-html/directives/when.js";
import {average, prominent} from "color.js";
import {ActivityPubActor} from "./activity-pub-actor";
import {ActivityPubObject} from "./activity-pub-object";
import {isAuthenticated, rgba, getColorScheme, brightness, getBestContrastColor, hexToRGB} from "./utils";

export class OniMainActor extends ActivityPubActor {
    static styles = [css`
        :host {
            background-clip: padding-border;
            display: block;
            overflow-x: hidden;
            width: 100%;
        }
        :host div {
            min-height: 12vw;
            background-size: cover;
            padding: 1rem;
        }
        :host img {
            width: 10rem;
            max-width: 20%;
            margin-right: 1rem;
            border: .3vw solid var(--shadow-color);
            border-radius: 20%;
            float: left;
            shape-outside: margin-box;
        }
        :host ul {
            padding: auto .5rem;
        }
        :host ul li {
            list-style: none;
            display: inline-block;
            margin-right: .8rem;
        }
        :host oni-natural-language-values[name=preferredUsername]::before {
            content: "~";
        }
        :host aside {
            display: inline;
        }
        :host aside small::before {
            content: "(";
        }
        :host aside small::after {
            content: ")";
        }
        a[target=external] {}
    `, ActivityPubObject.styles];
    static properties = {
        it: {type: Object},
        palette: {type: Object},
        colors: {type: Array},
        paletteLoaded: {type: Boolean},
    };

    constructor(it) {
        super(it);
        this.palette = {};

        this.addEventListener('content.change', this.updateActivityPubItem)

        const palette = JSON.parse(localStorage.getItem('palette'));
        if (palette !== null) {
            this.palette = palette;
            this.paletteLoaded = true;
        };
    }

    async loadPalette(it) {
        if (this.paletteLoaded) return this.palette;

        const iconPalette = await prominent(it.icon, { amount: 20, group: 50, format: 'hex' });

        if (it.hasOwnProperty('image')) {
            const col = await average(it.image, {format: 'hex'});

            const imagePalette = await prominent(it.image, { amount: 20, group: 50, format: 'hex' });

            this.palette.bgColor = col;
            this.palette.fgColor = getBestContrastColor(this.palette.bgColor, imagePalette);
            this.palette.colorScheme = getColorScheme(brightness(this.palette.bgColor));
            this.palette.bgImageURL = it.image;
        }

        this.palette.linkColor = getBestContrastColor(this.palette.bgColor, iconPalette);
        this.palette.linkActiveColor = getBestContrastColor(this.palette.bgColor, iconPalette);
        this.palette.linkVisitedColor = getBestContrastColor(this.palette.bgColor, iconPalette);
        this.palette.shadowColor = this.palette.linkColor;

        this.paletteLoaded = true;

        localStorage.setItem('palette', JSON.stringify(this.palette));
        return this.palette;
    }

    collections() {
        let collections = super.collections();
        if (this.it.hasOwnProperty('inbox') && isAuthenticated()) {
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
        return html`<oni-collection-links it=${JSON.stringify(c)}></oni-collection-links>`;
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

    renderIconName() {
        return html`
            <a href=${this.iri()}> ${this.renderIcon()}</a>
            <h2><a href=${this.iri()}>${this.renderPreferredUsername()}</a></h2>
        `;
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
            <ul>
                ${url.map((u) => html`
                    <li><a target="external" rel="me noopener noreferrer nofollow" href=${u}>
                        <oni-icon name="external-href"></oni-icon>
                        ${u}</a></li>`)}
            </ul>`;
    }

    renderPreferredUsername() {
        if (this.preferredUsername().length > 0) {
            return html`
                <oni-natural-language-values
                    name="preferredUsername" 
                    it=${JSON.stringify(this.preferredUsername())}
                ></oni-natural-language-values>
            `;
        }
        return nothing;
    }

    updateActivityPubItem(e) {
        const it = this.it;
        const prop = e.detail.name;
        const val = e.detail.content;
        it[prop] = val;
        console.debug('will update', it);
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
            <oni-login-link authorizeURL=${authURL} tokenURL=${tokenURL}></oni-login-link>`;
    }

    async renderPalette() {
        this.palette = await this.loadPalette(this.it);
        if (!this.palette) {
            return nothing;
        }

        const p = this.palette;
        return html`
            :host {
                --bg-color: ${p.bgColor};
                --fg-color: ${p.fgColor};
                --link-color: ${p.linkColor};
                --link-visited-color: ${p.linkVisitedColor};
                --link-active-color: ${p.linkActiveColor};
                --shadow-color: ${p.shadowColor};
            }
            ${when(p.bgImageURL.length > 0, () => html`
                :host div {
                    background-image: linear-gradient(${rgba(hexToRGB(p.bgColor), 0)}, ${rgba(hexToRGB(p.bgColor), 1)}), url(${p.bgImageURL});
                }`, () => html`
                :host div {
                    background-image: linear-gradient(${rgba(hexToRGB(p.bgColor), 0)}, ${rgba(hexToRGB(p.bgColor), 1)});
                }`
            )}
        `;
    }

    render() {
        let bg = nothing;
        const root = html`${until(this.renderPalette())}`;

        if (this.it.hasOwnProperty('image')) {
            bg = html``
        }

        return html`<style>${root}${bg}</style>
        <div>
            ${this.renderIconName()}
            ${this.renderSummary()}
            ${this.renderUrl()}
            ${this.renderOAuth()}
        </div>
        ${this.renderCollections()}
        <slot></slot>`;
    }
}
