import {OnReady} from "./utils";
import {ActivityPubActor} from "./activity-pub-actor";
import {CollectionLink} from "./collection-link";
import {CollectionLinks} from "./collection-links";
import {NaturalLanguageValues} from "./natural-language-values";
import {ActivityPubActivity} from "./activity-pub-activity";
import {ActivityPubCollection} from "./activity-pub-collection";
import {ActivityPubObject} from "./activity-pub-object";
import {ActivityPubImage} from "./activity-pub-image";
import {ActivityPubNote} from "./activity-pub-note";
import {ActivityPubAudio} from "./activity-pub-audio";
import {ActivityPubVideo} from "./activity-pub-video";
import {Icon} from "./icon";

customElements.define('oni-natural-language-values', NaturalLanguageValues);
customElements.define('oni-object', ActivityPubObject);
customElements.define('oni-note', ActivityPubNote);
customElements.define('oni-image', ActivityPubImage);
customElements.define('oni-audio', ActivityPubAudio);
customElements.define('oni-video', ActivityPubVideo);
customElements.define('oni-actor', ActivityPubActor);
customElements.define('oni-collection', ActivityPubCollection);
customElements.define('oni-collection-link', CollectionLink);
customElements.define('oni-collection-links', CollectionLinks);
customElements.define('oni-activity', ActivityPubActivity);

customElements.define('oni-icon', Icon);
OnReady(function () {
    document.querySelectorAll(":root").forEach((root) => {
        const colorScheme = localStorage.getItem('colorScheme');
        if (colorScheme) {
            root.style.colorScheme = colorScheme;
        }
        const backgroundColor = localStorage.getItem('backgroundColor');
        if (backgroundColor) {
            root.style.setProperty('--bg-color', backgroundColor);
        }
    });
});
