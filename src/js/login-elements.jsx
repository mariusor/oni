import {css, html, LitElement} from "lit";

export class LoginDialog extends LitElement {
    _pw = new LoginController(this);

    constructor() {
        super()
        this.opened = false
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
        console.debug(l.toString());
        fetch(targetURI, {method: 'POST', body: l.toString(), headers: {"Content-Type": "multipart/form-data"}})
            .then(response => {
                response.json().then(value => {
                    if (response.status == 200) {
                        console.debug(`received token: ${value}`)
                        localStorage.setItem('token', value);
                    }
                    if (value.hasOwnProperty('errors')) {
                        console.error(value.errors)
                    } else {
                        console.error(value);
                    }
                }).catch(console.error);
            })
            .catch(console.error);

        this.opened = false;
    }

    render() {
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
                <form method="post" action="/login" @submit="${this.login}">
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

    constructor() {
        super()
        this.dialogVisible = false
    }

    static get properties() {
        return {
            dialogVisible: {type: Boolean}
        }
    }

    render() {
        console.log('Dialog visible:', this.dialogVisible)
        return html`
            <div>
                <button @click="${this.showDialog}"><oni-icon name="lock"></oni-icon>Sign in</button>
                <oni-login-dialog
                        ?opened="${this.dialogVisible}"></oni-login-dialog>
            </div>`;
    }

    showDialog(e) {
        this.dialogVisible = true;
    }
}

class LoginController {
    constructor(host) {
        this.host = host;
        host.addController(this);
    }

    hostConnected() {
    }
}
