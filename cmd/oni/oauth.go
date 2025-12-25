package main

import (
	"fmt"

	"github.com/go-ap/errors"
)

type OAuth2 struct {
	Token Token `cmd:"" name:"token" description:"OAuth2 authorization token management"`
}

type Token struct {
	Add Add `cmd:"" description:"Adds an OAuth2 authorization token" alias:"new"`
}

type Add struct {
	For string `required:"" description:"Which ONI root actor to create the authorization token for."`
}

func (a Add) Run(c *Control) error {
	clientID := a.For
	if clientID == "" {
		return errors.Newf("Need to provide the root actor URL")
	}

	actor := clientID
	tok, err := c.GenAccessToken(clientID, actor, nil)
	if err == nil {
		fmt.Printf("Authorization: Bearer %s\n", tok)
	}
	return err
}
