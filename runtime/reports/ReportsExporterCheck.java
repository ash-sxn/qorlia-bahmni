// SPDX-License-Identifier: AGPL-3.0-only
package org.bahmni.reports.filter;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Collections;
import java.util.zip.ZipInputStream;
import net.sf.dynamicreports.jasper.builder.JasperConcatenatedReportBuilder;
import net.sf.dynamicreports.jasper.builder.JasperReportBuilder;
import net.sf.dynamicreports.report.builder.DynamicReports;
import net.sf.dynamicreports.report.builder.datatype.DataTypes;
import net.sf.dynamicreports.report.datasource.DRDataSource;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.apache.poi.poifs.filesystem.DirectoryNode;
import org.apache.poi.poifs.filesystem.DocumentEntry;
import org.apache.poi.poifs.filesystem.DocumentInputStream;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.bahmni.reports.web.ReportParams;
import org.bahmni.reports.template.Templates;

/** Native converter compatibility check. No HTTP, database, macros or formulas run. */
public final class ReportsExporterCheck {
    private static final byte[] MARKER = { 81, 111, 114, 108, 105, 97, 81, 65 };

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static JasperReportBuilder report() {
        DRDataSource data = new DRDataSource("patient", "visits");
        data.add("QorliaQA Synthetic", 2);
        data.add("QorliaQA Second", 3);
        return DynamicReports.report().setTemplate(Templates.reportTemplate)
                .title(DynamicReports.cmp.text("QorliaQA Visit Report"))
                .columns(DynamicReports.col.column("Patient", "patient", DataTypes.stringType()),
                        DynamicReports.col.column("Visits", "visits", DataTypes.integerType()))
                .setDataSource(data);
    }

    private static byte[] convert(String format, Path directory, String template) throws Exception {
        return convert(format, directory, template, null);
    }

    private static byte[] convert(String format, Path directory, String template, Path branding) throws Exception {
        JasperResponseConverter converter = new JasperResponseConverter(branding);
        JasperReportBuilder report = report();
        converter.applyReportTemplates(Collections.singletonList(report), format);
        JasperConcatenatedReportBuilder combined = DynamicReports.concatenatedReport().concatenate(report);
        ReportParams params = new ReportParams();
        params.setResponseType(format);
        params.setMacroTemplateLocation(template);
        if (format.equals("application/vnd.ms-excel-custom")) {
            var mime = new java.util.concurrent.atomic.AtomicReference<String>();
            var response = (javax.servlet.http.HttpServletResponse) java.lang.reflect.Proxy.newProxyInstance(
                    ReportsExporterCheck.class.getClassLoader(), new Class<?>[] { javax.servlet.http.HttpServletResponse.class },
                    (proxy, method, values) -> {
                        if (method.getName().equals("setContentType")) mime.set((String) values[0]);
                        return null;
                    });
            converter.applyHttpHeaders(format, response, "QorliaQA");
            require("application/vnd.ms-excel".equals(mime.get()), "Wrong custom XLS MIME");
        }
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        converter.convertToResponseType(params, directory.toString(), output, combined);
        require(output.size() > 0, "Empty " + format);
        return output.toByteArray();
    }

