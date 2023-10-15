import {html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {isLocalIRI} from "./utils";

export class ActivityPubActor extends ActivityPubObject {
    static styles = ActivityPubObject.styles;

    constructor(it) {
        super(it);
    }

    renderIcon() {
        const icon = this.it.getIcon();
        if (!icon) {
            return nothing;
        }
        if (typeof icon == 'string') {
            return html`<img src=${icon} alt="icon"/>`;
        } else {
            return ActivityPubObject.renderByMediaType(icon, this.inline);
        }
    }

    renderIconName() {
            let username = this.it.getPreferredUsername();
            const iri = this.it.iri();
            if (!isLocalIRI(iri)) {
                username = `${username}@${new URL(iri).hostname}`
            }
            return html`
                <a href=${iri}> ${this.renderIcon()} ${username}</a>
            `;
    }

    renderUrl() {
        let url = this.it.getUrl();
        if (!url) return nothing;
        if (!Array.isArray(url)) url = [url];

        return html`
            <ul>
                ${url.map((u) => html`
                    <li><a target="external" rel="me noopener noreferrer nofollow" href=${u}>
                        <oni-icon name="external-href"></oni-icon>
                        ${u}</a></li>`)}
            </ul>`;
    }

    renderPreferredUsername() {
        if (this.it.getPreferredUsername().length === 0) {
            return nothing;
        }
        return html`<oni-natural-language-values it=${JSON.stringify(this.preferredUsername())}></oni-natural-language-values>`;
    }

    render() {
        return html`${this.renderIconName()}`;
    }
}
