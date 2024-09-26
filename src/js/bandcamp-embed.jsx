import {css, html, LitElement, nothing} from "lit";

export class BandCampEmbed extends LitElement {
    static styles = [css`
        :host {
            max-height: 2rlh;
            margin: 0 .2rem .4rlh 0;
        }
        iframe {
            min-width: 400px;
        }
    `]

    static properties = {
        url: {type: String},
        show: {type: Boolean},
    }

    constructor() {
        super();
        this.show = !!JSON.parse(localStorage.getItem('embeds'));
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
