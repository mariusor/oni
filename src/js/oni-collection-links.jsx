import {css, html, LitElement, nothing} from "lit";
import {classMap} from "lit-html/directives/class-map.js";
import {ActivityPubObject} from "./activity-pub-object";
import {ActivityPubItem, ActorTypes} from "./activity-pub-item";
import {fetchActivityPubIRI} from "./client";
import {map} from "lit-html/directives/map.js";
import {when} from "lit-html/directives/when.js";
import {OniThrobber} from "./oni-throbber";
import {toTitleCase} from "./utils";
import {until} from "lit-html/directives/until.js";

export class OniCollectionLinks extends LitElement {
    static styles = css`
        :host nav {
            display: flex;
            justify-content: space-between;
            border-bottom: 3px solid var(--accent-color);
            padding-right: .4rem;
        }
        ::slotted {
            align-self: start;
        }
        :host ul {
            margin: .2rem .4rem 0;
            padding: 0;
            align-self: end;
        }
        :host li {
            border-width: 1px;
            border-style: solid;
            border-color: var(--accent-color);
            border-bottom-width: 0;
            text-align: center;
            list-style: none;
            display: inline-block;
            padding: 0 1rem 0 .6rem;
            margin: 0 .2rem;
            backdrop-filter: blur(2px);
            border-radius: 0 .3rem 0 0;
            text-shadow: 0 0 1rem var(--bg-color), 0 0 .3rem var(--accent-color);
            background-color: color-mix(in srgb, var(--accent-color), transparent 85%);
        }
        :host li:first-child {
            margin-right: -.2rem;
        }
        :host li.active {
            background-color: var(--accent-color);
            backdrop-filter: none;
        }
        @media (max-width: 576px) {
            :host li {
                line-height: 1.2rem;
                padding: .2rem .4rem 0;
                margin: 0 .1rem;
                overflow-x: clip;
            }
            :host nav {
                flex-direction: column;
                padding-right: 1rem;
            }
        }
    `

    static properties = {
        it: {
            type: ActivityPubItem,
            converter: {
                toAttribute: (val, typ) => JSON.stringify(val),
                fromAttribute: (val, typ) => ActivityPubItem.load(val),
            },
        },
        collections: {type: Array}
    }

    constructor() {
        super();
        this.it = null;
        this.collections = [];
    }

    renderOAuth() {
        const endPoints = this.it.getEndPoints();
        if (!endPoints.hasOwnProperty('oauthAuthorizationEndpoint')) {
            return nothing;
        }
        if (!endPoints.hasOwnProperty('oauthTokenEndpoint')) {
            return nothing;
        }
        const authURL = new URL(endPoints.oauthAuthorizationEndpoint)
        const tokenURL = endPoints.oauthTokenEndpoint;

        return html`<oni-login-link authorizeURL=${authURL} tokenURL=${tokenURL}></oni-login-link>`;
    }

    buildCollections() {
        let whichCollections = objectCollections;
        if (ActorTypes.indexOf(this.it?.type) >= 0) {
            whichCollections = actorCollections;
        }
        for (const i in whichCollections) {
            const colName = whichCollections[i];
            if (this.it.hasOwnProperty(colName)){
                const collection = this.it[colName];
                if (collection) {
                    this.collections.push(collection);
                }
            }
        }
    }

    renderCollectionItems() {
        this.buildCollections();
        if (!(this.collections?.length > 0)) return nothing;

        const json = document.querySelector('oni-collection script')?.text;
        return map(this.collections,(iri) => {
            if (isCurrentPage(iri) && json) {
                return html`<li class="active"><oni-collection-link it=${json}></oni-collection-link></li>`;
            }
            return until(
                    fetchActivityPubIRI(iri)
                        .then(it => html`<li class=${classMap({'active': isCurrentPage(iri)})}><oni-collection-link it=${JSON.stringify(it)}></oni-collection-link></li>`)
                        .catch(console.warn),
                    html`<li class=${classMap({'active': isCurrentPage(iri)})}><oni-collection-link it=${JSON.stringify(iri)} .loading=${true}></oni-collection-link></li>`,
                )
            }
        )
    }

    render() {
        const oauth = this.renderOAuth();
        return html`
            <nav>
                <slot></slot>
                ${when(!isAuthorizePage(),
                    c => html`<ul>
                            ${oauth !== nothing ? html`<li>${oauth}</li>` : nothing}
                            ${this.renderCollectionItems()}
                        </ul>`
                )}
            </nav>`;
    }
}

const LinkStyle = css`
        :host a {
            font-size: .9rem;
            text-transform: capitalize;
            text-decoration: none;
            color: var(--accent-color);
            text-shadow: 0 0 1em var(--accent-color), 0 0 .4em var(--bg-color);
            display: inline-block;
        }
        :host a.active, :host a:visited.active {
            color: var(--bg-color);
            text-shadow: 0 0 1em var(--accent-color), 0 0 .4rem var(--bg-color);
        }
        :host oni-image {
            max-width: 1.1rem;
            max-height: 1.1rem;
            display: inline-block;
        }
        @media (max-width: 860px) {
            :host a {
                font-size: .7rem;
                overflow: clip;
                white-space: nowrap;
            }
        }
        @media (max-width: 576px) {
            :host a {
                font-size: 0;
                overflow: clip;
                white-space: nowrap;
            }
            :host a oni-icon {
                font-size: .9rem;
            }
        }
    `;

export class OniCollectionLink extends ActivityPubObject {
    static styles = LinkStyle;

    static properties = {
        loading: {type: Boolean,},
    };

    constructor() {
        super();
        this.loading = false;
    }

    collectionType() {
        let iri;
        if (typeof this.it === 'object') {
            iri = this.it?.iri();
        } else {
            iri = this.it;
        }
        return URL.parse(iri)?.pathname?.split('/')?.at(-1) || "unknown";
    }

    label() {
        if (!this.loading) {
            const name = this.it?.getName();
            if (name.length > 0) {
                return name;
            }
        }
        return toTitleCase(this.collectionType());
    }

    renderIcon() {
        if (this.loading) {
            return OniThrobber.throbber(this.collectionType());
        }
        const icon = this.it.getIcon();
        if (icon) {
            return html`<oni-image it=${JSON.stringify(icon)} .inline=${true}></oni-image>`;
        }
        return html`<oni-icon name=${this.collectionType()}></oni-icon>`;
    }

    render() {
        let iri = this.it;
        if (typeof this.it === 'object') {
            iri = this.it.iri();
        }
        const label = this.label();
        return html`<a href=${iri} class=${classMap({'active': isCurrentPage(iri)})}>${this.renderIcon()} ${label}</a>`;
    }
}

function isCurrentPage(iri) {
    if (!URL.canParse(iri)) return false;
    const u = new URL(iri)
    return u.pathname === window.location.pathname;
}

function isAuthorizePage() {
    return window.location.pathname.startsWith('/oauth');
}

const actorCollections = ['following', 'followers', 'inbox', 'outbox'];
const objectCollections = ['likes', 'shares', 'replies'];
