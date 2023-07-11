import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {classMap} from "lit-html/directives/class-map.js";
import {when} from "lit-html/directives/when.js";

export class ActivityPubImage extends ActivityPubObject {
    static styles = [css`
        img {
            max-width: 100%; 
            max-height: 12vw;
            align-self: start;
            border-radius: .4rem;
            border: 1px solid var(--accent-color);
        }
        img.small {
            max-width: 1rem;
            max-height: 1rem;
            vertical-align: text-top;
        }
        `, ActivityPubObject.styles];

    constructor(it) {
        super(it);
    }

    render() {
        let src = this.it.iri();
        if (!src) {
            src = this.it.getUrl();
        }
        return html`<img src=${src ?? nothing} title="${this.it.getName()}" class="${classMap({"small": this.inline})}"/>
        ${when(
            this.inline,
                () => nothing,
                () => html`<footer>${this.renderMetadata()}</footer>`
        )}`;
    }
}
