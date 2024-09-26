import {css, html, LitElement} from "lit";

export class BandCampEmbed extends LitElement {
    static styles = [css``]

    static properties = {
        url: {type: String},
        show: {type: Boolean},
    }

    constructor() {
        super();
        this.show = !!JSON.parse(localStorage.getItem('embeds'));
    }

    render() {
        console.debug("should we show embeds: ", this.show);
        if (!this.show || this.url === "") {
            return html`<slot></slot>`
        }
        return html`<iframe style="border: 0; width: 480px; height: 42px; vertical-align: middle" src="${this.url}" seamless>
            <slot></slot>
        </iframe>`
    }
}
