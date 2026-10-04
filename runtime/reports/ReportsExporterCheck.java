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

/** Native converter compatibility check. No HTTP, database, macros or formulas run. */
public final class ReportsExporterCheck {
    private static final byte[] MARKER = { 81, 111, 114, 108, 105, 97, 81, 65 };

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static byte[] convert(String format, Path directory, String template) throws Exception {
        JasperResponseConverter converter = new JasperResponseConverter();
        DRDataSource data = new DRDataSource("patient", "visits");
        data.add("QorliaQA Synthetic", 2);
        JasperReportBuilder report = DynamicReports.report()
                .columns(DynamicReports.col.column("Patient", "patient", DataTypes.stringType()),
                        DynamicReports.col.column("Visits", "visits", DataTypes.integerType()))
                .setDataSource(data);
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
        byte[] xlsx = convert("application/vnd.ms-excel", directory, template);
        try (XSSFWorkbook book = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
            require(book.getNumberOfSheets() > 0, "Empty XLSX workbook");
            boolean found = false;
            for (var sheet : book) for (var row : sheet) for (var cell : row)
                found |= cell.toString().contains("QorliaQA Synthetic");
            require(found, "Generated XLSX patient missing");
        }
        for (String format : new String[] { "text/html", "text/csv", "application/pdf",
                "application/vnd.oasis.opendocument.spreadsheet" }) {
            byte[] bytes = convert(format, directory, template);
            if (format.startsWith("text/"))
                require(new String(bytes, java.nio.charset.StandardCharsets.UTF_8).contains("QorliaQA Synthetic"), "Missing text data");
            if (format.equals("application/pdf")) {
                require(new String(bytes, 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-"), "Not PDF");
                var reader = new com.itextpdf.text.pdf.PdfReader(bytes);
                try {
                    String text = com.itextpdf.text.pdf.parser.PdfTextExtractor.getTextFromPage(reader, 1);
                    require(text.contains("QorliaQA Synthetic"), "Generated PDF patient missing");
                } finally { reader.close(); }
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
        Files.write(directory.resolve("custom.xls"), custom);
        System.out.println("Native converter passed all six formats and XLS template preservation: " + directory);
    }
}
