import {css, html, LitElement} from "lit";
import {classMap} from "lit-html/directives/class-map.js";
import {ActivityPubCollection} from "./activity-pub-collection";

export class CollectionLinks extends LitElement {
    static styles = css`
        :host {
            display: flex;
            justify-content: flex-end;
            border-bottom: 3px inset var(--shadow-color);
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
            border-color: var(--shadow-color);
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
            background-color: var(--shadow-color);
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
            color: var(--shadow-color);
            text-decoration: none;
        }
        :host a.active, :host a:visited.active {
            color: var(--bg-color);
        }
    `;

    static properties = {
        it: {type: Object},
    }

    constructor(it) {
        super(it);
    }

    label() {
        const name = this.name();
        if (name.length > 0) {
            return name;
        }
        const pieces = this.iri().split('/');
        return pieces[pieces.length -1];
    }

    render() {
        return html`<a href=${this.iri()} class=${classMap({'active': (this.it === window.location.href)})}><oni-icon name=${this.label()}></oni-icon> ${this.label()}</a>`;
    }
}
