#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Use only in the pinned, isolated Reports container before starting its JVM.
set -eu
umask 077
: "${WAR_DIRECTORY:?}"
libraries=/staging/reports-libraries
source_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
manifest="$source_directory/exporter-libraries.lock"
test "$WAR_DIRECTORY" = /var/run/bahmni-reports/bahmni-reports
test -d "$WAR_DIRECTORY/WEB-INF/lib"

# Validate the entire set before changing any installed jar. No downloads at startup.
while read -r checksum filename original repository_path; do
    case "$checksum" in ''|'#'*) continue ;; esac
    case "$filename:$original" in *[!A-Za-z0-9._:-]*) exit 1 ;; esac
    printf '%s  %s\n' "$checksum" "$libraries/$filename" | sha256sum -c -
done < "$manifest"

backup=/var/run/bahmni-reports/original-exporter-libraries
mkdir -p "$backup"
while read -r checksum filename original repository_path; do
    case "$checksum" in ''|'#'*) continue ;; esac
    if [ "$original" != - ] && [ -f "$WAR_DIRECTORY/WEB-INF/lib/$original" ]; then
        test ! -e "$backup/$original"
        mv "$WAR_DIRECTORY/WEB-INF/lib/$original" "$backup/$original"
    fi
    cp "$libraries/$filename" "$WAR_DIRECTORY/WEB-INF/lib/$filename"
done < "$manifest"
