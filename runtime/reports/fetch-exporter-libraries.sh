#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Operator-side download, not a network operation inside the Reports container.
set -eu
umask 077
destination=${1:?Provide an empty dependency directory outside the public repository}
test -d "$destination"
test -z "$(ls -A "$destination")"
source_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
while read -r checksum filename original repository_path; do
    case "$checksum" in ''|'#'*) continue ;; esac
    curl --fail --location --proto '=https' --tlsv1.2 --max-time 120 \
        "https://repo.maven.apache.org/maven2/$repository_path" -o "$destination/$filename"
    printf '%s  %s\n' "$checksum" "$destination/$filename" | sha256sum -c -
done < "$source_directory/exporter-libraries.lock"
