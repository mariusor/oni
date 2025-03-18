import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";

export class ActivityPubNote extends ActivityPubObject {
    static styles = [css`
    :host main {
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    :host > * {
        margin: .1rem;
    }
    article header h1 {
        font-size: 1.32rem;
    }
    article header h2 {
        font-size: 1.16rem;
    }
    article header h3 {
        font-size: 1.1rem;
    }
    article header h4 {
        font-size: 1.08rem;
    }
    article header h5 {
        font-size: 1rem;
    }
    article header h6 {
        font-size: .8rem;
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
        const summary = this.it.getSummary().length > 0 ? html`<h3>${this.renderSummary()}</h3>` : nothing;
        const header = this.it.getName().length+this.it.getSummary().length > 0 ? html`<header>${name}${summary}</header>` : nothing;

        const metadata = this.showMetadata ? html`<footer>${this.renderMetadata()}</footer>` : nothing;
        return html`<article>
            ${header}
            ${this.renderContent()}
            ${this.renderTag()}
            ${this.renderAttachment()}
        </article>${metadata}`;
    }
}
