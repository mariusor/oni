import {css, html} from "lit";
import {until} from "lit-html/directives/until.js";
import {ActivityPubObject} from "./activity-pub-object";
import {isMainPage} from "./utils";
import {when} from "lit-html/directives/when.js";

export class OniMain extends ActivityPubObject {
    static styles = [css``];

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
        return html`${until(this.renderHeader())}
            <slot></slot>
            <oni-palette></oni-palette>
        `;
    }
}
