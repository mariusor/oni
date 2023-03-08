import {css, html, nothing} from "lit";
import {ActivityPubActor} from "./activity-pub-actor";
import {getAverageImageRGB, isAuthenticated, isLocalIRI, rgba, setStyles} from "./utils";
import {until} from "lit-html/directives/until.js";
import {ActivityPubObject} from "./activity-pub-object";

export class OniMainActor extends ActivityPubActor {
    static styles = css`
        :host {
            background-clip: padding-border;
            display: block;
            color: var(--fg-color); 
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
    `;
    static properties = {
        it: {type: Object},
    };

    constructor(it) {
        super(it);

        this.addEventListener('content.change', this.updateActivityPubItem)
    }

    async loadAverageImageRGB(imageURL) {
        const avgRGB = await getAverageImageRGB(imageURL);
        const rgbLow = rgba(avgRGB, 0);
        const rgbHigh = rgba(avgRGB, 1);
        setStyles(avgRGB)
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
        console.debug('actor has following collections', c);
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

    render() {
        let bg = nothing;
        if (this.it.hasOwnProperty('image')) {
            bg = html`
                <style> :host div {
                    background-image: ${until(this.loadAverageImageRGB(this.it.image))};
                } </style>`;
        }
        return html`${bg}
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
