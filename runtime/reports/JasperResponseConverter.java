// SPDX-License-Identifier: AGPL-3.0-only
// Based on Bahmni/bahmni-reports 1.1.0, commit 8f9d4bbdfec3aacba680a60d7fe47584eb679559.
// Qorlia changes: native XLS MIME and per-report design tokens, preserving data/templates.
package org.bahmni.reports.filter;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import net.sf.dynamicreports.jasper.builder.JasperConcatenatedReportBuilder;
import net.sf.dynamicreports.jasper.builder.JasperReportBuilder;
import net.sf.dynamicreports.jasper.builder.export.Exporters;
import net.sf.dynamicreports.jasper.builder.export.JasperXlsExporterBuilder;
import net.sf.dynamicreports.report.exception.DRException;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.bahmni.reports.template.Templates;
import org.bahmni.reports.web.ReportParams;
import org.springframework.stereotype.Component;

import javax.servlet.http.HttpServletResponse;
import java.io.File;
import java.io.OutputStream;
import java.awt.Color;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import static net.sf.dynamicreports.report.builder.DynamicReports.*;

@Component
public class JasperResponseConverter {

    private static final Logger logger = LogManager.getLogger(JasperResponseConverter.class);
    private static final String TEXT_HTML = "text/html";
    private static final String APPLICATION_VND_MS_EXCEL = "application/vnd.ms-excel";
    private static final String APPLICATION_VND_MS_EXCEL_CUSTOM = "application/vnd.ms-excel-custom";
    private static final String APPLICATION_PDF = "application/pdf";
    private static final String TEXT_CSV = "text/csv";
    private static final String APPLICATION_VND_OASIS_OPENDOCUMENT_SPREADSHEET = "application/vnd.oasis.opendocument.spreadsheet";
    private static final String EX_INVALID_MACRO_TEMPLATE = "Invalid Template";
    private String brandName = "Qorlia";
    private Color primary = Color.decode("#1F5238");

    public JasperResponseConverter() {
        this(System.getenv("QORLIA_BRANDING_FILE") == null ? null
                : Paths.get(System.getenv("QORLIA_BRANDING_FILE")));
    }

    // Operator-mounted, same branding.json as the frontend. No network/asset fetches.
    JasperResponseConverter(Path brandingFile) {
        if (brandingFile == null) return;
        try {
            if (Files.size(brandingFile) > 16384) throw new IllegalArgumentException("Branding file too large");
            JsonNode config = new ObjectMapper().readTree(brandingFile.toFile());
            if (config == null || !config.path("name").isTextual() || !config.path("primary").isTextual())
                throw new IllegalArgumentException("Branding tokens must be strings");
            String name = config.path("name").asText();
            String color = config.path("primary").asText();
            if (name.trim().isEmpty() || name.length() > 60
                    || name.codePoints().anyMatch(value -> Character.isISOControl(value) || value == 0x2014)
                    || !color.matches("#[0-9a-fA-F]{6}"))
                throw new IllegalArgumentException("Invalid branding tokens");
            Color candidate = Color.decode(color);
            double luminance = 0;
            int[] rgb = { candidate.getRed(), candidate.getGreen(), candidate.getBlue() };
            double[] weights = { .2126, .7152, .0722 };
            for (int i = 0; i < rgb.length; i++) {
                double channel = rgb[i] / 255.0;
                luminance += weights[i] * (channel <= .04045 ? channel / 12.92
                        : Math.pow((channel + .055) / 1.055, 2.4));
            }
            if (1.05 / (luminance + .05) < 4.5)
                throw new IllegalArgumentException("Brand color has insufficient contrast");
            brandName = name.trim();
            primary = candidate;
        } catch (Exception invalid) {
            logger.warn("Report branding unavailable or invalid; using Qorlia defaults");
        }
    }

    private void applyDesign(JasperReportBuilder report, boolean printable) {
        // Derive styles without mutating Templates' shared LGPL-covered objects.
        report.setDefaultFont(stl.font().setFontName("SansSerif").setFontSize(10))
                .setColumnTitleStyle(stl.style(Templates.columnTitleStyle)
                        .setBackgroundColor(primary).setForegroundColor(Color.WHITE).setPadding(4))
                .setColumnStyle(stl.style(Templates.columnStyle)
                        .setForegroundColor(Color.decode("#202321")).setPadding(4))
                .setDetailEvenRowStyle(stl.simpleStyle().setBackgroundColor(Color.decode("#EDF3EE")));
        if (printable) {
            report.pageHeader(cmp.text(brandName + " | Built on Bahmni")
                    .setStyle(stl.style().bold().setFontSize(11).setForegroundColor(primary)
                            .setBottomPadding(8)));
        }
    }

