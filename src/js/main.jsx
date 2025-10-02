import {OnReady} from "./utils";
import {OniMain} from "./oni-main";
import {ActivityPubActor} from "./activity-pub-actor";
import {OniCollectionLink, OniCollectionLinks} from "./oni-collection-links";
import {NaturalLanguageValues} from "./natural-language-values";
import {ActivityPubActivity} from "./activity-pub-activity";
import {ActivityPubCollection} from "./activity-pub-collection";
import {ActivityPubItems} from "./activity-pub-items";
import {ActivityPubObject} from "./activity-pub-object";
import {ActivityPubImage} from "./activity-pub-image";
import {ActivityPubNote} from "./activity-pub-note";
import {ActivityPubAudio} from "./activity-pub-audio";
import {ActivityPubVideo} from "./activity-pub-video";
import {OniIcon} from "./oni-icon";
import {ActivityPubTombstone} from "./activity-pub-tombstone";
import {ActivityPubTag} from "./activity-pub-tag";
import {ActivityPubEvent} from "./activity-pub-event";
import {BandCampEmbed} from "./bandcamp-embed";
import {OniErrors} from "./oni-errors";
import {OniHeader} from "./oni-header";
import {OniLoginLink} from "./oni-login-link";
import {ActivityPubCreate} from "./activity-pub-create";
import {ActivityPubAnnounce} from "./activity-pub-announce";
import {ActivityPubAppreciation} from "./activity-pub-appreciation";
import {ActivityPubFollow} from "./activity-pub-follow";
import {PaletteElement} from "./oni-theme";
import {OniThrobber} from "./oni-throbber";

customElements.define('oni-main', OniMain);
customElements.define('oni-errors', OniErrors);
customElements.define('oni-header', OniHeader);
customElements.define('oni-palette', PaletteElement);

customElements.define('oni-object', ActivityPubObject);
customElements.define('oni-note', ActivityPubNote);
customElements.define('oni-image', ActivityPubImage);
customElements.define('oni-audio', ActivityPubAudio);
customElements.define('oni-video', ActivityPubVideo);
customElements.define('oni-actor', ActivityPubActor);
customElements.define('oni-collection', ActivityPubCollection);
customElements.define('oni-items', ActivityPubItems);
customElements.define('oni-tombstone', ActivityPubTombstone);
customElements.define('oni-tag', ActivityPubTag);
customElements.define('oni-event', ActivityPubEvent);

customElements.define('oni-activity', ActivityPubActivity);
customElements.define('oni-create', ActivityPubCreate);
customElements.define('oni-announce', ActivityPubAnnounce);
customElements.define('oni-appreciation', ActivityPubAppreciation);
customElements.define('oni-follow', ActivityPubFollow);

customElements.define('oni-natural-language-values', NaturalLanguageValues);

customElements.define('oni-collection-links', OniCollectionLinks);
customElements.define('oni-collection-link', OniCollectionLink);

customElements.define('oni-icon', OniIcon);
customElements.define('oni-throbber', OniThrobber);

customElements.define('oni-login-link', OniLoginLink);

customElements.define('bandcamp-embed', BandCampEmbed);

OnReady(function () {
    document.addEventListener('logged.in', () => window.location.reload());
    document.addEventListener('logged.out', () => window.location.reload());
});
