## Container images

We are building container images for ONI that can be found at [quay.io](https://quay.io/go-ap/oni).

The containers are built based on the run environment type: `prod`, `qa` or `dev`:
  * `dev` images are built with all debugging information and logging context possible, built for every push.
  * `qa` images are built by stripping the binaries of unneeded elements. Less debugging and logging,
also built every push.
  * `prod` images are similar to `qa` ones but are created only when a tagged version of the project is released.

To run a container based on these images, you can use podman:

```sh
# /var/cache/oni must be a valid directory file as shown in the INSTALL document.
$ podman run --network=host --name=ONI -v /var/cache/oni:/storage quay.io/go-ap/oni:latest
```

### Running onictl commands in the containers

```sh
# running with the same configuration environment as above
$ podman exec ONI onictl reload
```

