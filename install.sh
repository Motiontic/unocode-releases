#!/bin/sh
# Installs uno, the unocode coding agent, on macOS or Linux.
#
#   curl -fsSL https://unocode.motiontic.com/install.sh | sh
#
# UNO_VERSION=0.2.0     install that version instead of the latest
# UNO_INSTALL_DIR=dir   install there instead of ~/.local/bin
#
# The download is checked against the release's SHA256SUMS, and against its signature too
# when minisign is installed. Afterwards `uno update` keeps it current.
#
# Everything is inside main, called on the last line, so a download cut short runs nothing.

set -eu

fail() {
	echo "uno install: $*" >&2
	exit 1
}

main() {
	base="${UNO_DOWNLOAD_BASE:-https://github.com/motiontic/unocode-releases/releases}"
	version="${UNO_VERSION:-latest}"
	dir="${UNO_INSTALL_DIR:-$HOME/.local/bin}"
	# Written in by scripts/release.sh.
	key="RWQxo0J59/55cNgbYVSPFCXeEeOglJiM4i9y+HWYS30Ca7I2H8Jvzcb6"

	command -v curl >/dev/null 2>&1 || fail "curl is needed"

	case "$(uname -s)" in
	Darwin) os=apple-darwin ;;
	Linux) os=unknown-linux-musl ;;
	*) fail "unocode runs on macOS and Linux; this is $(uname -s)" ;;
	esac
	case "$(uname -m)" in
	arm64 | aarch64) arch=aarch64 ;;
	x86_64 | amd64) arch=x86_64 ;;
	*) fail "unocode runs on arm64 and x86_64 machines; this is $(uname -m)" ;;
	esac
	# A shell running under Rosetta reports x86_64 on an Apple Silicon Mac.
	if [ "$os" = apple-darwin ] && [ "$arch" = x86_64 ] &&
		[ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
		arch=aarch64
	fi
	target="$arch-$os"
	file="uno-$target"

	case "$version" in
	latest) from="$base/latest/download" ;;
	*)
		version="${version#v}"
		from="$base/download/v$version"
		;;
	esac

	tmp="$(mktemp -d)"
	trap 'rm -rf "$tmp"' EXIT
	trap 'exit 130' INT TERM

	echo "Downloading uno for $target..."
	curl -fsSL "$from/$file" -o "$tmp/$file" || fail "cannot download $from/$file"
	curl -fsSL "$from/SHA256SUMS" -o "$tmp/SHA256SUMS" || fail "cannot download $from/SHA256SUMS"

	want="$(awk -v f="$file" '$2 == f || $2 == "*" f { print $1 }' "$tmp/SHA256SUMS")"
	[ -n "$want" ] || fail "SHA256SUMS has no line for $file"
	if command -v sha256sum >/dev/null 2>&1; then
		got="$(sha256sum "$tmp/$file" | awk '{ print $1 }')"
	else
		got="$(shasum -a 256 "$tmp/$file" | awk '{ print $1 }')"
	fi
	[ "$got" = "$want" ] || fail "the download does not match its checksum; nothing was installed"

	if command -v minisign >/dev/null 2>&1 && [ "$key" != "__MINISIGN""_KEY__" ]; then
		curl -fsSL "$from/$file.minisig" -o "$tmp/$file.minisig" ||
			fail "cannot download $from/$file.minisig"
		said="$(minisign -V -P "$key" -m "$tmp/$file" -x "$tmp/$file.minisig" 2>&1)" ||
			fail "the download does not match its signature; nothing was installed"
		# The signed comment is "uno <version> <target>": it must be this target, and the
		# version asked for when one was.
		comment="$(printf '%s\n' "$said" | sed -n 's/^Trusted comment: //p')"
		case "$comment" in
		"uno "*" $target") ;;
		*) fail "the signature is for \"$comment\", not uno on $target; nothing was installed" ;;
		esac
		if [ "$version" != latest ] && [ "$comment" != "uno $version $target" ]; then
			fail "the signature is for \"$comment\", not uno $version; nothing was installed"
		fi
		echo "Signature checked: $comment"
	fi

	mkdir -p "$dir" || fail "cannot make $dir"
	# Rename a file from the same folder over the old one; macOS stops a program whose file
	# was rewritten in place.
	cp "$tmp/$file" "$dir/.uno-install-$$" || fail "cannot write to $dir"
	chmod 755 "$dir/.uno-install-$$"
	if [ -L "$dir/uno" ]; then
		echo "Replacing the link $dir/uno -> $(readlink "$dir/uno")"
	fi
	mv -f "$dir/.uno-install-$$" "$dir/uno" || {
		rm -f "$dir/.uno-install-$$"
		fail "cannot replace $dir/uno"
	}
	# Tells `uno update` that this copy is its to replace.
	echo "installed by install.sh; uno update replaces it" >"$dir/.uno-installed"

	echo "Installed $("$dir/uno" --version) to $dir/uno"
	case ":$PATH:" in
	*":$dir:"*) echo "Run: uno" ;;
	*)
		echo
		echo "$dir is not on your PATH. Add this line to your shell's start-up file"
		echo "(~/.zshrc or ~/.bashrc), then open a new terminal:"
		echo
		echo "  export PATH=\"$dir:\$PATH\""
		;;
	esac
}

main "$@"
