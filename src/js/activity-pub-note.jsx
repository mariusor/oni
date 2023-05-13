import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";

export class ActivityPubNote extends ActivityPubObject {
    static styles = [css`
    main {
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    main > * {
        margin: .1rem;
    }
    main aside {
        align-self: end;
    }
    p {
        margin: 0 .2rem;
    }
    `, ActivityPubObject.styles];

    constructor(it) {
        super(it);
    }

    render() {
        const name = this.it.getName().length > 0 ? html`<h1>${this.renderName()}</h1>` : nothing;
        const summary = this.it.getSummary().length > 0 ? html`<h2>${this.renderSummary()}</h2>` : nothing;
        const header = this.it.getName().length+this.it.getSummary().length > 0 ? html`<header>${name}${summary}</header>` : nothing;

        return html`<article>
            ${header}
            ${this.renderContent()}
            <aside>${this.renderAttachment()}</aside>
        </article>
        <footer>${this.renderMetadata()}</footer>`;
    }
}