    public static void main(String[] args) throws Exception {
        Path directory = Files.createTempDirectory("qorlia-exporter-check-");
        String template = "QorliaQA रिपोर्ट.xls";
        Path path = directory.resolve(template);
        try (HSSFWorkbook book = new HSSFWorkbook()) {
            book.createSheet("Sheet1").createRow(0).createCell(0).setCellValue("QorliaQA Template");
            var templateStyle = book.createCellStyle();
            templateStyle.setFillForegroundColor(org.apache.poi.ss.usermodel.IndexedColors.GOLD.getIndex());
            templateStyle.setFillPattern(org.apache.poi.ss.usermodel.FillPatternType.SOLID_FOREGROUND);
            book.getSheetAt(0).getRow(0).getCell(0).setCellStyle(templateStyle);
            book.getSheetAt(0).getRow(0).createCell(1).setCellFormula("1+1");
            book.createName().setNameName("QorliaQA_Label");
            book.getName("QorliaQA_Label").setRefersToFormula("Sheet1!$A$1");
            try (var output = Files.newOutputStream(path)) { book.write(output); }
        }
        // A non-executable OLE stream tests preservation, not a real VBA project.
        try (POIFSFileSystem file = new POIFSFileSystem(path.toFile(), false)) {
            file.getRoot().createDirectory("_VBA_PROJECT_CUR")
                    .createDocument("QorliaQA_marker", new ByteArrayInputStream(MARKER));
            file.writeFilesystem();
        }
        byte[] original = Files.readAllBytes(path);
        byte[] custom = convert("application/vnd.ms-excel-custom", directory, template);
        try (HSSFWorkbook book = new HSSFWorkbook(new ByteArrayInputStream(custom))) {
            require(book.getSheet("Sheet1") != null, "Template sheet missing");
            require(book.getSheet("Report") != null, "Generated Report sheet missing");
            require("QorliaQA Template".equals(book.getSheet("Sheet1").getRow(0).getCell(0).getStringCellValue()), "Template text lost");
            require(book.getSheet("Sheet1").getRow(0).getCell(0).getCellStyle().getFillForegroundColor()
                    == org.apache.poi.ss.usermodel.IndexedColors.GOLD.getIndex(), "Hospital template styling changed");
            require("1+1".equals(book.getSheet("Sheet1").getRow(0).getCell(1).getCellFormula()), "Formula changed");
            require("Sheet1!$A$1".equals(book.getName("QorliaQA_Label").getRefersToFormula()), "Named range changed");
            boolean found = false;
            for (var row : book.getSheet("Report")) for (var cell : row)
                found |= cell.toString().contains("QorliaQA Synthetic");
            require(found, "Generated patient missing");
        }
        try (POIFSFileSystem file = new POIFSFileSystem(new ByteArrayInputStream(custom));
                var marker = new DocumentInputStream((DocumentEntry) ((DirectoryNode)
                        file.getRoot().getEntry("_VBA_PROJECT_CUR")).getEntry("QorliaQA_marker"))) {
            require(Arrays.equals(MARKER, marker.readAllBytes()), "OLE marker not retained");
        }
        require(Arrays.equals(original, Files.readAllBytes(path)), "Input template mutated");
        ByteArrayOutputStream nativeWorkbook = new ByteArrayOutputStream();
        report().setTemplate(Templates.excelReportTemplate).toXlsx(nativeWorkbook);
        org.apache.poi.ss.usermodel.CellType nativeVisitType = null;
        try (XSSFWorkbook book = new XSSFWorkbook(new ByteArrayInputStream(nativeWorkbook.toByteArray()))) {
            for (var sheet : book) for (var row : sheet) for (var cell : row)
                if (cell.toString().equals("2") || cell.toString().equals("2.0")) nativeVisitType = cell.getCellType();
        }
        require(nativeVisitType != null, "Native visit value missing");
        byte[] xlsx = convert("application/vnd.ms-excel", directory, template);
        try (XSSFWorkbook book = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
            require(book.getNumberOfSheets() > 0, "Empty XLSX workbook");
            boolean found = false;
            boolean styled = false;
            boolean striped = false;
            boolean plain = false;
            boolean visitTypeRetained = false;
            for (var sheet : book) for (var row : sheet) for (var cell : row)
                if (cell.toString().contains("QorliaQA Synthetic")) {
                    found = true;
                    var color = ((org.apache.poi.xssf.usermodel.XSSFCellStyle)
                            cell.getCellStyle()).getFillForegroundXSSFColor();
                    striped |= color != null && Arrays.equals(color.getRGB(), new byte[] { (byte) 237, (byte) 243, (byte) 238 });
                }
                else if (cell.toString().contains("QorliaQA Second")) {
                    var color = ((org.apache.poi.xssf.usermodel.XSSFCellStyle)
                            cell.getCellStyle()).getFillForegroundXSSFColor();
                    plain |= color != null && Arrays.equals(color.getRGB(), new byte[] { (byte) 255, (byte) 255, (byte) 255 });
                }
                else if (cell.toString().equals("Patient")) {
                    var color = ((org.apache.poi.xssf.usermodel.XSSFCellStyle)
                            cell.getCellStyle()).getFillForegroundXSSFColor();
                    styled |= color != null && Arrays.equals(color.getRGB(), new byte[] { 31, 82, 56 });
                }
                else if (cell.toString().equals("2") || cell.toString().equals("2.0"))
                    visitTypeRetained |= cell.getCellType() == nativeVisitType;
            require(found, "Generated XLSX patient missing");
            require(styled, "Qorlia column header color missing");
            require(striped && plain, "Qorlia alternating row colors missing");
            require(visitTypeRetained, "Native visit value/type changed");
        }
        for (String format : new String[] { "text/html", "text/csv", "application/pdf",
                "application/vnd.oasis.opendocument.spreadsheet" }) {
            byte[] bytes = convert(format, directory, template);
            if (format.startsWith("text/"))
                require(new String(bytes, java.nio.charset.StandardCharsets.UTF_8).contains("QorliaQA Synthetic"), "Missing text data");
            if (format.equals("text/html")) {
                String html = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
                require(html.contains("Qorlia | Built on Bahmni"), "HTML brand credit missing");
                require(html.toUpperCase(java.util.Locale.ROOT).contains("#1F5238"), "HTML brand color missing");
                Files.write(directory.resolve("QorliaQA-report.html"), bytes);
            }
            if (format.equals("text/csv")) {
                ByteArrayOutputStream baseline = new ByteArrayOutputStream();
                report().setTemplate(Templates.excelReportTemplate).toCsv(baseline);
                require(Arrays.equals(bytes, baseline.toByteArray()), "CSV structure/data changed");
            }
            if (format.equals("application/pdf")) {
                require(new String(bytes, 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-"), "Not PDF");
                var reader = new com.itextpdf.text.pdf.PdfReader(bytes);
                try {
                    String text = com.itextpdf.text.pdf.parser.PdfTextExtractor.getTextFromPage(reader, 1);
                    require(text.contains("QorliaQA Synthetic"), "Generated PDF patient missing");
                    require(text.contains("Qorlia | Built on Bahmni"), "PDF brand credit missing");
                } finally { reader.close(); }
                Files.write(directory.resolve("QorliaQA-report.pdf"), bytes);
            }
            if (format.equals("application/vnd.oasis.opendocument.spreadsheet")) {
                boolean found = false;
                try (var zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
                    for (var entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry())
                        if (entry.getName().equals("content.xml")) found =
                                new String(zip.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8).contains("QorliaQA Synthetic");
                }
                require(found, "Generated ODS patient missing");
            }
            System.out.println(format + ": " + bytes.length + " bytes");
        }
        Path branding = directory.resolve("branding.json");
        Files.writeString(branding, "{\"name\":\"City Hospital\",\"primary\":\"#273B54\"}");
        String hospital = new String(convert("text/html", directory, template, branding), java.nio.charset.StandardCharsets.UTF_8);
        require(hospital.contains("City Hospital | Built on Bahmni"), "Hospital branding not applied");
        require(hospital.toUpperCase(java.util.Locale.ROOT).contains("#273B54"), "Hospital color not applied");
        Files.writeString(branding, "{\"name\":\"<script>alert(1)</script>\",\"primary\":\"#273B54\"}");
        String literal = new String(convert("text/html", directory, template, branding), java.nio.charset.StandardCharsets.UTF_8);
        require(!literal.contains("<script>") && literal.contains("&lt;script&gt;"), "Brand name treated as HTML");
        for (String invalid : new String[] { "{", "{\"name\":\"City Hospital\",\"primary\":\"#FFFFFF\"}",
                "{\"name\":123,\"primary\":\"#273B54\"}",
                "{\"name\":\"Bad\\nName\",\"primary\":\"#273B54\"}",
                "{\"name\":\"\",\"primary\":\"#273B54\"}", " ".repeat(16385) }) {
            Files.writeString(branding, invalid);
            String fallback = new String(convert("text/html", directory, template, branding), java.nio.charset.StandardCharsets.UTF_8);
            require(fallback.contains("Qorlia | Built on Bahmni"), "Invalid branding did not fall back");
        }
        String missing = new String(convert("text/html", directory, template, directory.resolve("missing-brand.json")),
                java.nio.charset.StandardCharsets.UTF_8);
        require(missing.contains("Qorlia | Built on Bahmni"), "Missing branding did not fall back");
        require(Templates.columnTitleStyle.getStyle().getBackgroundColor().equals(java.awt.Color.LIGHT_GRAY),
                "Shared native template was mutated");
        Files.write(directory.resolve("custom.xls"), custom);
        System.out.println("Native converter passed all six formats and XLS template preservation: " + directory);
    }
}
