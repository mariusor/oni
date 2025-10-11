export const LinkTypes = ['Mention'];
export const ObjectTypes = ['Image', 'Audio', 'Video', 'Note', 'Article', 'Page', 'Document', 'Tombstone', 'Event', ''];
export const ActorTypes = ['Person', 'Group', 'Application', 'Service'];
export const ActivityTypes = ['Create', 'Update', 'Delete', 'Like', 'Dislike', 'Undo', 'Announce', 'Accept', 'Reject', 'TentativeAccept', 'TentativeReject', 'Follow', 'Block', 'Ignore'];
export const CollectionTypes = ['Collection', 'CollectionPage', 'OrderedCollection', 'OrderedCollectionPage'];

//const itemProperties = ['icon', 'image', 'actor', 'attachment', 'audience', 'attributedTo', 'context', 'generator', 'inReplyTo', 'location', 'preview', 'target', 'result', 'origin', 'instrument', 'object'];

const linkProperties = ['id', 'type', 'name', 'rel', 'href', 'mediaType', 'height', 'width', 'preview', 'hrefLang'];
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
        if (LinkTypes.indexOf(this.type) >= 0) {
            linkProperties.forEach(setPropIfExists)
        }
    }

    iri() {
        return this.id;
    }

    getType() {
        return this.type;
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

    getInReplyTo() {
        if (!this.hasOwnProperty('inReplyTo')) {
            this.inReplyTo = null;
        }
        return this.inReplyTo;
    }

    getAttributedTo() {
        if (!this.hasOwnProperty('attributedTo')) {
            this.attributedTo = null;
        }
        return this.attributedTo;
    }

    getObject() {
        if (!this.hasOwnProperty('object')) {
            this.object = null;
        }
        return this.object;
    }

    getActor() {
        if (!this.hasOwnProperty('actor')) {
            this.actor = null;
        }
        return this.actor;
    }

    getAttachment() {
        if (!this.hasOwnProperty('attachment')) {
            this.attachment = null;
        }
        return this.attachment;
    }

    getShares() {
        if (!this.hasOwnProperty('shares')) {
            this.shares = null;
        }
        return this.shares;
    }

    getLikes() {
        if (!this.hasOwnProperty('likes')) {
            this.likes = null;
        }
        return this.likes;
    }

    getReplies() {
        if (!this.hasOwnProperty('replies')) {
            this.replies = null;
        }
        return this.replies;
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
        if (!Array.isArray(this.name)) {
            this.name = [this.name];
        }
        return this.name;
    }

    getSummary() {
        if (!this.hasOwnProperty('summary')) {
            this.summary = [];
        }
        if (!Array.isArray(this.summary)) {
            this.summary = [this.summary];
        }
        return this.summary;
    }

    getContent() {
        if (!this.hasOwnProperty('content')) {
            this.content = [];
        }
        if (!Array.isArray(this.content)) {
            this.content = [this.content];
        }
        return this.content;
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
        return items
    }

    getTotalItems() {
        if (!this.hasOwnProperty('totalItems')) {
            return this.totalItems = 0;
        }
        return this.totalItems;
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
        if (Array.isArray(it)) {
            return it.map(data => ActivityPubItem.load(data));
        } else if (typeof it === "object") {
            return new ActivityPubItem(it);
        }
        return it;
    }

    static isValid(it) {
        return !!(it) && typeof it === 'object' && it.hasOwnProperty('id') && it.hasOwnProperty('type');
    }
}

export function getHref (it) {
    if (typeof it === 'string' && URL.canParse(it)) return it;
    const first = (val) => {
        if (Array.isArray(val) && val.length > 1) {
            return val[0];
        }
        return val;
    }
    if (Array.isArray(it)) {
        return first(it);
    }
    let url;
    if (typeof it === 'object') {
        if (it.hasOwnProperty('url')) {
            url = first(it.url);
            if (url.length > 0) return url;
        }
        if (it.hasOwnProperty('href')) {
            url = first(it.href);
            if (url.length > 0) return url;
        }
        if (it.hasOwnProperty('id')) {
            url = it.id;
        }
    }
    return url;
}
