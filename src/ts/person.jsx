import {css, html} from "lit";
import {ActivitypubObject} from "./activitypub-object";

export class Person extends ActivitypubObject {
    static styles = css`
        :host {
            display: block;
            background-size: cover;
            color: var(--fg-color); 
            background-clip: padding-border;
            overflow-x: hidden;
            background-size: cover;
            min-height: 12vw;
            padding: 1vw;
        }
        a {
            color: var(--link-color); 
        }
        a:visited {
            color: var(--linkvisited-color); 
        }
        a:active {
            color: var(--linkactive-color); 
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
        ::slotted(.content) {
            margin: 1vw;
        }
        ::slotted(a) {
            margin-right: 1vw;
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

    render() {
        const it = this.it;
        return html`
            <style>
                :host {
                    background-image: linear-gradient(rgba(1, 1, 1, 1), rgba(1, 1, 1, 0.6)), url("${it.image}");
                    background-size: cover;
                    color: var(--fg-color); 
                }
            </style>
            <img class="icon" src=${it.icon}/>
            <slot name="preferredUsername"></slot> </a>
            </h2>
            <aside><slot name="summary"></slot></aside>
            <slot name="url"></slot>
            <slot name="collections"></slot>
            <hr/>
            <slot name="content"></slot>
        `;
    }
}
