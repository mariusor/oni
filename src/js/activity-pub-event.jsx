import {ActivityPubObject} from "./activity-pub-object";
import {ActivityPubNote} from "./activity-pub-note";

export class ActivityPubEvent extends ActivityPubNote {
    static styles = ActivityPubObject.styles;

    constructor(it) {
        super(it);
    }
}
