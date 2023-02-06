import {OnReady} from "./utils";
import {ActivityPubActor} from "./activity-pub-actor";
import {CollectionLink} from "./collection-link";
import {NaturalLanguageValues} from "./natural-language-values";
import {ActivityPubActivity} from "./activity-pub-activity";
import {ActivityPubCollection} from "./activity-pub-collection";
import {ActivityPubObject} from "./activity-pub-object";

customElements.define('oni-natural-language-values', NaturalLanguageValues);
customElements.define('oni-object', ActivityPubObject);
customElements.define('oni-actor', ActivityPubActor);
customElements.define('oni-collection', ActivityPubCollection);
customElements.define('oni-collection-link', CollectionLink);
customElements.define('oni-activity', ActivityPubActivity);

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
