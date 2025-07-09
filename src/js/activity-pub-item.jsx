import {fetchActivityPubIRI} from "./client";

export const ObjectTypes = ['Image', 'Audio', 'Video', 'Note', 'Article', 'Page', 'Document', 'Tombstone', 'Event', 'Mention', ''];
export const ActorTypes = ['Person', 'Group', 'Application', 'Service'];
export const ActivityTypes = ['Create', 'Update', 'Delete', 'Accept', 'Reject', 'TentativeAccept', 'TentativeReject', 'Follow', 'Block', 'Ignore'];
export const CollectionTypes = ['Collection', 'CollectionPage', 'OrderedCollection', 'OrderedCollectionPage'];

//const itemProperties = ['icon', 'image', 'actor', 'attachment', 'audience', 'attributedTo', 'context', 'generator', 'inReplyTo', 'location', 'preview', 'target', 'result', 'origin', 'instrument', 'object'];

const objectProperties = ['id', 'type', 'icon', 'image', 'summary', 'name', 'content', 'attachment', 'audience', 'attributedTo', 'context', 'mediaType', 'endTime', 'generator', 'inReplyTo', 'location', 'preview', 'published', 'updated', 'startTime', 'tag', 'to', 'bto', 'cc', 'bcc', 'duration', 'source', 'url', 'replies', 'likes', 'shares'];
const tombstoneProperties = ['deleted', 'formerType'];
const actorProperties = ['preferredUsername', 'publicKey', 'endpoints', 'streams', 'inbox', 'outbox', 'liked', 'shared', 'followers', 'following'];
const activityProperties = ['actor', 'target', 'result', 'origin', 'instrument', 'object'];
const collectionProperties = ['items', 'orderedItems', 'totalItems', 'first', 'last', 'current', 'partOf', 'next', 'prev'];

export class ActivityPubItem {
    id = '';
    type = '';

    constructor(it) {
        if (typeof it === 'string') {
            this.id = it;
            return;
        }
        this.loadFromObject(it);
        return this;
    }

    setProp (k, v) {
        this[k] = v;
    }

    loadFromObject(it) {
        const setPropIfExists = (p) => {
            if (!it.hasOwnProperty(p)) return;
            this.setProp(p, it[p]);
        };
        objectProperties.forEach(setPropIfExists);
        if (this.type === 'Tombstone') {
            tombstoneProperties.forEach(setPropIfExists);
        }
        if (ActorTypes.indexOf(this.type) >= 0) {
            actorProperties.forEach(setPropIfExists);
        }
        if (ActivityTypes.indexOf(this.type) >= 0) {
            activityProperties.forEach(setPropIfExists);
        }
        if (CollectionTypes.indexOf(this.type) >= 0) {
            collectionProperties.forEach(setPropIfExists);
        }
    }

    iri() {
        return this.id;
    }

    getUrl() {
        if (!this.hasOwnProperty('url')) {
            this.url = null;
        }
        return this.url;
    }

    getTag() {
        if (!this.hasOwnProperty('tag')) {
            this.tag = null;
        }
        return this.tag;
    }

    getAttachment() {
        if (!this.hasOwnProperty('attachment')) {
            this.attachment = null;
        }
        return this.attachment;
    }

    getInbox() {
        if (!this.hasOwnProperty('inbox')) {
            this.inbox = null;
        }
        return this.inbox;
    }

    getOutbox() {
        if (!this.hasOwnProperty('outbox')) {
            this.outbox = null;
        }
        return this.outbox;
    }

    getLiked() {
        if (!this.hasOwnProperty('liked')) {
            this.liked = null;
        }
        return this.liked;
    }

    getLikes() {
        if (!this.hasOwnProperty('likes')) {
            this.likes = null;
        }
        return this.likes;
    }

    getFollowers() {
        if (!this.hasOwnProperty('followers')) {
            this.followers = null;
        }
        return this.followers;
    }

    getFollowing() {
        if (!this.hasOwnProperty('following')) {
            this.following = null;
        }
        return this.following;
    }

