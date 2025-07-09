import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {relativeDate} from "./utils";
import {ActivityPubItem} from "./activity-pub-item";

export class ActivityPubTombstone extends ActivityPubObject {
    static styles = ActivityPubObject.styles;

    constructor() {
        super();
    }

    renderDeleted() {
        if (!ActivityPubItem.isValid(this.it)) return nothing;
        if (this.it.type !== "Tombstone") {
            return nothing;
        }
        const deleted = this.it.getDeleted();
        return html`This ${this.it.formerType} has been deleted ${deleted ?
                html`
                    <time dateTime=${deleted.toUTCString()} title=${deleted.toUTCString()}>
                        <oni-icon name="deleted" alt="Deleted"></oni-icon>
                        ${relativeDate(deleted)}
                    </time>` : nothing}`;
    }

    render() {
        return html`${this.renderDeleted()}`
    }
}
