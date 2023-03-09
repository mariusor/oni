import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";

export class ActivityPubNote extends ActivityPubObject {
    static styles = [css`
    article {
        display: flex;
        flex-direction: column;
    }
    article > * {
        margin: .1rem;
    }
    article header * {
        padding: 0 .1rem;
        margin: 0;
    }
    article header h2 {
        font-size: 1.2rem;
    }
    article header h1 {
        font-size: 1.2rem;
    }
    article header {
        align-self: start;
    }
    article footer {
        align-self: end;
    }
    `, ActivityPubObject.styles];

    static properties = {
        it: {type: Object},
    };

    constructor(it) {
        super(it);
    }

    render() {
        const name = this.name().length > 0 ? html`<h1>${this.renderName()}</h1>` : nothing;
        const summary = this.summary().length > 0 ? html`<h2>${this.renderSummary()}</h2>` : nothing;
        const header = this.name().length+this.summary().length > 0 ? html`<header>${name}${summary}</header>` : nothing;

        return html`<article>
        ${header}
        ${this.renderContent()}
        <aside>${this.renderAttachment()}</aside>
        <footer>${this.renderMetadata()}</footer>
        </article>`;
    }
}
