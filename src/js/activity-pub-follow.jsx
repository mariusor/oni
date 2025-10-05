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

    render() {
        return html`${this.renderInline()}`;
    }
}

