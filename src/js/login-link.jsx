import {css, html, LitElement} from "lit";
import {classMap} from "lit-html/directives/class-map.js";
import {when} from "lit-html/directives/when.js";
import {handleServerError, isAuthorized} from "./utils.js";
import {AuthController} from "./auth-controller.js";
import {OniCollectionLink} from "./oni-collection-links";

export class LoginLink extends LitElement {
    static styles = [css`
        dialog {
            flex-direction: column;
            border: 2px outset var(--accent-color);
            background-color: var(--bg-color);
            padding: 1em;
            margin: 1em auto;
            align-content: center;
        }
        dialog::backdrop {
            background-color: var(--bg-color);
            opacity: .9;
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
    `, OniCollectionLink.styles];

    static properties = {
        authorizeURL: {type: String},
        tokenURL: {type: String},
        fetched: {type: Boolean},
        error: {type: String},
    }

    _auth = new AuthController(this);

    constructor() {
        super()
        this.fetched = false;
        this.error = "";
    }

    showDialog(e) {
        e.preventDefault();
        e.stopPropagation();

        const dialog = this.shadowRoot?.querySelector("dialog");
        dialog?.showModal();
    }

    hideDialog(e) {
        const dialog = this.shadowRoot?.querySelector("dialog");
        dialog?.close();
    }

    logout() {
        this._auth.authorization = null;

        this.dispatchEvent(new CustomEvent('logged.out', {
            bubbles: true,
            composed: true,
        }));
    }

    login(e) {
        e.stopPropagation();
        e.preventDefault();

        const form = e.target;
        const pw = form._pw.value
        form._pw.value = "";

        this.authorizationToken(form.action, pw).then(() => console.info("success authorization"));
    }

    async authorizationToken(targetURI, pw) {
        const l = new URLSearchParams({_pw: pw});

        const req = {
            method: 'POST',
            body: l.toString(),
            headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            }
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
                Accept: "application/json",
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
        const closeEvent = new CustomEvent('logged.in', {
            bubbles: true,
            composed: true,
        });
        this.dispatchEvent(closeEvent);
        this.hideDialog(closeEvent);
    }

    async getAuthURL() {
        if (this.fetched) {
            return;
        }

        fetch(this.authorizeURL, { method: "GET", headers: {Accept: "application/json"}})
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
        return html`
            <nav>
            ${when(
                !isAuthorized(),
                () => html`
                            <a @click=${this.showDialog} href="#"><oni-icon alt="Authorize with OAuth2" name="sign-in"></oni-icon>Sign in</a>
                            <dialog closedby="any">
                                <div class=${classMap({error: (this.error.length > 0)})}>${this.error}</div>
                                <form method="post" action=${this.authorizeURL} @submit="${this.login}">
                                    <input type="password" id="_pw" name="_pw" placeholder="Password" autofocus required /><br/>
                                    <button type="submit">Sign in</button>
                                </form>
                            </dialog>
                        `,
                    () => html`
                        <a @click=${this.logout} href="#"><oni-icon alt="Sign out" name="sign-out"></oni-icon>Sign out</a>
                    `
            )}
            </nav>`;
    }
}
