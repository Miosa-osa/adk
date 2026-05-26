# Publishing `miosa-adk`

The Python ADK publishes to PyPI through GitHub Actions trusted publishing.
No PyPI API token is required.

## PyPI Pending Publisher

For the first release, add this pending publisher from your PyPI account:

```text
PyPI Project Name: miosa-adk
Owner: Miosa-osa
Repository name: adk
Workflow name: publish-python.yml
Environment name: pypi
```

`Owner` is the GitHub repository owner, not a PyPI organization.

## Release

1. Bump `version` in `python/pyproject.toml`.
2. Push the change to `main`.
3. Run the `Publish Python ADK` workflow manually, or push a tag:

```bash
git tag python-v0.1.0
git push origin python-v0.1.0
```

The workflow runs ruff, mypy, compileall, builds wheel/sdist, and publishes
`python/dist/*` to PyPI using OIDC.
