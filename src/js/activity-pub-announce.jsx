import {css, html, nothing} from "lit";
import {until} from "lit-html/directives/until.js";
import {ActivityPubCreate} from "./activity-pub-create";
import {renderTimestamp} from "./utils";
import {ActivityPubNote} from "./activity-pub-note";

export class ActivityPubAnnounce extends ActivityPubCreate {
    static styles = [
        css``,
        ActivityPubNote.styles,
    ];

    constructor() {
        super(true);
    }

    renderMetadata() {
        if (!this.showMetadata) return nothing;

        let auth = nothing;
        if (this.it.hasOwnProperty("attributedTo") || this.it.hasOwnProperty('actor')) {
            auth = this.renderAuthor();
        }
        let action = 'Shared';

        let published = this.it.getPublished();
        return html`
            <aside>
                ${action} ${renderTimestamp(published)} ${until(auth)}
                ${this.renderPermaLink()}
            </aside>`;
    }

    renderPermaLink(hideOnName) {
        if (!this.it.hasOwnProperty('object')) return nothing;
        const ob = this.it.object;
        return html`<a href="${ob?.id ?? nothing}"><oni-icon title="Bookmark this item" name="external-href"></oni-icon></a>`;
    }

    renderInline() {
        if (!this.it.hasOwnProperty('actor')) return nothing;
        return html`shared by <oni-actor it=${JSON.stringify(this.it.getActor())} ?inline=${true} ?showMetadata=${false}></oni-actor> ${renderTimestamp(this.it.getPublished(), true)}`;
    }

    render() {
        if (this.inline) {
            return html`${this.renderInline()}`;
        }
        const metadata = this.showMetadata ? html`<footer>${until(this.renderMetadata())}</footer>` : nothing;
        return html`${until(this.renderObject(false))} ${metadata}`;
    }
}

