import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {until} from "lit-html/directives/until.js";
import {ActivityPubItem} from "./activity-pub-item";

export class ActivityPubPage extends ActivityPubObject {
    static styles = [css`
    :host main {
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    article h1 {
        margin-block: .78rem;
        font: 700 1.1rem / 1.125 sans-serif;
    }
    `, ActivityPubObject.styles];

    constructor() {
        super();
    }

    render() {
        if (!ActivityPubItem.isValid(this.it)) return nothing;
        const name = this.it.getName().length > 0 ? html`<h1>${this.renderName()}</h1>` : nothing;
        const summary = this.it.getSummary().length > 0 ? html`<h3>${this.renderSummary()}</h3>` : nothing;
        const header = this.it.getName().length+this.it.getSummary().length > 0 ? html`<header>${name}${summary}</header>` : nothing;

        const metadata = this.showMetadata ? html`<footer>${this.renderMetadata()}</footer>` : nothing;
        return html`<article>
            ${header}
            ${this.renderContent()}
            ${until(this.renderTag())}
            ${until(this.renderAttachment())}
        </article>
        ${metadata}
        `;
    }
}
