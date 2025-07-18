import {css, html, LitElement, nothing} from "lit";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {ActivityPubObject} from "./activity-pub-object";

export class NaturalLanguageValues extends LitElement {
    static styles = [css`
        :host {
            display: inline
        }
        :host p { text-align: justify; }
        :host div { display: inline-block; }
        :host([name=summary]) p, :host([name=name]) p, :host([name=preferredUsername]) p {
            display: inline-block; 
            margin: 0;
        }
        aside {
            display: inline-block;
            border: 1px solid var(--fg-color);
            padding: .4rem;
            font-size: 0.9rem;
            background-color: color-mix(in srgb, var(--accent-color) 20%, transparent);
        }
        pre {
            max-width: 100%;
            overflow-x: scroll;
        }
        h1 + p, h2 + p, h3 + p {
            margin-top: 0;
        }
        a[rel=mention], a[rel=tag] {
            font-size: .62rem;
            font-weight: bold;
            padding: .1rem .3rem;
            border-radius: .3rem;
            border: .08rem solid color-mix(in srgb, var(--accent-color), transparent 10%);
            background: color-mix(in srgb, var(--accent-color), transparent 70%);
            vertical-align: .09rem;
        }
    `, ActivityPubObject.styles];

    static properties = {
        it: {type: Object},
        name: {type: String},
    };

    constructor() {
        super();
        this.it = '';
        this.name = '';
    }

    value() {
        let value;
        if (typeof this.it == 'string') {
            return this.it;
        }
        if (typeof this.it == 'object') {
            value = this.it.toString();
            if (this.it.hasOwnProperty(this.lang)) {
                value = this.it.getProperty(this.lang);
            }
        }
        return value;
    }

    render() {
        if (!this.it) { return nothing; }
        return html`${unsafeHTML(this.value()) ?? nothing}`;
    }
}
