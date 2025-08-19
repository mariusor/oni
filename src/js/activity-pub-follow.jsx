import {css, html, nothing} from "lit";
import {pastensify, renderActorByType, renderObjectByType, renderTimestamp} from "./utils";
import {ActivityPubActivity} from "./activity-pub-activity";

export class ActivityPubFollow extends ActivityPubActivity {
    static styles = [
        css``,
        ActivityPubActivity.styles,
    ];

    constructor() {
        super(true);
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
        return html`${this.renderInline()}`;
    }
}

