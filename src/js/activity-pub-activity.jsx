import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {until} from "lit-html/directives/until.js";
import {isLocalIRI} from "./utils";

export class ActivityPubActivity extends ActivityPubObject {
    static styles = css` :host { color: var(--fg-color); }`;

    constructor() {
        super();
    }

    async renderActor() {
        const act = await this.load('actor');
        if (act === null) {
            return nothing;
        }
        let username = act.preferredUsername;

        if (isLocalIRI(act.id)) {
            username = `${username}@${new URL(act.id).hostname}`
        }
        return html`by <a href=${act.id}>
            <oni-natural-language-values it=${username}></oni-natural-language-values>
        </a>`
    }

    async renderObject() {
        const raw = await this.load('object');
        if (raw === null) {
            return nothing;
        }
        return (new ActivityPubObject(raw)).render();
    }

    render() {
        if (this.type() !== 'Create') { return nothing; }
        return html` ${until(this.renderObject())} `;
    }
}
