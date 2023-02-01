import {ActivityPubPerson} from "./activity-pub-person";
import {CollectionLink} from "./collection-link";
import {NaturalLanguageValue} from "./natural-language-value";
import {OnReady, rgb} from "./utils";

customElements.define('oni-natural-language-value', NaturalLanguageValue);
customElements.define('oni-person', ActivityPubPerson);
customElements.define('oni-collection-link', CollectionLink);

OnReady(function () {
    document.querySelectorAll(":root").forEach((root) => {
        const colorScheme = localStorage.getItem('colorScheme');
        if (colorScheme) {
            root.style.colorScheme = colorScheme;
        }
        const backgroundColor = localStorage.getItem('backgroundColor');
        if (backgroundColor) {
            root.style.setProperty('--bg-color', backgroundColor);
            root.style.backgroundColor = backgroundColor;
        }
    });
});
