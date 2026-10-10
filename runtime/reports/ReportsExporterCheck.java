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
import net.sf.dynamicreports.report.constant.PageOrientation;
import net.sf.dynamicreports.report.constant.PageType;
import net.sf.dynamicreports.report.constant.HorizontalTextAlignment;
import net.sf.dynamicreports.report.constant.SplitType;
import net.sf.dynamicreports.report.base.component.DRTextField;
import net.sf.dynamicreports.report.base.style.DRStyle;
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
        return convert(report(), format, directory, template, branding);
    }

    private static byte[] convert(JasperReportBuilder report, String format, Path directory,
                                  String template, Path branding) throws Exception {
        JasperResponseConverter converter = new JasperResponseConverter(branding);
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

    private static JasperReportBuilder wideReport() {
        return wideReport(1);
    }

    private static JasperReportBuilder wideReport(int rows) {
        String[] headings = { "Patient Identifier", "Patient Name", "Age", "Birthdate", "Gender",
                "Patient Created Date", "Visit Type", "Date started", "Date stopped", "Date Of Admission",
                "Date Of Discharge", "New patient visit", "phoneNumber", "county_district", "city_village",
                "state_province", "Visit Status", "Admission Status", "Patient Id", "Visit Id" };
        DRDataSource data = new DRDataSource(headings);
        for (int row = 0; row < rows; row++)
            data.add("QST910001", "QorliaQA Synthetic", "30", "01-Jan-1996", "M", "01-Oct-2026", "OPD",
                    "04-Oct-2026", "04-Oct-2026", "", "", "No", "", "", "", "", "OPD", "", "9", "2");
        JasperReportBuilder report = DynamicReports.report().setTemplate(Templates.reportTemplate)
                .setPageFormat(PageType.A3, PageOrientation.LANDSCAPE)
                .title(DynamicReports.cmp.text("QorliaQA Wide Visit Report"));
        for (String heading : headings)
            report.addColumn(DynamicReports.col.column(heading, heading, DataTypes.stringType())
                    .setStyle(Templates.minimalColumnStyle));
        return report.setDataSource(data);
    }

    private static void checkConfiguredColumns() {
        var nativeStyle = Templates.minimalColumnStyle.getStyle();
        var nativePadding = nativeStyle.getPadding();
        var nativeFont = nativeStyle.getFont();
        Integer nativeLeft = nativePadding == null ? null : nativePadding.getLeft();
        Integer nativeFontSize = nativeFont == null ? null : nativeFont.getFontSize();
        var fixed = DynamicReports.col.column("Patient", "patient", DataTypes.stringType())
                .setFixedWidth(137).setStyle(Templates.minimalColumnStyle);
        var characters = DynamicReports.col.column("Visits", "visits", DataTypes.integerType()).setFixedColumns(5);
        var amount = DynamicReports.col.column("Amount", "amount", DataTypes.doubleType())
                .setWidth(80).setPattern("#,##0.00").setHorizontalTextAlignment(HorizontalTextAlignment.RIGHT);
        var minimum = DynamicReports.col.column("Date", "date", DataTypes.dateType()).setMinWidth(100);
        var report = DynamicReports.report().columns(fixed, characters, amount, minimum)
                .setDetailSplitType(SplitType.IMMEDIATE).setColumnHeaderSplitType(SplitType.STRETCH);
        var fixedType = fixed.getColumn().getComponent().getWidthType();
        var minimumType = minimum.getColumn().getComponent().getWidthType();
        new JasperResponseConverter((Path) null).applyReportTemplates(Collections.singletonList(report), "application/pdf");
        require(fixed.getColumn().getComponent().getWidth() == 137
                && fixed.getColumn().getComponent().getWidthType() == fixedType, "Fixed width changed");
        require(characters.getColumn().getComponent().getColumns() == 5, "Character width changed");
        require(amount.getColumn().getComponent().getWidth() == 80
                && "#,##0.00".equals(amount.getColumn().getComponent().getPattern())
                && amount.getColumn().getComponent().getHorizontalTextAlignment() == HorizontalTextAlignment.RIGHT,
                "Configured value width, pattern or alignment changed");
        require(minimum.getColumn().getComponent().getWidth() == 100
                && minimum.getColumn().getComponent().getWidthType() == minimumType, "Minimum width changed");
        require(report.getReport().getDetailBand().getSplitType() == SplitType.IMMEDIATE
                && report.getReport().getColumnHeaderBand().getSplitType() == SplitType.STRETCH,
                "Configured pagination changed");
        var styled = (DRStyle) fixed.getColumn().getComponent().getStyle();
        require(styled.getParentStyle() == Templates.minimalColumnStyle.getStyle()
                && styled.getPadding().getLeft() == 3 && styled.getPadding().getRight() == 3,
                "Explicit native column style did not receive derived cell spacing");
        require(nativeStyle.getPadding() == nativePadding && nativeStyle.getFont() == nativeFont
                && java.util.Objects.equals(nativeLeft, nativePadding == null ? null : nativePadding.getLeft())
                && java.util.Objects.equals(nativeFontSize, nativeFont == null ? null : nativeFont.getFontSize()),
                "Shared column style was mutated");
        var dynamic = DynamicReports.col.column("patient", DataTypes.stringType())
                .setTitle(new net.sf.dynamicreports.report.base.expression.AbstractSimpleExpression<String>() {
            public String evaluate(net.sf.dynamicreports.report.definition.ReportParameters parameters) {
                throw new AssertionError("Layout must not evaluate dynamic headings");
            }
        });
        new JasperResponseConverter((Path) null).applyReportTemplates(Collections.singletonList(
                DynamicReports.report().columns(dynamic)), "application/pdf");
        require(((DRTextField<?>) dynamic.getColumn().getComponent()).getWidth() == null,
                "Dynamic heading width changed");
        var paginatedTemplate = DynamicReports.report().setTemplate(DynamicReports.template()
                .setDetailSplitType(SplitType.STRETCH).setColumnHeaderSplitType(SplitType.IMMEDIATE));
        new JasperResponseConverter((Path) null).applyReportTemplates(Collections.singletonList(paginatedTemplate), "application/pdf");
        require(paginatedTemplate.getReport().getDetailBand().getSplitType() == null
                && paginatedTemplate.getReport().getColumnHeaderBand().getSplitType() == null,
                "Template pagination was overridden");
    }

    public static void main(String[] args) throws Exception {
        checkConfiguredColumns();
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
        byte[] wide = convert(wideReport(), "application/pdf", directory, template, null);
        Files.write(directory.resolve("QorliaQA-wide-report.pdf"), wide);
        System.out.println("Wide report fixture: " + directory);
        var wideReader = new com.itextpdf.text.pdf.PdfReader(wide);
        try {
            String text = com.itextpdf.text.pdf.parser.PdfTextExtractor.getTextFromPage(wideReader, 1);
            for (String heading : new String[] { "phoneNumber", "county_district", "city_village", "state_province", "Admission" })
                require(text.contains(heading), "Wide report splits header word: " + heading);
            require(text.contains("QST910001") && text.contains("QorliaQA") && text.contains("Synthetic"),
                    "Wide report lost patient values: " + text);
        } finally { wideReader.close(); }
        Files.write(directory.resolve("QorliaQA-wide-report.html"),
                convert(wideReport(), "text/html", directory, template, null));
        ByteArrayOutputStream wideBaseline = new ByteArrayOutputStream();
        wideReport().setTemplate(Templates.excelReportTemplate).toCsv(wideBaseline);
        require(Arrays.equals(wideBaseline.toByteArray(), convert(wideReport(), "text/csv", directory, template, null)),
                "Wide CSV columns or values changed");
        byte[] multiPage = convert(wideReport(65), "application/pdf", directory, template, null);
        var pages = new com.itextpdf.text.pdf.PdfReader(multiPage);
        try {
            require(pages.getNumberOfPages() > 1, "Wide fixture did not test pagination");
            int identifiers = 0;
            int birthdates = 0;
            for (int page = 1; page <= pages.getNumberOfPages(); page++) {
                String text = com.itextpdf.text.pdf.parser.PdfTextExtractor.getTextFromPage(pages, page);
                require(text.contains("Qorlia | Built on Bahmni") && text.contains("county_district")
                        && text.contains("QST910001"), "Repeated page lost heading or patient values");
                identifiers += text.split("QST910001", -1).length - 1;
                birthdates += text.split("01-Jan-1996", -1).length - 1;
            }
            require(identifiers == 65 && birthdates == 65, "Patient row split across pages");
        } finally { pages.close(); }
        Files.write(directory.resolve("QorliaQA-wide-multipage.pdf"), multiPage);
        Files.write(directory.resolve("custom.xls"), custom);
        System.out.println("Native converter passed all six formats and XLS template preservation: " + directory);
    }
}
