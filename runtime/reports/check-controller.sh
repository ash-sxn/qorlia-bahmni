#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Run inside the pinned upstream Reports image with this directory mounted read-only.
set -eu
umask 077
: "${WAR_DIRECTORY:?}"
source_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
check_directory=$(mktemp -d /tmp/qorlia-reports-check.XXXXXX)
classpath="$WAR_DIRECTORY/WEB-INF/classes:$WAR_DIRECTORY/WEB-INF/lib/*:/opt/bahmni-reports/lib/bahmni-embedded-tomcat.jar"
javac --release 11 -cp "$classpath" -d "$check_directory" \
    "$source_directory/MainReportController.java" "$source_directory/MainReportControllerCheck.java" \
    "$source_directory/TemplateUploadController.java" "$source_directory/TemplateUploadControllerCheck.java" \
    "$source_directory/JasperResponseConverter.java" "$source_directory/ReportsExporterCheck.java"
java -cp "$check_directory:$classpath" org.bahmni.reports.web.MainReportControllerCheck
java -cp "$check_directory:$classpath" org.bahmni.reports.web.TemplateUploadControllerCheck
java -Xmx256m -Djava.awt.headless=true -cp "$check_directory:$classpath" org.bahmni.reports.filter.ReportsExporterCheck
# Keep this disposable native check output for inspection; never modify the running WAR.
