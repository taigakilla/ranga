#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
version="$(cat "$here/VERSION")"
build="$(cat "$here/BUILD" 2>/dev/null || true)"
prefix="${RANGA_PREFIX:-/opt/ranga}"
bindir="${RANGA_BINDIR:-$HOME/.local/bin}"
data="${XDG_DATA_HOME:-$HOME/.local/share}"
config="${XDG_CONFIG_HOME:-$HOME/.config}"
profile="$config/ranga"

dest="$prefix/$version${build:+-$build}"
allowed=/etc/1password/custom_allowed_browsers
as_root=()
mkdir -p "$prefix" 2>/dev/null && [ -w "$prefix" ] || as_root=(pkexec)
"${as_root[@]}" bash -euc '
  if ! pgrep -f "^$2/" >/dev/null; then
    rm -rf "$2.new"
    mkdir -p "$2.new"
    cp -a "$1/app/." "$2.new/"
    cdm=/opt/google/chrome/WidevineCdm
    [ -d "$cdm" ] || cdm="$3/current/WidevineCdm"
    [ -d "$cdm" ] && cp -aL "$cdm" "$2.new/WidevineCdm"
    rm -rf "$2"
    mv "$2.new" "$2"
  fi
  [ "$(id -u)" = 0 ] && chown -R root:root "$3"
  ln -sfn "$2" "$3/current.new"
  mv -T "$3/current.new" "$3/current"
  for old in "$3"/*; do
    [ -d "$old" ] && [ ! -L "$old" ] && [ "$old" != "$2" ] || continue
    pgrep -f "^$old/" >/dev/null || rm -rf "$old"
  done
  if [ "$(id -u)" = 0 ] && [ -d /opt/1Password ] && ! grep -qx ranga "$4" 2>/dev/null; then
    mkdir -p "$(dirname "$4")"
    echo ranga >> "$4"
    chmod 755 "$4"
  fi
' _ "$here" "$dest" "$prefix" "$allowed"

mkdir -p "$bindir"
install -m 755 "$here/ranga-update" "$bindir/ranga-update"
install -m 755 "$here/ranga-translatekit" "$bindir/ranga-translatekit"
"$bindir/ranga-translatekit" || echo "tradução do navegador fica pra próxima: ranga-translatekit" >&2
cat > "$bindir/ranga" <<LAUNCHER
#!/usr/bin/env bash
profile="$profile"
dev_profile="$data/ranga/dev-profile"
if [ ! -e "\$profile/Local State" ] && [ -d "\$dev_profile" ] && [ "\${RANGA_MIGRATE:-1}" = 1 ]; then
  if pgrep -f -- "--user-data-dir=\$dev_profile" >/dev/null; then
    notify-send -a Ranga Ranga "Feche o Ranga de desenvolvimento pra trazer suas abas, logins e extensões" 2>/dev/null \\
      || echo "feche o Ranga de desenvolvimento pra trazer o perfil" >&2
    exit 1
  fi
  mkdir -p "\$profile"
  cp -an "\$dev_profile/." "\$profile/"
  rm -rf "\$profile"/Singleton* "\$profile/Default/Cache" "\$profile/Default/Code Cache" "\$profile/Default/GPUCache" "\$profile/ShaderCache" "\$profile/GrShaderCache"
fi
export LANGUAGE="\${RANGA_LANGUAGE:-pt_BR}"
export CHROME_WRAPPER="$bindir/ranga"
export LD_LIBRARY_PATH="$prefix/current\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
translatekit="$data/ranga/TranslateKit"
translate=()
[ -f "\$translatekit/lib/TranslateKitFiles/libtranslatekit.so" ] && [ -f "\$translatekit/en_pt/manifest.json" ] \\
  && translate=(--translate-kit-binary-path="\$translatekit/lib/TranslateKitFiles/libtranslatekit.so" --translate-kit-packages="en,pt,\$translatekit/en_pt")
exec "$prefix/current/ranga" "\${translate[@]}" "\$@"
LAUNCHER
chmod +x "$bindir/ranga"

mkdir -p "$data/applications"
sed "s#@BIN@#$bindir/ranga#g" "$here/ranga.desktop" > "$data/applications/ranga.desktop"
for size in 16 22 24 32 48 64 128 256 512; do
  mkdir -p "$data/icons/hicolor/${size}x${size}/apps"
  cp "$here/icons/icon-$size.png" "$data/icons/hicolor/${size}x${size}/apps/ranga.png"
done
mkdir -p "$data/icons/hicolor/scalable/apps"
cp "$here/icons/icon.svg" "$data/icons/hicolor/scalable/apps/ranga.svg"
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t "$data/icons/hicolor" || true
command -v update-desktop-database >/dev/null && update-desktop-database -q "$data/applications" || true


mkdir -p "$profile/NativeMessagingHosts"
cat > "$profile/NativeMessagingHosts/ranga.theme.json" <<JSON
{
  "name": "ranga.theme",
  "description": "Ranga: tema do Ciel",
  "path": "$prefix/current/theme/ranga_theme_host.py",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://hncljkmljckjojdjincglklbdihcaeko/"]
}
JSON
onepassword="$config/chromium/NativeMessagingHosts/com.1password.1password.json"
[ -f "$onepassword" ] && cp "$onepassword" "$profile/NativeMessagingHosts/"

hooks="$config/ciel/hooks/theme-set.d"
if [ -d "$config/ciel" ]; then
  mkdir -p "$hooks"
  ln -sfn "$prefix/current/theme/hook-theme-set" "$hooks/ranga"
  "$prefix/current/theme/hook-theme-set" || true
fi

echo "Ranga $version${build:+ ($build)} instalado em $dest"
echo "abrir: ranga   (menu de apps: Ranga)"
