import {ActivityPubActor} from "./activity-pub-actor";
import {css, html, nothing} from "lit";
import {until} from "lit-html/directives/until.js";
import {isLocalIRI} from "./client";
import {ActivityPubObject} from "./activity-pub-object";
import {ActivityPubItem} from "./activity-pub-item";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {sanitize} from "./utils";
import {Palette} from "./oni-theme";

export class OniHeader extends ActivityPubActor {

    static styles = [
        css`
            :host header {
                padding-top: .4rem;
                display: grid;
                align-items: end;
                backdrop-filter: blur(40px);
                background-size: cover;
                background-clip: padding-box;
                background-position: center;
                z-index: 10;
                position: sticky;
                top: 0px;
            }
            header a svg {
               fill: none;
               stroke-width: 1.5;
               stroke:currentColor;
            }
            header a img, header a svg { 
                aspect-ratio: 1;
                height: 2rem;
                border-radius: 0 20% 20% 20%;
                shape-outside: margin-box;
                padding: .2rem;
                margin-top: .4rem;
                margin-bottom: -.4rem;
                backdrop-filter: blur(10px) contrast(300%);
                border: .01rem solid color-mix(in srgb, var(--accent-color), transparent 30%);
                box-shadow: 0 0 1rem var(--accent-color), 0 0 .3rem var(--accent-color);
                background-color: color-mix(in srgb, var(--accent-color), transparent 50%);
            }
            header a, header a:visited, header a:hover, header a:visited:hover {
                color: var(--fg-color);
                text-shadow: 0 0 1rem var(--accent-color), 0 0 .4rem var(--accent-color), 0 0 .2rem var(--bg-color);
            }
            header a {
                min-width: 0;
                margin-left: .4em;
                font-size: 1.6rem;
                text-decoration: none;
                display: inline-block;
                align-self: start;
                font-weight: bold;
            }
        `,
        ActivityPubObject.styles
    ];

    constructor() {
        super();
    }

    renderIconName() {
        let username = "Anonymous";
        if (this.it?.getPreferredUsername().length > 0) {
            username = unsafeHTML(sanitize(this.it?.getPreferredUsername()?.at(0)));
        }
        const iri = this.it.iri();
        if (!isLocalIRI(iri)) {
            username = `${username}@${URL.parse(iri).hostname}`
        }
        return html`<a href=${iri}> ${this.renderIcon()} ${username}</a>`;
    }

    async renderBackground() {
        let palette = Palette.fromStorage();
        if (!palette.matchItem(this.it)) {
            palette = await Palette.fromActivityPubItem(this.it);
            if (palette) Palette.toStorage(palette);
        }
        if (!palette) return nothing;

        return palette.renderThinHeaderBackground();
    }

    render() {
        if (!ActivityPubItem.isValid(this.it)) return nothing;

        const style = html`<style>${until(this.renderBackground())}</style>`;
        const iconName = html`${this.renderIconName()}`;
        return html`${style}<header>${until(this.renderCollections(iconName), `<hr/>`)}</header>`;
    }
}
