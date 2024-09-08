import {html, nothing} from "lit";
import {ActivityPubNote} from "./activity-pub-note";

export class ActivityPubTag extends ActivityPubNote {
    static styles = ActivityPubNote.styles;

    constructor(it) {
        super(it);
    }

    render() {
        if (this.it == null) {
            return nothing;
        }
        const rel = this.it.type === 'Mention' ? 'mention' : 'tag';

        const name = html`<h1><a rel="${rel}" href="${this.it.iri()}">${this.it.getName()}</a></h1>`;
        const summary = this.it.getSummary().length > 0 ? html`<h2>${this.renderSummary()}</h2>` : nothing;
        const header = this.it.getName().length + this.it.getSummary().length > 0 ? html`
            <header>${name}${summary}</header>` : nothing;

        const metadata = this.showMetadata ? html`
            <footer>${this.renderMetadata()}</footer>` : nothing;

        return html`<article>${header} ${this.renderContent()}</article>${metadata}`;
    }
}
