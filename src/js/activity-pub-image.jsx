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

    constructor(it) {
        super(it);
    }

    render() {
        let src = this.it.iri();
        if (!src) {
            src = this.it.getUrl();
        }
        return html`<article>
            <img src=${src ?? nothing} title="${this.it.getName()}"/>
        </article>
        <footer>${this.renderMetadata()}</footer>`;
    }
}
