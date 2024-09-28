import {css, html, LitElement, nothing} from "lit";

export class BandCampEmbed extends LitElement {
    static styles = [css`
        :host {
            max-height: 2rlh;
            margin: 0 .2rem .4rlh 0;
            min-width: 480px;
        }
        iframe {
            min-width: 480px;
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
