import {ActivityPubItem} from "./activity-pub-item";
import {AuthController} from "./auth-controller";
import {formUrlEncode} from "./utils";

export async function fetchActivityPubIRI(iri) {
    const auth = new AuthController(null);
    if (typeof iri !== 'string') return new Promise((resolve, reject) => reject('invalid URL passed to function'));

    const proxyUrlRequest = (headers) => {
        console.debug(`proxyUrl ${isLocalIRI(iri) ? 'local' : 'remote'} IRI `, iri);

        headers['Content-Type']= 'application/x-www-form-urlencoded';
        return {
            headers: headers,
            method: "POST",
            body: formUrlEncode({"id": iri})
        };
    };

    return new Promise((resolve, reject) => {
        let headers = fetchHeaders;
        if (isLocalIRI(iri)) {
            auth.addHeader(headers);
        }

        headers["Origin"] = 'https://'+window.location.hostname;
        console.debug(`fetching ${isLocalIRI(iri) ? 'local' : 'remote'} IRI `, iri);
        const opts = {headers: headers};

        const proxyUrlPromise = () => {
            if (isLocalIRI(iri)) {
                reject(`not trying to proxy local IRI ${iri}`);
                return;
            }
            return fetch(`https://${window.location.hostname}/proxyUrl`, proxyUrlRequest(headers)).then(response => {
                if (response.status === 200) {
                    response.json().then(v => resolve(new ActivityPubItem(v)));
                } else {
                    reject(`Invalid status received ${response.status}: ${response.statusText}`);jj
                }
            }).catch(e => reject(e));
        }
        fetch(iri, opts).then(response => {
            if (response.hasOwnProperty("headers") && response.headers["Content-Type"] !== jsonLDContentType) {
                reject(`invalid response Content-Type ${response.headers["Content-Type"]}`);
            }
            if (response.status === 200) {
                response.json().then(v => resolve(new ActivityPubItem(v)));
            } else if (auth.authorized && !isLocalIRI(iri) && (response.status === 400 || response.status === 401 || response.status === 403)) {
                proxyUrlPromise();
            } else {
                reject(`Invalid status received ${response.status}: ${response.statusText}`)
            }
        }).catch(e => proxyUrlPromise())
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


