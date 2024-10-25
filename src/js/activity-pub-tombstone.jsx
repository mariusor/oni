import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {relativeDate} from "./utils";

export class ActivityPubTombstone extends ActivityPubObject {
    static styles = ActivityPubObject.styles;

    constructor(it) {
        super(it);
    }

    renderDeleted() {
        if (this.it.type !== "Tombstone") {
            return nothing;
        }
        const deleted = this.it.getDeleted();
        return html`This ${this.it.formerType} has been deleted ${deleted ?
                html`
                    <time dateTime=${deleted.toUTCString()} title=${deleted.toUTCString()}>
                        <oni-icon name="deleted" title="Deleted"></oni-icon>
                        ${relativeDate(deleted)}
                    </time>` : nothing}`;
    }

    render() {
        return html`${this.renderDeleted()}`
    }
}
