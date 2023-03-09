import {css, html} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {when} from "lit-html/directives/when.js";

export class ActivityPubNote extends ActivityPubObject {
    static styles = [css`
    article {
        display: flex;
        flex-direction: column;
    }
    article > * {
        margin: .1rem;
    }
    article header h2 {
        padding: 0 .1rem;
        margin: 0;
        font-size: 1.2rem;
    }
    article header {
        align-self: start;
    }
    article footer {
        align-self: end;
    }
    `, ActivityPubObject.styles];

    static properties = {
        it: {type: Object},
    };

    constructor(it) {
        super(it);
    }

    render() {
        const summary = this.summary();
        console.debug(`summary: `, summary.length)
        return html`<article>
        ${when(summary.length > 0,
            () => html`<header><h2><oni-natural-language-values it=${JSON.stringify(summary)}></oni-natural-language-values></h2></header>`)
        }
        <oni-natural-language-values it=${JSON.stringify(this.content())}></oni-natural-language-values>
        <aside>${this.renderAttachment()}</aside>
        <footer>${this.renderMetadata()}</footer>
        </article>`;
    }
}
