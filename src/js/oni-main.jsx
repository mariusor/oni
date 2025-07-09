import {html} from "lit";
import {until} from "lit-html/directives/until.js";
import {ActivityPubObject} from "./activity-pub-object";
import {isMainPage, renderColors} from "./utils";
import {AuthController} from "./auth-controller";
import {when} from "lit-html/directives/when.js";

export class OniMain extends ActivityPubObject {
    static styles = [];
    static properties = [{
        colors: {type: Array},
    }, ActivityPubObject.properties];

    _auth = new AuthController(this);

    constructor() {
        super();
    }

    get authorized() {
        return this._auth.authorized && isMainPage();
    }

    render() {
        const colors = html`${until(renderColors(this.it))}`

        return html`
            ${when(
                !isMainPage(),
                () => html`<oni-header it="${JSON.stringify(this.it)}"></oni-header>`,
            )}
            <slot></slot>
            ${colors}
            `;
    }
}
