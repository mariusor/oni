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
    document.querySelectorAll(":root").forEach((root) => {
        const palette = JSON.parse(localStorage.getItem('palette'));
        if (palette === null) return;

        if (palette.colorScheme) root.style.colorScheme = palette.colorScheme;
        if (palette.bgColor) root.style.setProperty('--bg-color', palette.bgColor);
        if (palette.fgColor) root.style.setProperty('--fg-color', palette.fgColor);
        if (palette.linkColor) root.style.setProperty('--link-color', palette.linkColor);
        if (palette.linkActiveColor) root.style.setProperty('--link-active-color', palette.linkActiveColor);
        if (palette.linkVisitedColor) root.style.setProperty('--link-visited-color', palette.linkVisitedColor);
    });
});
