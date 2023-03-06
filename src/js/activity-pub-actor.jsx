import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {isLocalIRI} from "./utils";

export const ActorTypes = ['Person', 'Group', 'Application', 'Service'];

export class ActivityPubActor extends ActivityPubObject {
    static styles = css`
        :host { }
    `;
    static properties = {
        it: {type: Object},
    };

    constructor(it) {
        super(it);
    }

    preferredUsername() {
        return [this.it.preferredUsername || []];
    }

    renderIcon() {
        const icon = this.icon();
        if (!icon) {
            return nothing;
        }
        if (typeof icon == 'string') {
            return html`<img src=${icon}/>`;
        } else {
            return ActivityPubObject.renderByMediaType(icon);
        }
    }

    renderIconName() {
            let username = this.preferredUsername();
            if (!isLocalIRI(this.iri())) {
                username = `${username}@${new URL(this.iri()).hostname}`
            }
            return html`
                <a href=${this.iri()}> ${this.renderIcon()} ${username}</a>
            `;
    }

    renderUrl() {
        let url = this.url();
        if (!url) {
            return nothing;
        }
        if (!Array.isArray(url)) {
            url = [url];
        }
        return html`
            <ul>
                ${url.map((u) => html`
                    <li><a target="external" rel="me noopener noreferrer nofollow" href=${u}>
                        <oni-icon name="external-href"></oni-icon>
                        ${u}</a></li>`)}
            </ul>`;
    }

    renderPreferredUsername() {
        if (this.preferredUsername().length == 0) {
            return nothing;
        }
        return html`<oni-natural-language-values it=${JSON.stringify(this.preferredUsername())}></oni-natural-language-values>`;
    }

    render() {
        return html`<div> ${this.renderIconName()}</div>`;
    }
}
