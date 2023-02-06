import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {until} from "lit-html/directives/until.js";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";

export class ActivityPubActivity extends ActivityPubObject {
    static styles = css`
    :host { color: var(--fg-color); }
    `;

    constructor() {
        super();
    }

    async renderActor() {
        const act = await this.load('actor');
        return html`<oni-natural-language-value>${act.preferredUsername}</oni-natural-language-value>`
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
