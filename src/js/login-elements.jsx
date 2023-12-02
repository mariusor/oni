import {css, html, LitElement} from "lit";
import {classMap} from "lit-html/directives/class-map.js";
import {when} from "lit-html/directives/when.js";
import {handleServerError, isAuthorized} from "./utils";
import {ref} from "lit-html/directives/ref.js";
import {auth} from "./authorization-controller";
import {MobxLitElement} from "@adobe/lit-mobx";

export class LoginDialog extends MobxLitElement {
    static styles = css`
        dialog[opened] {
            display: flex;
            margin: auto;
        }
        dialog {
            opacity: 1;
            display: none;
            position: fixed;
            flex-direction: column;
            border: 2px outset var(--accent-color);
            background-color: var(--bg-color);
            padding: 1em;
            margin: 1em;
            align-content: center;
        }
        form {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        form input {
            width: 12rem;
        }
        form button {
            width: 12.4rem;
        }
        .error {
            text-align: center;
            color: red;
            font-size: .7em;
        }
        .overlay {
            background-color: var(--bg-color);
            opacity: .8;
            display: none;
            position: fixed;
            top: 0;
            bottom: 0;
            left: 0;
            right: 0;
        }
        .opened {
            display: block;
        }
    `;

    static properties = {
        opened: {type: Boolean},
        fetched: {type: Boolean},
        authorizeURL: {type: String},
        tokenURL: {type: String},
        error: {type: String},
    }

    _auth = auth;

    constructor() {
        super()
        this.opened = false;
        this.fetched = false;
        this.error = "";
    }

    static get properties() {
        return {
            opened: {type: Boolean}
        }
    }

    close() {
        this.opened = false;

        this.dispatchEvent(new CustomEvent('dialog.closed', {
            bubbles: true,
        }));
    }

    login(e) {
        e.stopPropagation();
        e.preventDefault();

        const form = e.target;
        const pw = form._pw.value
        form._pw.value = "";

        this.authorizationToken(form.action, pw).then(console.info("success authorization"));
    }

    async authorizationToken(targetURI, pw) {
        const l = new URLSearchParams({_pw: pw});

        const req = {
            method: 'POST',
            body: l.toString(),
            headers: {"Content-Type": "application/x-www-form-urlencoded"}
        };
        this.error = "";
        fetch(targetURI, req)
            .then(response => {
                response.json().then(value => {
                    if (response.status === 200) {
                        console.debug(`Obtained authorization code: ${value.code}`)
                        this.accessToken(value.code, value.state);
                    } else {
                        this.error = handleServerError(value)
                    }
                }).catch(console.error);
            }).catch(console.error);
    }

    async accessToken(code, state) {
        const tokenURL = this.tokenURL;

        const client = window.location.hostname;
        const l = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            state: state,
            client_id: client,
        });

        const basicAuth = btoa(`${client}:NotSoSecretPassword`);
        const req = {
            method: 'POST',
            body: l.toString(),
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${basicAuth}`
            }
        };

        fetch(tokenURL, req)
            .then(response => {
                response.json().then(value => {
                    if (response.status === 200) {
                        this._auth.authorization = value;
                        this.loginSuccessful();
                    } else {
                        this._auth.authorization = {};
                        this.error = handleServerError(value)
                    }
                }).catch(console.error);
            }).catch(console.error);
    }

    loginSuccessful() {
        this.close();

        this.dispatchEvent(new CustomEvent('logged.in', {
            bubbles: true,
            composed: true,
        }));
    }

    async getAuthURL() {
        if (this.fetched) {
            return;
        }
        console.debug(`loading: ${this.authorizeURL}`);
        fetch(this.authorizeURL, { method: "GET", })
            .then( cont => {
                cont.json().then(login => {
                    this.authorizeURL = login.authorizeURL;
                    this.fetched = true;
                }).catch(console.error);
            })
            .catch(console.error);

    }

    render() {
        this.getAuthURL();

        const setFocus = (pw) => pw && pw.focus();

        return html`
            <div class=${classMap({overlay: true, opened: this.opened})} @click=${this.close}></div>
            <dialog ?opened="${this.opened}">
                <div class=${classMap({error: (this.error.length > 0)})}>${this.error}</div>
                <form method="post" action=${this.authorizeURL} @submit="${this.login}">
                    <input type="password" id="_pw" name="_pw" placeholder="Password" ${ref(setFocus)} /><br/>
                    <button type="submit">Sign in</button>
                </form>
            </dialog>
        `
    }
}

export class LoginLink extends MobxLitElement {
    static styles = css`
        :host {
            position: absolute;
            top: 1rem;
            right: 1rem;
        }
    `;

    static properties = {
        authorizeURL: {type: String},
        tokenURL: {type: String},
        dialogVisible: {type: Boolean},
        loginVisible: {type: Boolean},
    }

    _auth = auth;

    constructor() {
        super()
        this.dialogVisible = false;
        this.loginVisible = !isAuthorized();
    }

    showDialog(e) {
        e.preventDefault();
        e.stopPropagation();

        this.dialogVisible = true;
    }

    hideDialog(e) {
        this.dialogVisible = false;
        this.loginVisible = true;
    }

    logout() {
        //localStorage.removeItem('authorization');
        this._auth.authorization = {};

        this.loginVisible = true;
        this.dispatchEvent(new CustomEvent('logged.out', {
            bubbles: true,
            composed: true,
        }));
    }

    render() {
        return html`
            <nav>
            ${when(
                this.loginVisible,
                () => html`
                            <button @click="${this.showDialog}">
                                <oni-icon name="lock"></oni-icon>
                                Sign in
                            </button>
                            <oni-login-dialog
                                    ?opened="${this.dialogVisible}"
                                    authorizeURL=${this.authorizeURL}
                                    tokenURL=${this.tokenURL}
                                    @dialog.closed=${this.hideDialog}
                                    @logged.in=${() => {this.loginVisible = false}}
                            ></oni-login-dialog>
                        `,
                    () => html`
                        <button @click="${this.logout}">
                            Sign out
                        </button>
                    `
            )}
            </nav>
            `;
    }
}
