import {css, html, LitElement} from "lit";
import {when} from "lit-html/directives/when.js";
import {isAuthorized} from "./utils.js";
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
        form input {
            width: 12rem;
        }
        form button {
            width: 12.4rem;
        }
        oni-errors {
            color: var(--accent-color);
            line-height: 1.4rem;
        }
    `, OniCollectionLink.styles];

    static properties = {
        authorizeURL: {type: String},
        tokenURL: {type: String},
        fetched: {type: Boolean},
        error: {type: Object},
        authorized: {type: Boolean},
    }

    _auth = new AuthController(this);

    constructor() {
        super()
        this.fetched = false;
        this.authorized = isAuthorized();
    }

    showDialog(e) {
        e.preventDefault();
        e.stopPropagation();

        this.shadowRoot?.querySelector("dialog")?.showModal();
        this.error = null;
    }

    hideDialog(e) {
        this.error = null;
        this.shadowRoot?.querySelector("dialog")?.close();
    }

    logout() {
        this._auth.authorization = null;
        eraseAuthCookie();

        this.dispatchEvent(new CustomEvent('logged.out', {
            bubbles: true,
            composed: true,
        }));
        this.error = null;
        this.authorized = isAuthorized();
    }

    login(e) {
        e.stopPropagation();
        e.preventDefault();

        const form = e.target;
        const pw = form._pw.value
        form._pw.value = "";

        this.authorizationToken(form.action, pw);
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

        fetch(targetURI, req)
            .then(response => {
                if (response.headers.has('Content-Type') && !response.headers.get('Content-Type').startsWith('application/json')) {
                    throw Error(`invalid response received from authorization page`);
                }
                response.json().then(value => {
                    if (response.status === 200) {
                        console.debug(`Obtained authorization code: ${value.code}`)
                        this.accessToken(value.code, value.state, pw);
                    } else {
                        this.error = {errors: [{code: value['error'], message: value['error_description']}]};
                    }
                }).catch(console.warn);
            })
            .catch((error) => this.error = handleError(error));
    }

    async accessToken(code, state, pw) {
        const tokenURL = this.tokenURL;

        const client = window.location.hostname;
        const l = new URLSearchParams({
            grant_type: 'client_credentials',
            code: code,
            state: state,
            client_id: client,
        });

        const basicAuth = btoa(`${client}:${pw}`);
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
                if (response.headers.has('Content-Type') && !response.headers.get('Content-Type').startsWith('application/json')) {
                    throw Error(`invalid response from token page`);
                }
                response.json().then(value => {
                    if (response.status === 200) {
                        this._auth.authorization = value;
                        this.loginSuccessful();
                    } else {
                        this._auth.authorization = {};
                        this.error = {errors: [{code: value['error'], message: value['error_description']}]};
                    }
                }).catch(console.warn);
            }).catch((error) => this.error = handleError(error));
    }

    loginSuccessful() {
        const closeEvent = new CustomEvent('logged.in', {
            bubbles: true,
            composed: true,
        });
        setAuthCookie(encodeURIComponent(JSON.stringify(this._auth.authorization)));
        this.error = null;
        this.authorized = isAuthorized();
        this.dispatchEvent(closeEvent);
        this.hideDialog(closeEvent);
    }

    async getAuthURL() {
        if (this.fetched) {
            return;
        }

        fetch(this.authorizeURL, {method: "GET", headers: {Accept: "application/json"}})
            .then(cont => {
                cont.json().then(login => {
                    this.authorizeURL = login.authorizeURL;
                    this.fetched = true;
                }).catch(console.warn);
            }).catch(console.warn);
    }

    render() {
        this.getAuthURL();
        return html`
            <nav>${when(
                    !isAuthorized(),
                    () => html`
                        <a @click=${this.showDialog} href="#"><oni-icon alt="Authorize with OAuth2" name="sign-in"></oni-icon>Sign in</a>
                        <dialog closedby="any">
                            <oni-errors it=${JSON.stringify(this.error?.errors)} ?inline=${true}></oni-errors>
                            <form method="post" action=${this.authorizeURL} @submit="${this.login}">
                                <input type="password" id="_pw" name="_pw" placeholder="Password" autofocus required/><br/>
                                <button type="submit">Sign in</button>
                            </form>
                        </dialog>`,
                    () => html`<a @click=${this.logout} href="#"><oni-icon alt="Sign out" name="sign-out"></oni-icon>Sign out</a>`
            )}</nav>`;
    }
}

function handleError(error) {
    if (typeof error === 'object' && error.hasOwnProperty('name') && error.hasOwnProperty('message')) {
        console.warn(error.name, error.message);
        return {'errors': [{'code': error.name, 'message': error.message}]};
    }
}

function setAuthCookie(value) {
    const date = new Date();
    date.setTime(date.getTime() + (7 * 24 * 60 * 60 * 1000));
    document.cookie = `auth=${(value || "")}; expires=${date.toUTCString()}; path=/`;
}

function eraseAuthCookie() {
    document.cookie = `auth=; expires=${new Date(0).toUTCString()}; path=/`;
}