    public void convertToResponseType(ReportParams reportParams,
                                      String macroTemplatesTempDirectory, OutputStream outputStream,
                                      JasperConcatenatedReportBuilder concatenatedReportBuilder) throws DRException {
        switch (reportParams.getResponseType()) {
            case TEXT_HTML:
                concatenatedReportBuilder.toHtml(outputStream);
                break;
            case APPLICATION_VND_MS_EXCEL:
                concatenatedReportBuilder.toXlsx(outputStream);
                break;
            case APPLICATION_VND_MS_EXCEL_CUSTOM:
                // below code is to embed existing template and generate a new excel in xls format
                Path macroTemplateFile = macroTemplateFilePath(macroTemplatesTempDirectory, reportParams.getMacroTemplateLocation());
                File templateFile = macroTemplateFile.toFile();
                if (!templateFile.exists()) {
                    logger.error(String.format("Invalid Macro Template specified: %s", macroTemplateFile));
                    throw new RuntimeException(EX_INVALID_MACRO_TEMPLATE);
                }
                JasperXlsExporterBuilder exporterBuilder = Exporters.xlsExporter(outputStream).setDetectCellType(true);
                exporterBuilder.setKeepWorkbookTemplateSheets(true);
                exporterBuilder.setWorkbookTemplate(macroTemplateFile.toString());
                exporterBuilder.addSheetName("Report");
                concatenatedReportBuilder.toXls(exporterBuilder);
                // boolean delete = templateFile.delete();
                // if (!delete) {
                //    logger.warn(String.format("Uploaded report template file not deleted: %s", macroTemplateFile));
                // }
                break;
            case APPLICATION_PDF:
                concatenatedReportBuilder.toPdf(outputStream);
                break;
            case TEXT_CSV:
                concatenatedReportBuilder.toCsv(outputStream);
                break;
            case APPLICATION_VND_OASIS_OPENDOCUMENT_SPREADSHEET:
                concatenatedReportBuilder.toOds(outputStream);
                break;
        }
    }

    private Path macroTemplateFilePath(String macroTemplatesTempDirectory, String macroTemplate) {
        return Paths.get(macroTemplatesTempDirectory, macroTemplate);
    }

    public void applyReportTemplates(List<JasperReportBuilder> reports, String responseType) {
        for (JasperReportBuilder report : reports) {
            switch (responseType) {
                case TEXT_HTML:
                    report.pageFooter(Templates.footerComponent);
                    break;
                case APPLICATION_VND_MS_EXCEL:
                    report.setTemplate(Templates.excelReportTemplate);
                    break;
                case APPLICATION_VND_MS_EXCEL_CUSTOM:
                    report.setTemplate(Templates.excelReportTemplate);
                    break;
                case APPLICATION_PDF:
                    report.pageFooter(Templates.footerComponent);
                    break;
                case TEXT_CSV:
                    report.setTemplate(Templates.excelReportTemplate);
                    break;
                case APPLICATION_VND_OASIS_OPENDOCUMENT_SPREADSHEET:
                    report.setTemplate(Templates.excelReportTemplate);
                    break;
            }
            // CSV is a data exchange format: preserve its exact native rows/columns.
            if (!TEXT_CSV.equals(responseType))
                applyDesign(report, TEXT_HTML.equals(responseType) || APPLICATION_PDF.equals(responseType));
        }
    }

    public void applyHttpHeaders(String responseType, HttpServletResponse response, String fileName) {
        switch (responseType) {
            case TEXT_HTML:
                response.setContentType(TEXT_HTML);
                break;
            case APPLICATION_VND_MS_EXCEL:
                response.setContentType(APPLICATION_VND_MS_EXCEL);
                response.setHeader("Content-Disposition", "attachment; filename=" + fileName + ".xlsx");
                break;
            case APPLICATION_VND_MS_EXCEL_CUSTOM:
                response.setContentType(APPLICATION_VND_MS_EXCEL);
                response.setHeader("Content-Disposition", "attachment; filename=" + fileName + ".xls");
                break;
            case APPLICATION_PDF:
                response.setContentType(APPLICATION_PDF);
                response.setHeader("Content-Disposition", "attachment; filename=" + fileName + ".pdf");
                break;
            case TEXT_CSV:
                response.setContentType(TEXT_CSV);
                response.setHeader("Content-Disposition", "attachment; filename=" + fileName + ".csv");
                break;
            case APPLICATION_VND_OASIS_OPENDOCUMENT_SPREADSHEET:
                response.setContentType(APPLICATION_VND_OASIS_OPENDOCUMENT_SPREADSHEET);
                response.setHeader("Content-Disposition", "attachment; filename=" + fileName + ".ods");
                break;
        }
    }

    public static String getFileExtension(String responseType) {
        switch (responseType) {
            case TEXT_HTML:
                return ".html";
            case APPLICATION_VND_MS_EXCEL:
                return ".xlsx";
            case APPLICATION_VND_MS_EXCEL_CUSTOM:
                return ".xls";
            case APPLICATION_PDF:
                return ".pdf";
            case TEXT_CSV:
                return ".csv";
            case APPLICATION_VND_OASIS_OPENDOCUMENT_SPREADSHEET:
                return ".ods";
            default:
                return "";
        }
    }
}
