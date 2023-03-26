import {css, html, LitElement} from "lit";
import {classMap} from "lit-html/directives/class-map.js";
import {when} from "lit-html/directives/when.js";

export class LoginDialog extends LitElement {
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
            border: 2px outset var(--shadow-color);
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

    open() {
        this.opened = true;
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
        const targetURI = form.action;

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
                    if (response.status == 200) {
                        localStorage.setItem('token', value.code);
                        localStorage.setItem('state', value.state);
                        this.loginSuccessful();
                    } else {
                        if (value.hasOwnProperty('errors')) {
                            console.error(value.errors);
                            if (!Array.isArray(value.errors)) {
                                value.errors = [value.errors];
                            }
                            value.errors.forEach((err) => {
                                this.error += ` ${err.message}`;
                            })
                        } else {
                            console.error(value);
                            this.error += value.toString();
                        }
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
        const cont = await fetch(this.authorizeURL, { method: "GET", }).catch(console.error);

        const login = await cont.json();
        this.authorizeURL = login.authorizeURL;
        this.fetched = true;
    }

    render() {
        this.getAuthURL();
        return html`
            <style>
            </style>
            <div class=${classMap({overlay: true, opened: this.opened})} @click=${this.close}></div>
            <dialog ?opened="${this.opened}">
                <div class=${classMap({error: (this.error.length > 0)})}>${this.error}</div>
                <form method="post" action=${this.authorizeURL} @submit="${this.login}">
                    <input type="password" name="_pw" placeholder="Password"/><br/>
                    <button type="submit">Sign in</button>
                </form>
            </dialog>
        `
    }
}

export class LoginLink extends LitElement {
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

    constructor() {
        super()
        this.dialogVisible = false;
        this.loginVisible = !this.haveToken();
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

    haveToken() {
        const token = localStorage.getItem('token');
        return typeof token == 'string' && token.length > 0;
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('state');

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
