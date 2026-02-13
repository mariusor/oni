import {css, html, LitElement, nothing} from "lit";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {ActivityPubObject} from "./activity-pub-object";
import {sanitize} from "./utils";

export class NaturalLanguageValues extends LitElement {
    static styles = [css`
        ul, ol, li, p, h1, h2, h3, h4, h5, h6 {
            margin-block: 0;
            margin-inline: 0;
            padding-block: 0;
            padding-inline: 0;
        }
        ul, ol {
            margin-inline-start: .6rem;
            padding-inline-start: .6rem;
        }
        :host {
            line-height: 1.8rem;
            display: inline;
        }
        :host div {
            display: inline-block;
        }
        :host > *:not(:last-child), li:not(:last-child) {
            margin-block-start: 0;
            margin-block-end: .8rem;
        }
        :host([data-container-type="article"]) p {
            text-indent: 1.4rem;
            text-align: justify;
        }
        :host([data-container-type="article"]) p + p, :host([data-container-type="article"]) p:first-of-type {
            margin-block-start: .8rem;
        }
        :host([name=summary]) p, :host([name=name]) p, :host([name=preferredUsername]) p {
            display: inline-block;
            margin: 0;
        }
        aside > p {
            display: inline-block;
            border: 1px solid var(--fg-color);
            padding: .4rem;
            font-size: 0.9rem;
            background-color: color-mix(in srgb, var(--accent-color) 20%, transparent);
        }
        pre {
            max-width: 100%;
            overflow-x: auto;
        }
        h1 + p, h2 + p, h3 + p {
            margin-top: 0;
        }
        a[rel~=mention], a[rel~=tag], 
        /* NOTE(marius): include Mastodon tag and mention classes on links */
        a[class~=mention], a[class~=hashtag] {
            --tag-color: color-mix(in srgb, var(--accent-color), transparent 86%);
            font-size: .72rem;
            padding: .1rem .3rem;
            border-radius: .3rem;
            border: .06rem solid var(--tag-color);
            background: var(--tag-color);
            text-decoration: none;
            vertical-align: .09rem;
            word-break: unset;
        }
        /* This should take care of Mastodon links that have as content just the link href */
        a {
            word-break: break-all;
        }
        hr {
            border-color: var(--accent-color);
        }
        p img {
            border-radius: .4rem;
            outline: .08rem solid color-mix(in srgb, var(--accent-color), transparent 55%);
            outline-offset: -.08rem;
            max-width: 100%;
            height: auto;
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

        return sanitize(value);
    }

    render() {
        if (!this.it) { return nothing; }
        return html`${unsafeHTML(this.value()) ?? nothing}`;
    }
}
