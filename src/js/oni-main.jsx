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
        //this.addEventListener('content.change', this.updateSelf)
    }

    // async updateSelf(e) {
    //     e.stopPropagation();
    //
    //     const outbox = this.it.getOutbox();
    //
    //     if (!outbox || !this.authorized) return;
    //     let headers = {};
    //     if (this.authorized) {
    //         const auth = this._auth.authorization;
    //         headers.Authorization = `${auth?.token_type} ${auth?.access_token}`;
    //     }
    //
    //     const it = this.it;
    //     const prop = e.detail.name;
    //
    //     it[prop] = e.detail.content;
    //
    //     const update = {
    //         type: "Update",
    //         actor: this.it.iri(),
    //         object: it,
    //     }
    //
    //     activity(outbox, update, headers)
    //         .then(response => {
    //             response.json().then((it) => this.it = new ActivityPubItem(it));
    //         }).catch(console.error);
    // }

    get authorized() {
        return this._auth.authorized && isMainPage();
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
