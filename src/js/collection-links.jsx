import {css, html, LitElement} from "lit";
import {classMap} from "lit-html/directives/class-map.js";
import {ActivityPubCollection} from "./activity-pub-collection";

export class CollectionLinks extends LitElement {
    static styles = css`
        :host {
            display: flex;
            justify-content: flex-end;
            border-bottom: 3px solid var(--accent-color);
            margin: .4rem -1rem 0 -1rem;
            clear: both;
        }
        :host ul {
            margin: 0 .8rem 0;
            padding: 0;
        }
        :host li {
            border-width: 1px;
            border-style: solid; 
            border-color: var(--accent-color);
            border-bottom-width: 0;
            min-width: 8vw;
            text-align: center;
            list-style: none;
            display: inline-block;
            line-height: 2.2rem;
            padding: 0 .4rem;
            margin: 0 .2rem;
        }
        :host li.active {
            background-color: var(--accent-color);
        }
    `

    static properties = {
        it: {type: Object}
    }

    constructor() {
        super();
        this.it = {};
    }

    render() {
        return html`
            <nav>
                <ul>
                    <slot></slot>
                    ${this.it.map(value => html`
                        <li class=${classMap({'active': (value === window.location.href)})}>
                            <oni-collection-link it=${JSON.stringify(value)}></oni-collection-link>
                        </li>`
                    )}
                </ul>
            </nav>`;
    }
}

export class CollectionLink extends ActivityPubCollection {
    static styles = css`
        :host a {
            text-transform: capitalize;
            color: var(--accent-color);
            text-decoration: none;
        }
        :host a.active, :host a:visited.active {
            color: var(--bg-color);
        }
    `;

    constructor(it) {
        super(it);
    }

    label() {
        const name = this.it.getName();
        if (name.length > 0) {
            return name;
        }
        const pieces = this.it.iri().split('/');
        return pieces[pieces.length -1];
    }

    render() {
        const iri = this.it.iri();
        const label = this.label();
        return html`<a href=${iri} class=${classMap({'active': (iri === window.location.href)})}><oni-icon name=${label}></oni-icon> ${label}</a>`;
    }
}
