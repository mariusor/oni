import {css, html} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {when} from "lit-html/directives/when.js";

export class ActivityPubNote extends ActivityPubObject {
    static styles = [css``, ActivityPubObject.styles];

    static properties = {
        it: {type: Object},
    };

    constructor(it) {
        super(it);
    }

    render() {
        const summary = this.summary();
        return html`${this.renderMetadata()}
        ${when(summary,
            () => html`<h2><oni-natural-language-values it=${JSON.stringify(summary)}></oni-natural-language-values></h2>`)
        }
        <oni-natural-language-values it=${JSON.stringify(this.content())}></oni-natural-language-values>
        ${this.renderAttachment()}`;
    }
}
