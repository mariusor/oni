'use strict';

this.Element && function (a) {
    a.matchesSelector = a.matchesSelector || a.mozMatchesSelector || a.msMatchesSelector || a.oMatchesSelector || a.webkitMatchesSelector || function (b) {
        let c = this, e = (c.parentNode || c.document).querySelectorAll(b), f = -1;
        for (; e[++f] && e[f] != c;) ;
        return !!e[f]
    }, a.matches = a.matches || a.matchesSelector
}(Element.prototype);
this.Element && function (a) {
    a.closest = a.closest || function (b) {
        let c = this;
        for (; c.matches && !c.matches(b);) c = c.parentNode;
        return c.matches ? c : null
    }
}(Element.prototype);
let addEvent = function (a, b, c) {
    a.attachEvent ? a.attachEvent('on' + b, c) : a.addEventListener(b, c)
};
let removeEvent = function (a, b, c) {
    a.detachEvent ? a.detachEvent('on' + b, c) : a.removeEventListener(b, c)
};
let OnReady = function (a) {
    'loading' == document.readyState ? document.addEventListener && document.addEventListener('DOMContentLoaded', a) : a.call()
};
let $ = function (a, b) {
    return (b || document).querySelectorAll(a)
};
let $frag = function (html) {
    let frag = document.createDocumentFragment();
    let tmp = document.createElement('body');
    let child;

    tmp.innerHTML = html;
    while (child = tmp.firstChild) {
        frag.appendChild(child);
    }
    return frag;
};

function loadImage(url) {
    return new Promise(r => { let i = new Image(); i.onload = (() => r(i)); i.src = url; });
}

async function getAverageImageRGB(url) {
    let blockSize = 5, // only visit every 5 pixels
        i = -4,
        rgb = {r:0, g:0, b:0},
        count = 0, data;

    let canvas = document.createElement('canvas');
    let context = canvas.getContext('2d');
    let img = await loadImage(url);

    canvas.width = img.width;
    canvas.height = img.height;
    context.drawImage(img, 0, 0 );

    try {
        data = context.getImageData(0, 0, img.width, img.height);
    } catch (e) {
        console.error(`failed: ${e}`);
        return rgb;
    }

    const length = data.data.length;
    while ( (i += blockSize * 4) < length ) {
        ++count;
        rgb.r += data.data[i];
        rgb.g += data.data[i+1];
        rgb.b += data.data[i+2];
    }

    // ~~ used to floor values
    rgb.r = ~~(rgb.r/count);
    rgb.g = ~~(rgb.g/count);
    rgb.b = ~~(rgb.b/count);

    return rgb;
};

