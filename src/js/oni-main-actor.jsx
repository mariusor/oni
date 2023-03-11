import {css, html, nothing} from "lit";
import {ActivityPubActor} from "./activity-pub-actor";
import {isAuthenticated, prefersDarkTheme, rgba, setStyles, rgb} from "./utils";
import {until} from "lit-html/directives/until.js";
import {ActivityPubObject} from "./activity-pub-object";
import {average, prominent} from "color.js";

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
    };

    constructor(it) {
        super(it);

        this.addEventListener('content.change', this.updateActivityPubItem)
    }

    async loadPalette(it) {
        const isDarkTheme = prefersDarkTheme();
        const root = document.querySelectorAll(":root").item(0);
        const defaultPalette = {
            fgColor: root.style.getPropertyValue('--fg-color'),
            bgColor: root.style.getPropertyValue('--bg-color'),
            linkColor: root.style.getPropertyValue('--link-color'),
            linkVisitedColor: root.style.getPropertyValue('--link-visited-color'),
            linkActiveColor: root.style.getPropertyValue('--link-active-color'),
            shadowColor: root.style.getPropertyValue('--fg-color'),
            colorScheme: isDarkTheme ? 'dark' : 'light',
        };

        const iconPalette = (it.hasOwnProperty('icon')) ?
            await prominent(it.icon, { amount: 5, group: 40, format: 'hex' }) : [];
        const imagePalette = (it.hasOwnProperty('image')) ?
            await prominent(it.image, { amount: 5, group: 40, format: 'hex' }) : [];

        if (iconPalette[1]) {
            defaultPalette.fgColor = iconPalette[1];
            //defaultPalette.colorScheme: getColorScheme(brightness(imagePalette[0])),
        }
        if (iconPalette[2]) {
            defaultPalette.linkColor = iconPalette[2];
            defaultPalette.shadowColor = iconPalette[2];
        }
        setStyles(defaultPalette);
        return defaultPalette;
    }

    async loadAverageImageRGB(imageURL) {
        const col = await average(imageURL );
        const avgRGB = {r: col[0], g: col[1], b: col[2]};

        const rgbLow = rgba(avgRGB, 0);
        const rgbHigh = rgba(avgRGB, 1);

        document.querySelectorAll(":root").item(0).style.setProperty('--bg-color', rgb(avgRGB));

        return `linear-gradient(${rgbLow}, ${rgbHigh}), url("${imageURL}")`;
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
        const palette = await this.loadPalette(this.it);
        console.info(`palette: `, palette);
        return html`
            :host {
                --bg-color: ${palette.bgColor};
                --fg-color: ${palette.fgColor};
                --link-color: ${palette.linkColor};
                --link-visited-color: ${palette.linkVisitedColor};
                --shadow-color: ${palette.shadowColor};
            }
        `;
    }

    render() {
        let bg = nothing;
        const root = html`${until(this.renderPalette())}`;

        if (this.it.hasOwnProperty('image')) {
            bg = html`:host div {background-image: ${until(this.loadAverageImageRGB(this.it.image))};`
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
