import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {until} from "lit-html/directives/until.js";
import {isLocalIRI, pastensify} from "./utils";

export class ActivityPubActivity extends ActivityPubObject {
    static styles = css`
    :host { color: var(--fg-color); }
    `;

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
        return html`by <a href=${act.id}><oni-natural-language-value it=${username}></oni-natural-language-value></a>`
    }

    async renderObject() {
        const raw = await this.load('object');
        if (raw === null) { return nothing; }
        return (new ActivityPubObject(raw)).render();
    }

    renderMetadata() {
        if (this.type() === 'Delete' && !isLocalIRI(this.iri())) {
            return nothing;
        }

        const act = until(this.renderActor());
        if (act === nothing) {
            return nothing;
        }

        const published = this.it.hasOwnProperty('published') ?
            html`at <time datetime=${this.published()}>${this.published()}</time> ` :
            nothing;

        return html`${pastensify(this.type())} ${published}${act}<br/>`
    }
    render() {
        return html`<div class=${this.type()}>
            ${until(this.renderObject())}
            ${this.renderMetadata()}
        </div>`
    }
}
