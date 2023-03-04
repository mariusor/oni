import {css, html, LitElement} from "lit";
import {classMap} from "lit-html/directives/class-map.js";
import {when} from "lit-html/directives/when.js";

export class LoginDialog extends LitElement {
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
        this.open = true;
    }

    close() {
        this.opened = false;
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
                        this.opened = false;
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
            })
            .catch(console.error);

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
                dialog[opened] {
                    display: flex;
                    margin: auto;
                }
                dialog {
                    opacity: 1;
                    display: none;
                    position: fixed;
                    flex-direction: column;
                    border: 2px outset black;
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
                    opacity: 0.4;
                    background-color: var(--bg-color);
                    position: fixed;
                    top: 0;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    display: none;
                }
                .open {
                    display: block
                }
            </style>
            <div class=${classMap({overlay: true, open: this.opened})} @click=${this.close}></div>
            <dialog ?opened="${this.opened}">
                <div class=${classMap({error: (this.error.length > 0)})}>${this.error}</div>
                <form method="post" action=${this.authorizeURL} @submit="${this.login}">
                    <input type="password" name="_pw" placeholder="Password"/><br/>
                    <button type="submit">Sign in</button>
                </form>
            </dialog>`
    }
}

export class LoginLink extends LitElement {
    static styles = css`
        :host {
            position: fixed;
            top: 1rem;
            right: 1rem;
        }
    `;

    static properties = {
        authorizeURL: {type: String},
        tokenURL: {type: String},
        dialogVisible: {type: Boolean},
    }

    constructor() {
        super()
        this.dialogVisible = false
    }

    static get properties() {
        return {
            dialogVisible: {type: Boolean}
        }
    }

    showDialog(e) {
        this.dialogVisible = true;
    }

    haveToken() {
        const token = localStorage.getItem('token');
        return typeof token == 'string' && token.length > 0;
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('state');
    }

    render() {
        return html`
            <nav>
            ${when(
                !this.haveToken(),
                () => html`
                            <button @click="${this.showDialog}">
                                <oni-icon name="lock"></oni-icon>
                                Sign in
                            </button>
                            <oni-login-dialog
                                    ?opened="${this.dialogVisible}"
                                    authorizeURL=${this.authorizeURL}
                                    tokenURL=${this.tokenURL}
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
