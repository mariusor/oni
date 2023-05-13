import {ActivityPubObject} from "./activity-pub-object";
import {ActivityPubNote} from "./activity-pub-note";
import {css, html, nothing} from "lit";
import {renderDuration, renderTimestamp} from "./utils";

export class ActivityPubEvent extends ActivityPubNote {
    static styles = [
        css`
        dl {
            padding-left: 2em;
        }
        dl dt { font-size: .9em; }
        dl dd { margin: auto; margin-right: 2em; }
        dl dt, dl dd {
            display: inline-block;
        }
        `,
        ActivityPubObject.styles
    ];

    constructor(it) {
        super(it);
    }

    render() {
        const name = this.it.getName().length > 0 ? html`<h1>${this.renderName()}</h1>` : nothing;
        const summary = this.it.getSummary().length > 0 ? html`<h2>${this.renderSummary()}</h2>` : nothing;
        const header = this.it.getName().length+this.it.getSummary().length > 0 ? html`<header>${name}${summary}</header>` : nothing;

        const startTime = renderTimestamp(this.it.getStartTime(), false);
        const endTime = renderTimestamp(this.it.getEndTime(), false);
        const duration = (this.it.getEndTime() - this.it.getStartTime()) / 1000;

        return html`<article>
            ${header}
            <dl>
                <dt>Start time:</dt> <dd><strong>${startTime}</strong></dd>
                <dt>End time:</dt> <dd><strong>${endTime}</strong></dd>
            </dl>
            <!-- <aside>Duration <strong>${renderDuration(duration)}</strong></aside> -->
            ${this.renderContent()}
            <aside>${this.renderAttachment()}</aside>
        </article>
        <footer>${this.renderMetadata()}</footer>`;
    }
}
