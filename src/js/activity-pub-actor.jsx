import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {getAverageImageRGB, rgba, setStyles} from "./utils";
import {until} from "lit-html/directives/until.js";

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
    `;
    static properties = {
        it: {type: Object},
    };

    constructor(it) {
        super(it);
    }

    preferredUsername() {
        if (typeof this.it.preferredUsername == "string") {
            return [this.it.preferredUsername];
        }
        return this.it.preferredUsername == null ? [] : this.it.preferredUsername;
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
        if (false && this.it.hasOwnProperty('inbox')) {
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
        console.debug('actor has following collections', collections);
        return collections;
    }

    renderCollections() {
        if (this.collections().length > 0) {
            return html`
                <ul>${this.collections().map(value => html`
                    <li>
                        <oni-collection-link it=${value}></oni-collection-link>
                    </li>`)}
                </ul>`;
        }
        return nothing;
    };

    renderIcon() {
        if (this.it.hasOwnProperty("icon")) {
            return html`<a href=${this.iri()}> <img src=${this.it.icon}/> </a>`;
        }
        return nothing;
    }


    renderUrl() {
        if (this.it.hasOwnProperty("url")) {
            return html`
                <ul>
                    ${this.it.url.map((u) => html`
                        <li><a href=${u}>${u}</a></li>`)}
                </ul>`;
        }
        return nothing;
    }

    renderPreferredUsername() {
        if (this.it.hasOwnProperty("preferredUsername")) {
            return html`
                <h2><a href=${this.iri()}>
                    <oni-natural-language-values>${this.it.preferredUsername}</oni-natural-language-values>
                </a></h2>`;
        }
        return nothing;
    }

    renderSummary() {
        if (this.it.hasOwnProperty('summary')) {
            return html`
                <aside>
                    <oni-natural-language-values>${this.it.summary}</oni-natural-language-values>
                </aside>`;
        }
        return nothing;
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
            </div>
            ${this.renderCollections()}
            <slot></slot>
        `;
    }
}
