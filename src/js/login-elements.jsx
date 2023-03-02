import {css, html, LitElement} from "lit";

export class LoginDialog extends LitElement {
    static properties = {
        opened: {type: Boolean},
        fetched: {type: Boolean},
        authorizeURL: {type: String},
        tokenURL: {type: String},
    }

    constructor() {
        super()
        this.opened = false;
        this.fetched = false;
    }

    static get properties() {
        return {
            opened: {type: Boolean}
        }
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
        fetch(targetURI, req)
            .then(response => {
                response.json().then(value => {
                    if (response.status == 200) {
                        console.debug(`received token: `, value)
                        localStorage.setItem('token', value.code);
                        localStorage.setItem('state', value.state);
                    } else {
                        if (value.hasOwnProperty('errors')) {
                            console.error(value.errors)
                        } else {
                            console.error(value);
                        }
                    }
                }).catch(console.error);
            })
            .catch(console.error);

        this.opened = false;
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
                    display: none;
                    position: fixed;
                    flex-direction: column;
                    border: 2px outset black;
                    padding: 1em;
                    margin: 1em;
                }
                form {
                    display: flex;
                    flex-direction: row;
                }
            </style>
            <dialog ?opened="${this.opened}">
                <h1>Please authenticate to ONI</h1>
                <form method="post" action=${this.authorizeURL} @submit="${this.login}">
                    <label>Password: <input type="password" name="_pw"/></label><br/>
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

    render() {
        return html`
            <nav>
                <button @click="${this.showDialog}">
                    <oni-icon name="lock"></oni-icon>
                    Sign in
                </button>
                <oni-login-dialog
                        ?opened="${this.dialogVisible}"
                        authorizeURL=${this.authorizeURL}
                        tokenURL=${this.tokenURL}
                ></oni-login-dialog>
            </nav>`;
    }
}
