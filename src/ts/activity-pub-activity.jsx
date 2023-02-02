import {css, html} from "lit";
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
        const ob = await this.load('object');

        switch (ob.type) {
            case 'Image':
                const id = ob.id;
                return html`<img src=${id}/>`;
            case 'Note':
                const cont = ob.content;
                return html`<oni-object it=${JSON.stringify(ob)}>${unsafeHTML(cont)}</oni-object>`;
        }
        return '';
    }

    render() {
        const published = this.it.hasOwnProperty('published') ?
            html`at <time datetime=${this.published()}>${this.published()}</time> ` :
            '';
        return html`<div>
            Published ${published}by ${until(this.renderActor())}<br/>
            ${until(this.renderObject(), "loading...")}
        </div>`
    }
}
