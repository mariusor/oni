import {css, html, LitElement, nothing} from "lit";

export class BandCampEmbed extends LitElement {
    static styles = [css`
        :host {
            max-height: 2rlh;
        }
        iframe {
            max-width: 100%;
        }
    `]

    static properties = {
        url: {type: String},
        show: {type: Boolean},
    }

    constructor() {
        super();
        this.show = false;
    }

    render() {
        if (!this.show || this.url === "") {
            return nothing;
        }
        return html`<iframe style="border: 0" src="${this.url}" seamless>
            <slot></slot>
        </iframe>`
    }
}
