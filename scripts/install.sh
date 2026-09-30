#!/usr/bin/env bash
# =============================================================================
# xslt standalone installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/spagu/XSLT-Processor/main/scripts/install.sh | bash
#
# Installs the standalone `xslt` executable (no Node.js needed) from a GitHub
# release: detects the OS and CPU, downloads xslt-<os>-<arch>[.exe] and the
# release's checksums.sha256, verifies the SHA-256 and only then installs.
#
# Environment:
#   XSLT_VERSION      Release to install, e.g. 1.2.0 (default: latest)
#   XSLT_INSTALL_DIR  Target directory (default: /usr/local/bin, or ~/bin on
#                     Windows Git Bash / MSYS2)
#   XSLT_RELEASE_URL  Directory holding the release assets; overrides the
#                     GitHub URL (mirrors, tests; file:// is accepted here)
#
# Safety: HTTPS only (unless XSLT_RELEASE_URL says otherwise), HTTP errors
# fail, a missing or mismatching checksum is fatal, `set -euo pipefail`.
# =============================================================================
set -euo pipefail

REPO="spagu/XSLT-Processor"
VERSION="${XSLT_VERSION:-latest}"

log_info() { echo "[INFO] $1"; }
log_success() { echo "[OK] $1"; }
log_error() {
    echo "[ERROR] $1" >&2
    exit 1
}

TMP_DIR=""
cleanup() { if [[ -n "$TMP_DIR" ]]; then rm -rf "$TMP_DIR"; fi; }
trap cleanup EXIT

# release_url prints the directory the assets are downloaded from.
release_url() {
    if [[ -n "${XSLT_RELEASE_URL:-}" ]]; then
        echo "${XSLT_RELEASE_URL%/}"
    elif [[ "$VERSION" == "latest" ]]; then
        echo "https://github.com/${REPO}/releases/latest/download"
    else
        echo "https://github.com/${REPO}/releases/download/v${VERSION#v}"
    fi
}

# detect_platform sets OS, ARCH and ASSET (the release asset name).
detect_platform() {
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)

    case "$ARCH" in
        x86_64 | amd64) ARCH="x64" ;;
        aarch64 | arm64) ARCH="arm64" ;;
        *) log_error "Unsupported architecture: $ARCH (install with: npm install -g @tradik/xslt-processor jsdom)" ;;
    esac

    case "$OS" in
        linux)
            if ldd --version 2>&1 | grep -qi musl; then
                log_error "musl libc (Alpine) is not supported by the standalone binary; install with: npm install -g @tradik/xslt-processor jsdom"
            fi
            ;;
        darwin) ;;
        mingw* | msys* | cygwin*) OS="windows" ;;
        *) log_error "Unsupported OS: $OS (install with: npm install -g @tradik/xslt-processor jsdom)" ;;
    esac

    if [[ "$OS" == "windows" && "$ARCH" != "x64" ]]; then
        log_error "Only x64 Windows binaries are published"
    fi

    ASSET="xslt-${OS}-${ARCH}"
    [[ "$OS" == "windows" ]] && ASSET="${ASSET}.exe"
    log_info "Detected platform: ${OS}-${ARCH}"
}

# fetch downloads one release asset; HTTPS only unless XSLT_RELEASE_URL is set.
fetch() {
    local url="$1" dest="$2" protocols="=https"
    [[ -n "${XSLT_RELEASE_URL:-}" ]] && protocols="=https,file"
    curl --proto "$protocols" --proto-redir =https --fail -sSL "$url" -o "$dest"
}

# sha256_of prints the SHA-256 of a file with whichever tool the system has.
sha256_of() {
    local file="$1"
    if command -v sha256sum > /dev/null 2>&1; then
        sha256sum "$file" | awk '{print $1}'
    elif command -v shasum > /dev/null 2>&1; then
        shasum -a 256 "$file" | awk '{print $1}'
    else
        return 1
    fi
}

# verify_checksum compares the download with the release's checksums.sha256.
verify_checksum() {
    local file="$1" sums="$TMP_DIR/checksums.sha256" expected actual
    fetch "$(release_url)/checksums.sha256" "$sums" ||
        log_error "Could not download checksums.sha256; refusing to install an unverified binary"
    expected=$(awk -v name="$ASSET" '$2 == name {print $1}' "$sums")
    [[ -n "$expected" ]] || log_error "checksums.sha256 has no entry for ${ASSET}"
    actual=$(sha256_of "$file") || log_error "Neither sha256sum nor shasum is available to verify the download"
    [[ "$actual" == "$expected" ]] || log_error "Checksum mismatch for ${ASSET}: expected ${expected}, got ${actual}"
    log_success "Checksum verified"
}

# install_binary downloads, verifies and installs the executable.
install_binary() {
    local default_dir="/usr/local/bin" target_name="xslt"
    if [[ "$OS" == "windows" ]]; then
        default_dir="$HOME/bin"
        target_name="xslt.exe"
    fi
    local install_dir="${XSLT_INSTALL_DIR:-$default_dir}"

    command -v curl > /dev/null 2>&1 || log_error "curl is required"
    TMP_DIR=$(mktemp -d)

    log_info "Downloading ${ASSET} ($(release_url))..."
    fetch "$(release_url)/${ASSET}" "$TMP_DIR/${ASSET}" ||
        log_error "Download failed: $(release_url)/${ASSET}"
    verify_checksum "$TMP_DIR/${ASSET}"

    log_info "Installing to ${install_dir}/${target_name}..."
    mkdir -p "$install_dir" 2> /dev/null || true
    # install(1) copies and sets the mode in one step.
    if [[ -w "$install_dir" ]]; then
        install -m 0755 "$TMP_DIR/${ASSET}" "${install_dir}/${target_name}"
    else
        sudo install -m 0755 "$TMP_DIR/${ASSET}" "${install_dir}/${target_name}"
    fi

    INSTALLED="${install_dir}/${target_name}"
    log_success "$("$INSTALLED" --version) installed to ${INSTALLED}"
}

main() {
    detect_platform
    install_binary
    if ! command -v xslt > /dev/null 2>&1; then
        log_info "Add $(dirname "$INSTALLED") to your PATH to run xslt from anywhere"
    fi
}

main "$@"
