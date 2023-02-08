import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {getAverageImageRGB, rgba, setStyles} from "./utils";
import {until} from "lit-html/directives/until.js";

export class ActivityPubActor extends ActivityPubObject {
    static styles = css`
        :host {
            background-clip: padding-border;
            background-size: cover;
            display: block;
            color: var(--fg-color); 
            overflow-x: hidden;
            min-height: 12vw;
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

    async averageImageRGB() {
        const avgRGB = await getAverageImageRGB(this.it.image);
        const rgbLow = rgba(avgRGB, 0);
        const rgbHigh = rgba(avgRGB, 1);
        setStyles(avgRGB)
        return `linear-gradient(${rgbLow}, ${rgbHigh}), url("${this.it.image}")`;
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

    render() {
        const it = this.it;
        const avgImg = this.averageImageRGB();

        const urlTpl = html`<ul>
            ${it.url.map((u) => 
                html`<li><a href=${u}>${u}</a></li>`
            )}
        </ul>`

        const collections = this.collections();
        const collectionsTpl = () => {
            if (collections.length > 0) {
                return html`<ul>${collections.map(value => 
                        html`<li><oni-collection-link it=${value}></oni-collection-link></li>`
                )}</ul>`;
            }
            return nothing;
        };

        return html`
            <style> :host { background-image: ${until(avgImg)}; } </style>
            <a href=${this.iri()}> <img src=${it.icon}/> </a>
            <h2> <a href=${this.iri()}> <oni-natural-language-values>${it.preferredUsername}</oni-natural-language-values> </a></h2>
            <aside><oni-natural-language-values>${it.summary}</oni-natural-language-values></aside>
            ${urlTpl}
            ${collectionsTpl()}
            <slot></slot>
        `;
    }
}
