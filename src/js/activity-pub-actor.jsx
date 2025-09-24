import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {hostFromIRI, loadPalette, urlText} from "./utils";
import {ActivityPubItem, ActorTypes} from "./activity-pub-item";
import {until} from "lit-html/directives/until.js";
import {TinyColor} from "@ctrl/tinycolor";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {classMap} from "lit-html/directives/class-map.js";
import {isLocalIRI} from "./client";

const tc = (c) => new TinyColor(c)

export class ActivityPubActor extends ActivityPubObject {
    static styles = [css`
        :host header {
            padding: 1rem;
            display: flex;
            justify-content: start;
            align-items: flex-end;
            justify-items: start;
            column-gap: 1.4rem;
        }
        header section {
            display: flex;
            flex-direction: column;
            flex-wrap: nowrap;
            align-content: center;
            justify-content: center;
            align-items: flex-start;
        }
        section h1, section h2 {
            margin: .2rem 0;
        }
        section h2 {
            font-weight: 300;
        }
        section h1 a oni-natural-language-values {
            color: var(--accent-color);
            text-shadow: 0 0 2rem var(--accent-color), 0 0 .3rem var(--accent-color);
        }
        header > a svg {
            color: var(--accent-color);
        }
        header > a img, header > a svg {
            border: .1rem solid color-mix(in srgb, var(--accent-color), transparent 30%);
            border-radius: 0 1.6em 1.6em 1.6em;
            shape-outside: margin-box;
            box-shadow: 0 0 1rem var(--accent-color), 0 0 .3rem var(--accent-color);
            background-color: color-mix(in srgb, var(--accent-color), transparent 80%);
            max-height: 10em;
            max-width: 10em;
            margin-bottom: -.4rem;
        }
        section ul {
            display: inline-block;
            margin: 0.3rem 0 0 -1.2rem;
            padding: 0.3rem 1.4rem;
            border-radius: 1.6em;
            background-color: color-mix(in srgb, var(--accent-color), transparent 80%);
        }
        @media(max-width: 480px) {
            :host header {
                display: block;
                width: auto;
            }
            :host header h1 {
                margin-top: 1rem;
            }
            section ul {
                display: none;
            }
        }
        section ul a, section ul a:visited, section ul a:active {
            color: var(--accent-color);
            text-shadow: 0 0 1rem var(--bg-color), 0 0 .3rem var(--accent-color);
        }
        section ul li {
            list-style: none;
            display: inline-block;
            margin-right: .8rem;
        }
        :host aside small::before {
            content: "(";
        }
        :host aside small::after {
            content: ")";
        }
        a[target=external] {
            font-size: .9rem;
            font-weight: light;
        }
        :host oni-natural-language-values[name=content] {
            display: block;
            margin: 0 1rem;
        }
        :host oni-natural-language-values[name=summary] {
            font-size: .8em;
        }
        a.inline img {
            max-height: 1.2rem;
            vertical-align: middle;
            margin: .1rem -.2rem .1rem 0;
            border: .01rem solid color-mix(in srgb, var(--accent-color), transparent 30%);
        }
        a.inline span {
            opacity: 0.7;
            color: var(--fg-color);
        }
        a.inline span::before {
            content: '@';
        }
        @media (max-width: 1050px) {
             a.inline span {
                display: none;
            }
        }
    `, ActivityPubObject.styles];

    constructor() {
        super();
    }

    renderBgImage(palette) {
        if (!palette) return nothing;
        if (!palette?.bgColor) return nothing;

        const col = tc(palette.bgColor);
        const haveBgImg = palette.hasOwnProperty('bgImageURL') && palette.bgImageURL.length > 0;
        if (!haveBgImg || !col) {
            return nothing;
        }

        const img = palette.bgImageURL;
        return `:host header {
            background-size: cover;
            background-clip: padding-box;
            background-image: linear-gradient(${col.setAlpha(0.5).toRgbString()}, ${col.setAlpha(1).toRgbString()}), url(${img});
        }`;
    }

    async renderPalette() {
        const palette = await loadPalette(this.it);
        if (!palette) return nothing;

        this.scheduleUpdate();
        return html`
            ${this.renderBgImage(palette)}
            :host header {
                --bg-color: ${palette.bgColor};
                --fg-color: ${palette.fgColor};
                --link-color: ${palette.linkColor};
                --link-visited-color: ${palette.linkVisitedColor};
                --link-active-color: ${palette.linkActiveColor};
                --accent-color: ${palette.accentColor};
            }
        `;
    }

