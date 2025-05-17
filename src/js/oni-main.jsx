import {html, LitElement, nothing} from "lit";
import {until} from "lit-html/directives/until.js";
import {ActivityPubObject} from "./activity-pub-object";
import {isMainPage, renderColors} from "./utils";
import {AuthController} from "./auth-controller";

export class OniMain extends LitElement {
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
            <slot></slot>
            ${colors}`;
    }
}
