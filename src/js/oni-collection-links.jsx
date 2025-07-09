import {css, html, LitElement, nothing} from "lit";
import {classMap} from "lit-html/directives/class-map.js";
import {ActivityPubObject} from "./activity-pub-object";

export class OniCollectionLinks extends LitElement {
    static styles = css`
        :host nav {
            display: flex;
            justify-content: space-between;
            border-bottom: 3px solid var(--accent-color);
        }
        ::slotted {
            align-self: start;
        }
        :host ul {
            margin: 0 .8rem 0;
            padding: 0;
            align-self: end;
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
            background-color: color-mix(in srgb, var(--accent-color), transparent 80%);
            text-shadow: 0 0 1rem var(--bg-color), 0 0 .3rem var(--accent-color);
        }
        :host li.active {
            background-color: var(--accent-color);
        }
    `

    static properties = {
        it: {type: Array}
    }

    constructor() {
        super();
        this.it = [];
    }

    render() {
        if (!Array.isArray(this.it) || this.it.length === 0) return nothing;
        return html`
            <nav>
                <slot></slot>
                <ul>
                    ${this.it.map(value => html`
                        <li class=${classMap({'active': (value === window.location.href)})}>
                            <oni-collection-link it=${value}></oni-collection-link>
                        </li>`
                    )}
                </ul>
            </nav>`;
    }
}

const LinkStyle = css`
        :host a {
            text-transform: capitalize;
            text-decoration: none;
            color: var(--accent-color);
            text-shadow: 0 0 1em var(--accent-color), 0 0 .4em var(--bg-color);
        }
        :host a.active, :host a:visited.active {
            color: var(--bg-color);
            text-shadow: 0 0 1em var(--accent-color), 0 0 .4rem var(--bg-color);
        }
    `;

export class OniCollectionLink extends ActivityPubObject {
    static styles = LinkStyle;

    static properties = ActivityPubObject.properties;

    constructor() {
        super();
    }

    label() {
        const name = this.it.getName();
        if (name.length > 0) {
            return name;
        }
        const pieces = this.it.iri().split('/');
        return pieces[pieces.length -1];
    }

    renderIcon () {
        const icon = this.it.getIcon();
        if (icon) {
            return html`<oni-image it=${JSON.stringify(icon)}></oni-image>`;
        }
        return html`<oni-icon name=${this.label()}></oni-icon>`;
    }

    render() {
        const iri = this.it.iri();
        const label = this.label();
        return html`<a href=${iri} class=${classMap({'active': (iri === window.location.href)})}>${this.renderIcon()} ${label}</a>`;
    }
}

