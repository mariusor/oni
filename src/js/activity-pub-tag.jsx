import {css, html, nothing} from "lit";
import {ActivityPubNote} from "./activity-pub-note";
import {renderHtmlText} from "./utils";
import {getIRI} from "./activity-pub-item";

export class ActivityPubTag extends ActivityPubNote {
    static styles = [css`
        :host h1 a[rel~=tag], :host h1 a[rel~=mention] {
            font-size: unset;
            border: unset;
            background: unset;
            text-decoration: none;
        }
        :host a[rel~=mention], :host a[rel~=tag] {
            --tag-color: color-mix(in srgb, var(--accent-color), transparent 86%);
            font-size: .72rem;
            padding: .1rem .3rem;
            border-radius: .3rem;
            border: .06rem solid var(--tag-color);
            background: var(--tag-color);
            text-decoration: none;
        }
    `, ActivityPubNote.styles];

    constructor() {
        super();
    }

    render() {
        if (!ActivityPubTag.isValid(this.it)) return nothing;
        const rel = this.it.type === 'Mention' ? 'mention' : 'tag';
        const iri = getIRI(this.it);

        if (this.showMetadata) {
            const name = html`<h1><a rel="${rel}" href="${iri}">${this.renderName()}</a></h1>`;
            const summary = this.it.getSummary().length > 0 ? html`<h2>${this.renderSummary()}</h2>` : nothing;
            const header = this.it.getName().length + this.it.getSummary().length > 0 ? html`
            <header>${name}${summary}</header>` : nothing;

            return html`
                <article>${header} ${this.renderContent()}</article>
                <footer>${this.renderMetadata()}</footer>
            `;
        }
        const name = renderHtmlText(this.it.getName());
        return html`<a rel="${rel}" href="${iri}">${name}</a>`;
    }

    static isValid(it) {
        return it !== null && typeof it === 'object' && it.hasOwnProperty('type');
    }
}