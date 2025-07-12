import {ActivityPubActor} from "./activity-pub-actor";
import {css, html, nothing} from "lit";
import {until} from "lit-html/directives/until.js";
import {isLocalIRI} from "./client";
import {ActivityPubObject} from "./activity-pub-object";
import {ActivityPubItem} from "./activity-pub-item";

export class OniHeader extends ActivityPubActor {

    static styles = [
        css`
            :host header {
                padding-top: .4em;
                display: grid;
                height: 2.2em;
                align-items: end;
            }
            header a img, header a svg { 
                max-height: 2.2em;
                max-width: 2.2em;
                border: .1vw solid var(--accent-color);
                border-radius: 0 20% 20% 20%;
                shape-outside: margin-box;
                box-shadow: 0 0 1rem var(--accent-color), 0 0 .3rem var(--bg-color);
                background-color: color-mix(in srgb, var(--accent-color), transparent 80%);
                margin-bottom: -.4rem;
            }
            header a, header a:visited, header a:hover {
                color: var(--accent-color);
                text-shadow: 0 0 1rem var(--accent-color), 0 0 .3rem var(--bg-color);
            }
            header a {
                min-width: 0;
                margin-left: .4em;
                text-decoration: none;
                display: inline-block;
                align-self: start;
            }
        `,
        ActivityPubObject.styles
    ];

    constructor() {
        super();
    }

    renderIconName() {
        let username = this.it.getPreferredUsername();
        const iri = this.it.iri();
        if (!isLocalIRI(iri)) {
            username = `${username}@${new URL(iri).hostname}`
        }
        return html`
                <a href=${iri}> ${this.renderIcon()} ${username}</a>
            `;
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


    render() {
        if (!ActivityPubItem.isValid(this.it)) return nothing;

        const iconName = html`<span>${this.renderIconName()}</span>`;
        const style = html`<style>${until(this.renderPalette())}</style>`;

        return html`${style}
            <style>${until(this.renderBgImage(), nothing)}</style>
            <header>
                ${this.renderOAuth()}
                ${until(this.renderCollections(iconName), `<hr/>`)}
            </header>
        `;
    }
}