import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";

export class ActivityPubImage extends ActivityPubObject {
    static styles = [css`
        img {
            max-width: 100%; 
            max-height: 12vw;
            align-self: start;
            border-radius: .4rem;
            border: 1px solid var(--shadow-color);
        }`, ActivityPubObject.styles];
    static properties = {
        it: {type: Object},
    };

    constructor(it) {
        super(it);
    }

    render() {
        let src = this.iri();
        if (!src) {
            src = this.url();
        }
        return html`<article>
            <img src=${src ?? nothing} title="${this.name()}"/> <footer>${this.renderMetadata()}</footer>
        </article>`;
    }
}