OnReady(function() {
    const $html = $("html")[0];
    const $body = document.body;

    function showErrors(parent) {
        return (object) => {
            const errors = document.createElement('div');
            const err = (err) => {
                const error = document.createElement('p');
                error.textContent = `${err.status}: ${err.message}`;
                errors.appendChild(error);
            }
            if (Array.isArray(object.errors)) {
                object.errors.forEach(err);
            } else {
                err(object.errors);
            }
            (parent || $body).appendChild(errors);
        }
    }

    function rgb(rgb) {
        return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    }

    function rgba(rgb, a) {
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
    }

    function brightness(rgb) {
        //return ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
        // from https://www.nbdtech.com/Blog/archive/2008/04/27/Calculating-the-Perceived-Brightness-of-a-Color.aspx
        return 255-Math.sqrt(
            (rgb.r * rgb.r * .241 +
            rgb.g * rgb.g * .691 +
            rgb.b * rgb.b * .068)
        );
    }

    function getColorScheme(bri) {
        let scheme;
        if (Math.abs(bri - 120) < 75) {
            if (bri >= 130) {
                scheme = 'dark';
            } else {
                scheme = 'light';
            }
        } else if (bri > 120) {
            scheme = 'dark';
        } else {
            scheme = 'light';
        }
        return scheme;
    }

    function imgFromUrl(url) {
        const img = document.createElement('img');
        img.src = url;
        return img
    }

    function buildPerson(it, parent) {
        const object = document.createElement('main');
        if (typeof it.type != 'undefined') {
            object.className = it.type.toLowerCase();
        }

        let details = document.createElement('article');
        details.className = 'details';
        if (typeof it.image != 'undefined') {
            let imageSrc;
            if (typeof it.image == 'object') {
                imageSrc = it.image.url;
            }
            if (typeof it.image == 'string') {
                imageSrc = it.image;
            }
            getAverageImageRGB(imageSrc).then(value => {
                console.debug(`avg rgb: ${rgb(value)}`, value);
                details.style.backgroundImage = `linear-gradient(${rgba(value, 0)}, ${rgba(value, 1)}), url(${imageSrc})`;
                $body.style.backgroundColor = rgb(value);

                const bri = brightness(value)
                //console.debug(bri);
                $html.style.colorScheme = getColorScheme(bri);
                $body.style.backgroundColor = rgb(value);

                localStorage.setItem('colorScheme', $html.style.colorScheme);
                localStorage.setItem('backgroundColor', $body.style.backgroundColor);
            })
        }

        if (typeof it.icon != 'undefined') {
            let iconSrc;
            if (typeof it.icon == 'object') {
                iconSrc = it.icon.url;
            }
            if (typeof it.icon == 'string') {
                iconSrc = it.icon;
            }
            const icon = imgFromUrl(iconSrc);
            icon.className = "icon";
            details.appendChild(icon);
        }

        if (typeof it.preferredUsername != 'undefined') {
            const nameElement = document.createElement('h2');
            nameElement.textContent = it.preferredUsername;
            details.appendChild(nameElement);

            $html.querySelector("title").textContent += `: ${it.preferredUsername}`;
        }

        if (typeof it.summary != 'undefined') {
            const summaryElement = document.createElement('span');
            summaryElement.append($frag(it.summary));
            details.appendChild(summaryElement);
        }

        if (typeof it.url != 'undefined') {
            let aliasBox = document.createElement('div');

            if (Array.isArray(it.url)) {
                let aliases = document.createElement('ul');
                aliases.style.display = 'inline';
                it.url.forEach((url) => {
                    let alias = document.createElement('li');
                    let link = document.createElement('a');
                    link.textContent = url
                    link.href = url;
                    link.style.display = 'inline';
                    alias.appendChild(link);
                    aliases.appendChild(alias);
                });
                aliasBox.appendChild(aliases);
            } else {
                let alias = document.createElement('a');
                alias.href = it.url;
                aliasBox.appendChild(alias);
            }
            details.appendChild(aliasBox);
        }
        object.appendChild(details);

        if (typeof it.content != 'undefined') {
            const contentElement = document.createElement('article');
            contentElement.className = "content";
            contentElement.append($frag(it.content));
            object.appendChild(contentElement);
        }

        const collectionsBox = document.createElement('nav');
        const collectionsElement = document.createElement('ul');
        if (typeof it.inbox != 'undefined') {
            // TODO(marius): this needs to be shown only when authenticated as the Actor
            const inboxLinkElement = document.createElement('a');
            inboxLinkElement.href = it.inbox;
            inboxLinkElement.textContent = "Inbox";

            const inboxElement = document.createElement('li');
            inboxElement.appendChild(inboxLinkElement)

            collectionsElement.appendChild(inboxElement);
        }

        if (typeof it.outbox != 'undefined') {
            const outboxLinkElement = document.createElement('a');
            outboxLinkElement.href = it.outbox;
            outboxLinkElement.textContent = "Outbox";

            const outboxElement = document.createElement('li');
            outboxElement.appendChild(outboxLinkElement)

            collectionsElement.appendChild(outboxElement);
        }
        if (typeof it.followers != 'undefined') {
            const followersLinkElement = document.createElement('a');
            followersLinkElement.href = it.followers;
            followersLinkElement.textContent = "Followers";

            const followersElement = document.createElement('li');
            followersElement.appendChild(followersLinkElement)

            collectionsElement.appendChild(followersElement);
        }
        if (typeof it.following != 'undefined') {
            const followingLinkElement = document.createElement('a');
            followingLinkElement.href = it.following;
            followingLinkElement.textContent = "Following";

            const followingElement = document.createElement('li');
            followingElement.appendChild(followingLinkElement)

            collectionsElement.appendChild(followingElement);
        }
        if (collectionsElement.hasChildNodes()) {
            collectionsBox.appendChild(collectionsElement);
            details.appendChild(collectionsBox);
        }
        (parent || $body).appendChild(object);
    }

    function buildCollection(it, parent) {
        let tag = 'ul';
        let items;
        if (it.type == 'OrderedCollection' || it.type == 'OrderedCollectionPage') {
            tag = 'ol';
            items = it.orderedItems;
        } else {
            items = it.items;
        }
        const object = document.createElement(tag);
        items.forEach(function (it, index) {
            if (typeof it.type == 'undefined') {
                console.error(`collection object at index ${index} is not a valid ActivityPub object`, it);
                return;
            }
            const el = document.createElement('li');
            buildActivityPubElement(it, el)

            object.appendChild(el);
        });
        (parent || $body).appendChild(object);
    }

    function fetchIRI (iri, parent) {
        const headers = {'Accept': 'application/activity+json'};
        fetch(iri, { headers })
            .then((response) => {
                if (!response.ok) {
                    response.json().then(showErrors(parent)).catch(console.error);
                    return;
                }
                response.json().then(renderActivityPubObject(parent));
            })
            .catch((e) => {
                const error = document.createElement('p');
                error.textContent = `${e}: ${iri}`;
                (parent || $body).appendChild(error);
            });
    }

    function buildObject(it, parent) {
        if(typeof it == 'string') {
            fetchIRI(it, parent)
            return;
        }
        let tagName = 'div';
        let object;
        switch (it.type) {
            case 'Image':
                object = imgFromUrl(it.id);
                object.style.width = '100px';
                break;
            case 'Video':
                tagName = 'video';
                object = document.createElement(tagName);
                object.style.width = '100px';
                break;
            case 'Audio':
                tagName = 'audio';
                object = document.createElement(tagName);
                object.style.width = '100px';
                break;
            case 'Article':
            case 'Note':
                tagName = 'article'
                object = document.createElement(tagName);
                object.className = "content";
                object.append($frag(it.content));
        }

        (parent || $body).appendChild(object);
    }

    const emptyObject = (s, parent) => {
        const err = document.createElement('span');
        if (s) {
            err.textContent = s;
        }
        (parent || $body).appendChild(err);
        return err;
    }

    function buildCreate(it, parent) {
        if (typeof it.object == 'undefined') {
            return emptyObject('invalid object property on activity', parent);
        }
        return buildObject(it.object, parent);
    }

    function buildActivityPubElement(it, parent) {
        console.log(it);

        switch (it.type) {
            case "Create":
                return buildCreate(it, parent);
            case 'Person':
                return buildPerson(it, parent)
            case 'OrderedCollection', 'OrderedCollectionPage':
                return buildCollection(it, parent)
            default:
                return buildObject(it, parent);
        }
    }

    function renderActivityPubObject(parent) {
        return (object) => buildActivityPubElement(object, parent);
    }
    /*
    const $footer = $frag(
        `<footer>Fediverse presence brought to you by <a href="https://git.sr.ht/~mariusor/oni">ONI</a></footer>`
    );
     */

    const colorScheme = localStorage.getItem('colorScheme');
    if (colorScheme) {
        $html.style.colorScheme = colorScheme;
    }
    const backgroundColor = localStorage.getItem('backgroundColor');
    if (backgroundColor) {
        $body.style.backgroundColor = backgroundColor;
    }
    fetchIRI(window.location.href, $body);
});
