# unocode

Uno is a coding agent for the terminal. It reads your project, edits files and runs commands, asking before it changes anything. Shell commands run in a sandbox that cannot write outside the project, read your secrets or reach the network. Spending has a hard cap, and every file change can be undone.

Documentation: **https://unocode.motiontic.com**

This repository holds the releases and the documentation site. The source is not public.

## Install

```bash
curl -fsSL https://unocode.motiontic.com/install.sh | sh
```

```bash
brew install motiontic/tap/uno
```

```bash
npm i -g @motiontic/uno
```

macOS and Linux, on arm64 and x86_64. Then run `uno` in a project folder.

`install.sh` puts `uno` in `~/.local/bin` (set `UNO_INSTALL_DIR` to change that, or `UNO_VERSION` to pick a version) and checks the download against the release's `SHA256SUMS`, and against its signature when [minisign](https://jedisct1.github.io/minisign/) is installed.

## Update

- Installed with `install.sh`: `uno update`
- Homebrew: `brew upgrade uno`
- npm: `npm i -g @motiontic/uno`

## Check a download yourself

Each program file has a minisign signature beside it. The public key is in [minisign.pub](minisign.pub):

```bash
minisign -V -p minisign.pub -m uno-aarch64-apple-darwin
```

## Licence

Free to use; see [LICENSE](LICENSE).
