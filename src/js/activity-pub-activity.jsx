import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {until} from "lit-html/directives/until.js";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {hostFromIRI} from "./utils";

export class ActivityPubActivity extends ActivityPubObject {
    static styles = css`
    :host { color: var(--fg-color); }
    `;

    constructor() {
        super();
    }

    async renderActor() {
        const act = await this.load('actor');
        let username = act.preferredUsername;
        if (act.id.indexOf(new URL(window.location).hostname) < 0) {
            // NOTE(marius): if the actor's ID doesn't exist on the current domain, we add it to the display
            username = `${username}@${new URL(act.id).hostname}`
        }
        return html`<a href=${act.id}><oni-natural-language-value>${username}</oni-natural-language-value></a>`
    }

    async renderObject() {
        const raw = await this.load('object');
        return (new ActivityPubObject(raw)).render();
    }

    render() {
        const published = this.it.hasOwnProperty('published') ?
            html`at <time datetime=${this.published()}>${this.published()}</time> ` :
            nothing;
        return html`<div class=${this.type()}>
            <link rel="stylesheet" href="/main.css" />
            Published ${published}by ${until(this.renderActor())}<br/>
            ${until(this.renderObject(), "loading...")}
        </div>`
    }
}
