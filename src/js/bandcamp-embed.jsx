import {css, html, LitElement, nothing} from "lit";

export class BandCampEmbed extends LitElement {
    static styles = [css`
        :host {
            max-height: 2rlh;
        }
        iframe {
            max-width: 100%;
            border: none;
        }
    `]

    static properties = {
        url: {type: String},
        src: {type: String},
        show: {type: Boolean},
    }

    constructor() {
        super();
        this.show = false;
    }

    render() {
        if (!this.show || this.src === "") {
            return nothing;
        }
        if (!this.src) {
            this.src = this.url;
        }
        return html`<iframe src="${this.src}" seamless>
            <slot></slot>
        </iframe>`
    }
}
