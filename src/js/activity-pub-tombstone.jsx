import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {relativeDate} from "./utils";

export class ActivityPubTombstone extends ActivityPubObject {
    static styles = [css``, ActivityPubObject.styles];

    static properties = {
        it: {type: Object},
    };

    constructor(it) {
        super(it);
    }

    deleted() {
        if (!this.it || !this.it.hasOwnProperty('deleted')) {
            return null;
        }
        const d = new Date();
        d.setTime(Date.parse(this.it.deleted));
        return d || null;
    }

    renderDeleted() {
        const deleted = this.deleted()
        if (!deleted) {
            return nothing;
        }
        return html` <time datetime=${deleted.toUTCString()} title=${deleted.toUTCString()}>
            <oni-icon name="deleted" title="Deleted"></oni-icon> ${relativeDate(deleted)}
        </time>`;
    }

    render() {
        return html`${this.renderDeleted()}`
    }
}
