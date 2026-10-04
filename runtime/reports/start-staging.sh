#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Private review adapter for the pinned upstream Bahmni Reports image.
# Uses its bundled changelogs and runtime, without password-bearing shell tracing.
# Based on the startup/migration commands in Bahmni/bahmni-reports.
# Qorlia changes: fail-fast inputs, private file permissions, config URL override,
# no shell tracing, debugger-free startup and native controller hardening. See LICENSE here.
set -eu
umask 077

: "${REPORTS_CONFIG_URL:?}"
: "${OPENMRS_DB_HOST:?}"
: "${OPENMRS_DB_NAME:?}"
: "${OPENMRS_DB_USERNAME:?}"
: "${OPENMRS_DB_PASSWORD:?}"
: "${REPORTS_DB_SERVER:?}"
: "${REPORTS_DB_NAME:?}"
: "${REPORTS_DB_USERNAME:?}"
: "${REPORTS_DB_PASSWORD:?}"

sh /etc/wait-for --timeout=180 "${REPORTS_DB_SERVER}:3306"
sh /etc/wait-for --timeout=180 "${OPENMRS_DB_HOST}:3306"
envsubst < /etc/bahmni-reports/bahmni-reports.properties.template > "$HOME/.bahmni-reports/bahmni-reports.properties"
printf '\nreports.config.url=%s\n' "$REPORTS_CONFIG_URL" >> "$HOME/.bahmni-reports/bahmni-reports.properties"

sh /staging/reports-source/install-exporter-libraries.sh

migrate() {
  (cd "$WAR_DIRECTORY/WEB-INF/classes" && java \
    -Dliquibase.databaseChangeLogTableName=liquibasechangelog \
    -Dliquibase.databaseChangeLogLockTableName=liquibasechangeloglock \
    "-DschemaName=$3" \
    -cp "$WAR_DIRECTORY/WEB-INF/lib/liquibase-core-4.8.0.jar:$WAR_DIRECTORY/WEB-INF/lib/mysql-connector-java-8.0.28.jar" \
    liquibase.integration.commandline.Main --driver=com.mysql.cj.jdbc.Driver \
    "--url=jdbc:mysql://$2:3306/$3" "--username=$4" "--password=$5" \
    "--changeLogFile=$1" update)
}
migrate liquibase.xml "$OPENMRS_DB_HOST" "$OPENMRS_DB_NAME" "$OPENMRS_DB_USERNAME" "$OPENMRS_DB_PASSWORD"
migrate liquibase_bahmni_reports.xml "$REPORTS_DB_SERVER" "$REPORTS_DB_NAME" "$REPORTS_DB_USERNAME" "$REPORTS_DB_PASSWORD"

# Compile the reviewed controllers and converter header fix against this image.
# Report generation and template conversion remain the native implementation.
classpath="$WAR_DIRECTORY/WEB-INF/classes:$WAR_DIRECTORY/WEB-INF/lib/*:/opt/bahmni-reports/lib/bahmni-embedded-tomcat.jar"
javac --release 11 -cp "$classpath" -d "$WAR_DIRECTORY/WEB-INF/classes" \
  /staging/reports-source/MainReportController.java \
  /staging/reports-source/TemplateUploadController.java \
  /staging/reports-source/JasperResponseConverter.java

# Fail before HTTP startup if native formats or template preservation regress.
sh /staging/reports-source/check-controller.sh

# SERVER_OPTS is operator-controlled JVM arguments, not user input. No debugger.
exec java ${SERVER_OPTS:--Xms128m -Xmx512m} -jar /opt/bahmni-reports/lib/bahmni-embedded-tomcat.jar