    getDeleted() {
        if (!this.hasOwnProperty('deleted')) {
            this.deleted = null;
        } else {
            const d = new Date();
            d.setTime(Date.parse(this.deleted));
            this.deleted = d;
        }
        return this.deleted;
    }

    getRecipients() {
        let recipients = [];
        if (this.hasOwnProperty('to')) {
            recipients = recipients.concat(this.to);
        }
        if (this.hasOwnProperty('cc')) {
            recipients = recipients.concat(this.cc);
        }
        if (this.hasOwnProperty('bto')) {
            recipients = recipients.concat(this.bto);
        }
        if (this.hasOwnProperty('bcc')) {
            recipients = recipients.concat(this.bcc);
        }
        if (this.hasOwnProperty('audience')) {
            recipients = recipients.concat(this.audience);
        }
        return recipients.flat()
            .filter((value, index, array) => array.indexOf(value) === index);
    }

    getStartTime() {
        if (!this.hasOwnProperty('startTime')) {
            return null;
        }
        const d = new Date();
        d.setTime(Date.parse(this.startTime));
        return d || null;
    }

    getEndTime() {
        if (!this.hasOwnProperty('endTime')) {
            return null;
        }
        const d = new Date();
        d.setTime(Date.parse(this.endTime));
        return d || null;
    }

    getPublished() {
        if (!this.hasOwnProperty('published')) {
            return null;
        }
        const d = new Date();
        d.setTime(Date.parse(this.published));
        return d || null;
    }

    getUpdated() {
        if (!this.hasOwnProperty('updated')) {
            return null;
        }
        const d = new Date();
        d.setTime(Date.parse(this.updated));
        return d || null;
    }

    getName() {
        if (!this.hasOwnProperty('name')) {
            this.name = [];
        }
        let s = this.name;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    getSummary() {
        if (!this.hasOwnProperty('summary')) {
            this.summary = [];
        }
        let s = this.summary;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    getContent() {
        if (!this.hasOwnProperty('content')) {
            this.content = [];
        }
        let s = this.content;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    getIcon() {
        if (!this.hasOwnProperty('icon')) {
            this.icon = null;
        }
        return this.icon;
    }

    getImage() {
        if (!this.hasOwnProperty('image')) {
            this.image = null;
        }
        return this.image;
    }

    getPreferredUsername() {
        if (!this.hasOwnProperty('preferredUsername')) {
            this.preferredUsername = [];
        }
        let s = this.preferredUsername;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    getItems() {
        let items = [];
        if (this.type.toLowerCase().includes('ordered') && this.hasOwnProperty('orderedItems')) {
            items = this['orderedItems'];
        } else if (this.hasOwnProperty('items')) {
            items = this['items'];
        }
        return items.sort(sortByPublished);
    }

    getEndPoints() {
        if (!this.hasOwnProperty('endpoints')) {
            return this.endpoints = {};
        }
        return this.endpoints;
    }

    getNext() {
        if (!this.hasOwnProperty('next')) {
            return this.next = {};
        }
        return this.next;
    }

    getPrev() {
        if (!this.hasOwnProperty('prev')) {
            return this.prev = {};
        }
        return this.prev;
    }

    static load(it) {
        if (typeof it === 'string') {
            if (!URL.canParse(it)) {
                try {
                    it = JSON.parse(it);
                } catch (e) {
                    console.warn('unable to parse JSON', e)
                }
            }
        }
        if (typeof it === "object") {
            return new this(it);
        }
        return it;
    }

    static isValid(it) {
        return typeof it === 'object' && it !== null && it.hasOwnProperty('id') && it.hasOwnProperty('type') && it.id !== '' && it.type !== '';
    }
}

function sortByPublished(a, b) {
    const aHas = a.hasOwnProperty('published');
    const bHas = b.hasOwnProperty('published');
    if (!aHas && !bHas) {
        return (a.id <= b.id) ? 1 : -1;
    }
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return Date.parse(b.published) - Date.parse(a.published);
}
