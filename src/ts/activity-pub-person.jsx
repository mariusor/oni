import {css, html} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {getAverageImageRGB, rgba, setStyles} from "./utils";
import {until} from "lit-html/directives/until.js";

export class ActivityPubPerson extends ActivityPubObject {
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
        :host img.icon {
            width: 10rem;
            max-width: 20%;
            margin-right: 1rem;
            border: .3vw solid var(--shadow-color);
            border-radius: 20%;
            float: left;
            shape-outside: margin-box;
        }
        
    `;
    static properties = { it: {type: Object} };

    constructor() {
        super();
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

    render() {
        const it = this.it;
        const avgImg = this.averageImageRGB();
        return html`
            <style>
                :host { background-image: ${until(avgImg)}; }
            </style>
            <link rel="stylesheet" href="/main.css" />
            <a href=${this.iri()}>
            <img class="icon" src=${it.icon}/>
            </a>
            <h2> <a href=${this.iri()}> <slot name="preferredUsername"></slot> </a></h2>
            <aside><slot name="summary"></slot></aside>
            <slot name="url"></slot>
            <slot name="collections"></slot>
            <hr/>
            <slot name="content"></slot>
        `;
    }
}
