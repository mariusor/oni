import {OnReady} from "./utils";
import {OniMainActor} from "./oni-main-actor";
import {ActivityPubActor} from "./activity-pub-actor";
import {CollectionLink, CollectionLinks} from "./collection-links";
import {NaturalLanguageValues} from "./natural-language-values";
import {ActivityPubActivity} from "./activity-pub-activity";
import {ActivityPubCollection} from "./activity-pub-collection";
import {ActivityPubObject} from "./activity-pub-object";
import {ActivityPubImage} from "./activity-pub-image";
import {ActivityPubNote} from "./activity-pub-note";
import {ActivityPubAudio} from "./activity-pub-audio";
import {ActivityPubVideo} from "./activity-pub-video";
import {Icon} from "./icon";
import {LoginDialog, LoginLink} from "./login-elements";
import {ActivityPubTombstone} from "./activity-pub-tombstone";
import {ActivityPubTag} from "./activity-pub-tag";

customElements.define('oni-main', OniMainActor);
customElements.define('oni-object', ActivityPubObject);
customElements.define('oni-note', ActivityPubNote);
customElements.define('oni-image', ActivityPubImage);
customElements.define('oni-audio', ActivityPubAudio);
customElements.define('oni-video', ActivityPubVideo);
customElements.define('oni-actor', ActivityPubActor);
customElements.define('oni-collection', ActivityPubCollection);
customElements.define('oni-tombstone', ActivityPubTombstone);
customElements.define('oni-activity', ActivityPubActivity);
customElements.define('oni-tag', ActivityPubTag);

customElements.define('oni-natural-language-values', NaturalLanguageValues);
customElements.define('oni-collection-link', CollectionLink);
customElements.define('oni-collection-links', CollectionLinks);

customElements.define('oni-icon', Icon);

customElements.define('oni-login-link', LoginLink);
customElements.define('oni-login-dialog', LoginDialog);

OnReady(function () {
    console.log(`Loading ${window.location}`);
});
