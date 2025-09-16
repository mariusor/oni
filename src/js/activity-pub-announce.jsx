import {css, html, nothing} from "lit";
import {ActivityPubCreate} from "./activity-pub-create";
import {pastensify, renderActorByType, renderObjectByType, renderTimestamp} from "./utils";
import {ActivityPubActivity} from "./activity-pub-activity";
import {until} from "lit-html/directives/until.js";

export class ActivityPubAnnounce extends ActivityPubCreate {
    static styles = [
        css``,
        ActivityPubActivity.styles,
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
        let action = pastensify(this.it.type);

        let published = this.it.getPublished();
        if ((!auth || auth === nothing) && !published) {
            return nothing;
        }
        // NOTE(marius): we render reactions here too, in order to avoid metadata being aligned to the left
        return html`
            ${until(this.renderReactions())}
            <aside>
                ${action} ${renderTimestamp(published)} ${until(auth)}
                ${this.renderBookmark()}
            </aside>`;
    }

    renderInline() {
        if (!this.it.hasOwnProperty('actor')) return nothing;
        const action = pastensify(this.it.type, true);
        return html`
            ${renderObjectByType(this.it.getObject(), false, true)}
            ${action} by ${renderActorByType(this.it.getActor(), false, true)}
            ${renderTimestamp(this.it.getPublished(), true)}`;
    }

    render() {
        if (this.inline) {
            return html`${this.renderInline()}`;
        }
        const metadata = this.showMetadata ? html`<footer>${until(this.renderMetadata())}</footer>` : nothing;
        return html`${until(this.renderObject(false))} ${metadata}`;
    }
}

