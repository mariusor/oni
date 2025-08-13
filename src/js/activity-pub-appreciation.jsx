import {css, html, nothing} from "lit";
import {until} from "lit-html/directives/until.js";
import {renderTimestamp} from "./utils";
import {ActivityPubNote} from "./activity-pub-note";
import {ActivityPubActivity} from "./activity-pub-activity";

export class ActivityPubAppreciation extends ActivityPubActivity {
    static styles = [
        css``,
        ActivityPubNote.styles,
    ];

    constructor() {
        super(true);
    }

    renderInline() {
        if (!this.it.hasOwnProperty('actor')) return nothing;
        return html`<oni-actor it=${JSON.stringify(this.it.getActor())} ?inline=${true} ?showMetadata=${false}></oni-actor> ${this.it.type} ${renderTimestamp(this.it.getPublished(), true)}`;
    }

    render() {
        if (this.inline) {
            return html`${this.renderInline()}`;
        }
        const metadata = this.showMetadata ? html`<footer>${until(this.renderMetadata())}</footer>` : nothing;
        return html`${until(this.renderObject(false))} ${metadata}`;
    }
}

