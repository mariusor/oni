import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";

export class ActivityPubAudio extends ActivityPubObject {
    static styles = [css`
        audio {
            max-width: 100%; 
            max-height: 12vw;
            align-self: start;
        }
        main {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        main > * {
            margin: .1rem;
        }
        main aside {
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
        return html`<main><audio src=${this.iri() ?? nothing}></audio> ${this.renderMetadata()}</main>`;
    }
}
