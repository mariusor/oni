package oni

import (
	"bytes"
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/rsa"
	"io"
	"net/http"
	"time"

	"git.sr.ht/~mariusor/lw"
	"github.com/go-ap/errors"
	"github.com/go-fed/httpsig"
)

var (
	digestAlgorithm     = httpsig.DigestSha256
	headersToSign       = []string{httpsig.RequestTarget, "Host", "Date"}
	signatureExpiration = int64(time.Hour.Seconds())
)

type signer struct {
	signers map[httpsig.Algorithm]httpsig.Signer
	logger  lw.Logger
}

func (s signer) SignRequest(pKey crypto.PrivateKey, pubKeyId string, r *http.Request, body []byte) error {
	algs := make([]string, 0)
	for a, v := range s.signers {
		algs = append(algs, string(a))
		if err := v.SignRequest(pKey, pubKeyId, r, body); err == nil {
			return nil
		} else {
			s.logger.Errorf("invalid signer algo %s:%T %+s", a, v, err)
		}
	}
	return errors.Newf("no suitable request signer for public key[%T] %s, tried %+v", pKey, pubKeyId, algs)
}

func newSigner(pubKey crypto.PrivateKey, headers []string, l lw.Logger) (signer, error) {
	s := signer{logger: l}
	s.signers = make(map[httpsig.Algorithm]httpsig.Signer, 0)

	algos := make([]httpsig.Algorithm, 0)
	switch pubKey.(type) {
	case *rsa.PrivateKey:
		algos = append(algos, httpsig.RSA_SHA256, httpsig.RSA_SHA512)
	case *ecdsa.PrivateKey:
		algos = append(algos, httpsig.ECDSA_SHA512, httpsig.ECDSA_SHA256)
	case ed25519.PrivateKey:
		algos = append(algos, httpsig.ED25519)
	}
	for _, alg := range algos {
		sig, alg, err := httpsig.NewSigner([]httpsig.Algorithm{alg}, digestAlgorithm, headers, httpsig.Signature, signatureExpiration)
		if err == nil {
			s.signers[alg] = sig
		}
	}
	return s, nil
}

func s2sSignFn(o oni) func(r *http.Request) error {
	s, err := newSigner(prvKey, append(headersToSign, "Digest"), o.l)
	if err != nil {
		return func(r *http.Request) error {
			return errors.Annotatef(err, "unable to initialize HTTP signer")
		}
	}
	// NOTE(marius): this is needed to accommodate for the FedBOX service user which usually resides
	// at the root of a domain, and it might miss a valid path. This trips the parsing of keys with id
	// of form https://example.com#main-key
	u, _ := o.a.ID.URL()
	if u.Path == "" {
		u.Path = "/"
	}
	u.Fragment = "main-key"
	keyId := u.String()
	return func(r *http.Request) error {
		bodyBuf := bytes.Buffer{}
		if r.Body != nil {
			if _, err := io.Copy(&bodyBuf, r.Body); err == nil {
				r.Body = io.NopCloser(&bodyBuf)
			}
		}
		return s.SignRequest(prvKey, keyId, r, bodyBuf.Bytes())
	}
}