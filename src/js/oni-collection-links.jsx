import {css, html, LitElement, nothing} from "lit";
import {classMap} from "lit-html/directives/class-map.js";
import {ActivityPubObject} from "./activity-pub-object";
import {ActivityPubItem} from "./activity-pub-item";
import {until} from "lit-html/directives/until.js";

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
        @media (max-width: 576px) {
            :host li {
                line-height: 1.8rem;
                max-width: 1.8rem;
                margin: 0;
                padding: 0;
                overflow-x: clip;
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
        }
    }

    constructor() {
        super();
        this.it = null;
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

    get collections() {
        let collections = []
        const replies = this.it.getReplies();
        if (replies) {
            collections.push(replies);
        }
        const likes = this.it.getLikes();
        if (likes) {
            collections.push(likes);
        }
        const shares = this.it.getShares();
        if (shares) {
            collections.push(shares);
        }
        const inbox = this.it.getInbox();
        if (inbox !== null) {
            collections.push(inbox);
        }
        const liked = this.it.getLiked();
        if (liked !== null) {
            collections.push(liked);
        }
        const followers = this.it.getFollowers();
        if (followers !== null) {
            collections.push(followers);
        }
        const following = this.it.getFollowing();
        if (following !== null) {
            collections.push(following);
        }
        const outbox = this.it.getOutbox();
        if (outbox !== null) {
            collections.push(outbox);
        }
        return collections;
    }

    render() {
        if (!Array.isArray(this.collections) || this.collections.length === 0) return nothing;
        const oauth = this.renderOAuth();
        return html`
            <nav>
                <slot></slot>
                <ul>
                    ${oauth !== nothing ? html`<li>${until(oauth)}</li>` : nothing}
                    ${this.collections.map(iri => html`
                        <li class=${classMap({'active': isCurrentPage(iri)})}>
                            <oni-collection-link it=${iri}></oni-collection-link>
                        </li>`
                    )}
                </ul>
            </nav>`;
    }
}

const LinkStyle = css`
        :host a {
            font-size: 0.9rem;
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
        @media (max-width: 576px) {
            :host a {
                font-size: 0px;
                overflow: clip;
                white-space: nowrap;
            }
            :host a oni-icon {
                font-size: 0.9rem;
            }
        }
    `;

export class OniCollectionLink extends ActivityPubObject {
    static styles = LinkStyle;

    static properties = ActivityPubObject.properties;

    constructor() {
        super();
    }

    collectionType() {
        return this.it.iri().split('/').at(-1);
    }

    label() {
        const name = this.it.getName();
        if (name.length > 0) {
            return name;
        }
        return this.collectionType();
    }

    renderIcon() {
        const icon = this.it.getIcon();
        if (icon) {
            return html`<oni-image it=${JSON.stringify(icon)}></oni-image>`;
        }
        return html`<oni-icon name=${this.collectionType()}></oni-icon>`;
    }

    render() {
        if (!ActivityPubItem.isValid(this.it)) {
            const iri = this.it;
            const label = iri.split('/').at(-1);
            return html`<a href=${iri} class=${classMap({'active': isCurrentPage(iri)})}><oni-icon name=${label}></oni-icon>${label}</a>`;
        }

        const iri = this.it.iri();
        const label = this.label();
        return html`<a href=${iri} class=${classMap({'active': isCurrentPage(iri)})}>${this.renderIcon()} ${label}</a>`;
    }
}

function isCurrentPage(iri) {
    const u = new URL(iri)
    return u.pathname === window.location.pathname;
}