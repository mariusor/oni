import {ActivityPubItem} from "./activity-pub-item";
import {AuthController} from "./auth-controller";
import {formUrlEncode} from "./utils";

export async function fetchActivityPubIRI(iri) {
    const auth = new AuthController(null);
    if (typeof iri !== 'string') return new Promise((resolve, reject) => reject('invalid URL passed to function'));

    const proxyUrlFetch = new Promise((resolve, reject) => {
        console.debug(`proxyUrl ${isLocalIRI(iri) ? 'local' : 'remote'} IRI `, iri);

        const headers = {
            'Origin' : 'https://'+window.location.hostname,
            'Content-Type': 'application/x-www-form-urlencoded',
        };

        const proxyUrl = `https://${window.location.hostname}/proxyUrl`

        const req = {
            headers: headers,
            method: "POST",
            body: formUrlEncode({"id": iri})
        };

        return fetch(proxyUrl, req).then(response => {
            if (response.hasOwnProperty("headers") && response.headers["Content-Type"] !== jsonLDContentType) {
                reject(`invalid response Content-Type ${response.headers["Content-Type"]}`);
                return;
            }
            if (response.status !== 200) {
                reject(`Invalid status received ${response.statusText}`);
            } else {
                response.json().then(v => resolve(new ActivityPubItem(v))).catch(e => reject(e));
            }
        }).catch(e => reject(e))
    });

    return new Promise((resolve, reject) => {
        let headers = fetchHeaders;
        if (isLocalIRI(iri)) {
            auth.addHeader(headers);
        } else {
            // generate HTTP-signature for the actor
        }
        headers["Origin"] = 'https://'+window.location.hostname;
        console.debug(`fetching ${isLocalIRI(iri) ? 'local' : 'remote'} IRI `, iri);
        const opts = {
            headers: headers,
        };
        fetch(iri, opts).then(response => {
            if (response.hasOwnProperty("headers") && response.headers["Content-Type"] !== jsonLDContentType) {
                reject(`invalid response Content-Type ${response.headers["Content-Type"]}`);
                return;
            }
            if (response.status === 200) {
                response.json().then(v => resolve(new ActivityPubItem(v))).catch(e => reject(e));
            }
            if (response.status === 400 || response.status === 401 || response.status === 403) {
                proxyUrlFetch(resolve, reject)
                return;
            }
            reject(`Invalid status received ${response.status}: ${response.statusText}`)
        }).catch(e => reject(e))
    });
}

const jsonLDContentType = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"';
const fetchHeaders = {Accept: jsonLDContentType};

export function isLocalIRI(iri) {
    if (typeof iri !== 'string') {
        return false;
    }
    return iri.indexOf(window.location.hostname) >= 0;
}


