import {html} from "lit";
import {until} from "lit-html/directives/until.js";
import {ActivityPubObject} from "./activity-pub-object";
import {isMainPage, renderColors} from "./utils";
import {when} from "lit-html/directives/when.js";

export class OniMain extends ActivityPubObject {
    static styles = [];
    static properties = [{
        colors: {type: Array},
    }, ActivityPubObject.properties];

    constructor() {
        super();
    }

    renderHeader() {
        return html`${when(
            !isMainPage(),
            () => html`<oni-header it="${JSON.stringify(this.it)}"></oni-header>`,
        )}`;
    }

    render() {
        const colors = html`${until(renderColors(this.it))}`

        return html`${until(this.renderHeader())}
            <slot></slot>
            ${colors}
            `;
    }
}