    renderIcon() {
        const icon = this.it.getIcon();
        if (!icon) {
            return nothing;
        }
        if (typeof icon == 'string') {
            return html`<img loading="lazy" src="${icon}" alt="icon"/>`;
        } else {
            const url = icon.id || icon.url;
            if (url) {
                return html`<img loading="lazy" src="${url}" alt="icon"/>`;
            }
            const cont = new ActivityPubItem(icon).getContent().at(0);
            if (cont?.length > 0) {
                try {
                    return unsafeHTML(cont);
                } catch (e) {
                    console.warn(e);
                    return nothing;
                }
            }
        }
        return nothing;
    }

    renderUrl() {
        let url = this.it.getUrl();
        if (!url) {
            return nothing;
        }
        if (!Array.isArray(url)) {
            url = [url];
        }

        return html`
            <ul>
                ${url.map((u) => html`
                    <li><a target="external" rel="me noopener noreferrer nofollow" href=${u}>
                        ${u}
                        <oni-icon name="external-href" alt="Open external link"></oni-icon>
                    </a></li>`)}
            </ul>`;
    }

    renderPreferredUsername() {
        const name = this.it.getPreferredUsername();
        if (!(name?.length > 0)) return nothing;
        return html`<oni-natural-language-values name="preferredUsername" it=${JSON.stringify(name)}></oni-natural-language-values>`;
    }

    renderSummary() {
        const summary = this.it.getSummary();
        if (!(summary?.length > 0)) return nothing;

        return html`<oni-natural-language-values name="summary" it=${JSON.stringify(summary)}></oni-natural-language-values>`;
    }

    renderContent() {
        const content = this.it.getContent();
        if (!(content?.length > 0)) return nothing;
        return html`<oni-natural-language-values name="content" it=${JSON.stringify(content)}></oni-natural-language-values>`;
    }

    renderCollections(slot) {
        slot = slot || html`<a href="#"></a>`;
        return html`<oni-collection-links it=${JSON.stringify(this.it)}>${slot}</oni-collection-links>`;
    };

    renderRemotePreferredUsername() {
        const iri = this.it.iri();
        return html`${this.renderPreferredUsername()}${!isLocalIRI(iri) ? html`<span>${hostFromIRI(iri)}</span>` : nothing}`;
    }

    renderInlineIRI() {
        const iri = this.it.iri();
        if (!iri) return nothing;

        return html`<a class=${classMap({'inline': this.inline})} href=${iri}>${urlText(iri)}</a>`;
    }

    renderInline() {
        if (!ActivityPubItem.isValid(this.it)) {
            return this.renderInlineIRI();
        }
        const iri = this.it.iri();
        // if parent is <aside> we're in the footer of an object - TODO(marius): come up with a better way of deciding this
        const needsAvatar = this.parentNode.nodeName !== 'ASIDE';
        const title = this.it.getPreferredUsername()[0] + '@' + hostFromIRI(iri);
        return html`<a class=${classMap({'inline': this.inline})} title=${title} href=${iri}>${ needsAvatar ? this.renderIcon() : nothing} ${this.renderRemotePreferredUsername()}</a>`;
    }

    render() {
        if (typeof this.it === 'string') {
            return html`<a class='inline' href=${this.it}>${urlText(this.it)}</a>`;
        }
        if (!ActivityPubItem.isValid(this.it)) return nothing;
        if (this.inline) return this.renderInline();

        const iri = this.it.iri();
        const style = html`<style>${until(this.renderPalette())}</style>`;

        return html`${style}<header>
            <a href=${iri}>${this.renderIcon()}</a>
            <section>
                <h1><a href=${until(iri, "#")}>${this.renderPreferredUsername()}</a></h1>
                <h2>${this.renderSummary()}</h2>
                <nav>${this.renderUrl()}</nav>
            </section>
        </header>
        <nav>${until(this.renderCollections(), `<hr/>`)}</nav>
        ${this.renderContent()}
        `;
    }

    static isValid(it) {
        return ActivityPubItem.isValid(it) && ActorTypes.indexOf(it.type) >= 0;
    }
}

// NOTE(marius): we don't really render different actor types differently, but
// here is where we want to do that when that happens.
ActivityPubActor.renderByType = /*async*/ function (it, showMetadata, inline) {
    if (it === null) {
        return nothing;
    }
    // if (typeof it === 'string') {
    //     it = await fetchActivityPubIRI(it);
    //     if (it === null) return nothing;
    // }
    return until(html`<oni-actor it=${JSON.stringify(it)} ?showMetadata=${showMetadata} ?inline=${inline}></oni-actor>`);
}
