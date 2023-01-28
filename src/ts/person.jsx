import {css, html, LitElement} from "lit";

export class ActivityPubPerson {
};

export class Person extends LitElement {
    static styles = css`
        :host {
            background-size: cover;
            color: var(--fg-color); 
        }
        :host img.icon {
            width: 12rem;
            max-width: 24%;
            margin-right: 1rem;
            border: .3vw solid var(--shadow-color);
            border-radius: 20%;
            float: left;
            shape-outside: margin-box;
        }
        :host .details {
            background-clip: padding-box;
            overflow-x: hidden;
            background-size: cover;
            min-height: 12vw;
            padding: 1vw;
        }
        :host .content {
            margin: -2vw 1vw;
            background-color: rgba(var(--fg-color), 0.2);
        }
        ul {
            list-style: none;
            padding: 0;
        }
        ul li {
            display: inline-block;
            margin-right: 1vw;
        }
        :host h2 {
            text-shadow : .08em .06em .15em var(--shadow-color);
        }
    `;
    static properties = {
        it: {type: ActivityPubPerson},
        iri: {type: String},
        icon: {type: String},
        image: {type: String},
        preferredUsername: {type: String},
        summary: {type: String},
        content: {type: HTMLElement},
    };

    constructor() {
        super();
        this.preferredUsername = 'Anonymous';
    }

    render() {
        let summary;
        if (this.summary) {
            summary = html`<span>${this.summary}</span>`;
        }
        return html`
            <style>
                :host {
                    background-image: linear-gradient(rgba(1, 1, 1, 1), rgba(1, 1, 1, 0.6)), url("${this.image}");
                    background-size: cover;
                    color: var(--fg-color); 
                }
            </style>
            <main class="person">
                <article class="details">
                    <h2><a href="${this.iri}"><img class="icon" src="${this.icon}"/> ${this.preferredUsername}</a></h2>
                    <slot name="summary"></slot>
                    <slot name="url"></slot>
                    <slot name="content"></slot>
                </article>
            </main>`;
    }
}
