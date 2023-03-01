import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {getAverageImageRGB, isAuthenticated, rgba, setStyles} from "./utils";
import {until} from "lit-html/directives/until.js";
import {LoginLink} from "./login-elements";

export const ActorTypes = [ 'Person', 'Group', 'Application', 'Service' ];

export class ActivityPubActor extends ActivityPubObject {
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
        a[target=external] {}
    `;
    static properties = {
        it: {type: Object},
    };

    constructor(it) {
        super(it);

        this.addEventListener('content.change', this.updateActivityPubItem)
    }

    preferredUsername() {
        return [this.it.preferredUsername || []];
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
        if (this.it.hasOwnProperty("icon")) {
            return html`<a href=${this.iri()}> <img src=${this.it.icon}/> </a>`;
        }
        return nothing;
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
                    <li><a target="external" rel="me noopener noreferrer nofollow" href=${u}><oni-icon name="external-href"></oni-icon> ${u}</a></li>`)}
            </ul>`;
    }

    renderPreferredUsername() {
        if (this.preferredUsername().length > 0) {
            return html`
                <h2><a href=${this.iri()}>
                    <oni-natural-language-values name="preferredUsername" it=${JSON.stringify(this.preferredUsername())}></oni-natural-language-values>
                </a></h2>`;
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
        let authURL = `${window.location.href}/oauth/authorize`;
        let tokenURL = `${window.location.href}/oauth/token`;

        if (this.it.hasOwnProperty('endpoints')) {
            const endPoints = this.it.endpoints;
            if (endPoints.hasOwnProperty('oauthAuthorizationEndpoint')) {
                authURL = endPoints.oauthAuthorizationEndpoint;
            }
            if (endPoints.hasOwnProperty('oauthTokenEndpoint')) {
                tokenURL = endPoints.oauthTokenEndpoint;
            }
        }

        return html`<oni-login-link authorizeURL=${authURL} tokenURL=${tokenURL}></oni-login-link>`;
    }

    render() {
        let bg = nothing;
        if (this.it.hasOwnProperty('image')) {
            bg = html`<style> :host div {background-image: ${until(this.loadAverageImageRGB(this.it.image))};} </style>`;
        }
        return html`${bg}
            <div>
                ${this.renderIcon()}
                ${this.renderPreferredUsername()}
                ${this.renderSummary()}
                ${this.renderUrl()}
                ${this.renderOAuth()}
            </div>
            ${this.renderCollections()}
            <slot></slot>
        `;
    }
}
