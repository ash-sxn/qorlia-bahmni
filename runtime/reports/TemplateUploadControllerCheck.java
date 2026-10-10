// SPDX-License-Identifier: AGPL-3.0-only
// Native format and filesystem checks using dependencies already in the pinned image.
package org.bahmni.reports.web;

import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.bahmni.reports.BahmniReportsProperties;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.*;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public class TemplateUploadControllerCheck {
    private static int checks;
    private static void check(boolean condition, String message) {
        checks++;
        if (!condition) throw new AssertionError(message);
    }
    private static MultipartFile file(String name, byte[] bytes, boolean failCopy) {
        int[] opens = {0};
        return (MultipartFile) Proxy.newProxyInstance(MultipartFile.class.getClassLoader(),
                new Class<?>[]{MultipartFile.class}, (proxy, method, args) -> {
                    switch (method.getName()) {
                        case "getOriginalFilename": return name;
                        case "isEmpty": return bytes.length == 0;
                        case "getSize": return (long) bytes.length;
                        case "getInputStream":
                            if (++opens[0] == 2 && failCopy) throw new IOException("Synthetic copy failure");
                            return new ByteArrayInputStream(bytes);
                        case "transferTo": throw new AssertionError("Unvalidated transferTo path used");
                        default: throw new AssertionError("Unexpected multipart method: " + method.getName());
                    }
                });
    }
    private static long count(Path directory) throws IOException {
        try (Stream<Path> files = Files.list(directory)) { return files.count(); }
    }
    private static void rejected(TemplateUploadController controller, Path directory,
                                 String name, byte[] bytes) throws Exception {
        long before = count(directory);
        try {
            controller.uploadTemplateFile(file(name, bytes, false));
            throw new AssertionError("Invalid template accepted: " + name);
        } catch (ResponseStatusException denied) {
            check(denied.getStatus() == HttpStatus.BAD_REQUEST, "Unexpected rejection status");
        }
        check(count(directory) == before, "Rejected upload wrote a file");
    }
    public static void main(String[] args) throws Exception {
        Path directory = Files.createTempDirectory("qorlia-template-check-");
        BahmniReportsProperties properties = new BahmniReportsProperties() {
            @Override public String getMacroTemplatesTempDirectory() { return directory.toString(); }
        };
        TemplateUploadController controller = new TemplateUploadController(properties);
        check(Arrays.asList(TemplateUploadController.class.getMethod("uploadTemplateFile", MultipartFile.class)
                .getAnnotation(RequestMapping.class).produces()).contains("text/plain;charset=UTF-8"),
                "Unicode upload acknowledgements have no UTF-8 response contract");
        // BIFF bytes are native test fixtures, not customer spreadsheet deliverables.
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try (HSSFWorkbook workbook = new HSSFWorkbook()) {
            workbook.createSheet("Sheet1").createRow(0).createCell(0).setCellValue("QorliaQA Synthetic Template");
            workbook.getSheetAt(0).getRow(0).createCell(1).setCellFormula("1+1");
            workbook.write(buffer);
        }
        byte[] xls = buffer.toByteArray();
        for (String name : Arrays.asList("QorliaQA.xls", "रिपोर्ट का नमूना.XLS", "Clinique été.xls")) {
            String stored = controller.uploadTemplateFile(file(name, xls, false));
            check(stored.endsWith("-" + name), "Valid filename changed");
            check(Paths.get(stored).getNameCount() == 1, "Stored name is a path");
            check(Arrays.equals(xls, Files.readAllBytes(directory.resolve(stored))), "Workbook bytes changed");
        }
        String first = controller.uploadTemplateFile(file("QorliaQA.xls", xls, false));
        String second = controller.uploadTemplateFile(file("QorliaQA.xls", xls, false));
        check(!first.equals(second), "Repeated names overwrite templates");
        for (String name : Arrays.asList("../escape.xls", "..\\escape.xls", "/tmp/escape.xls",
                "a/../escape.xls", "nested/report.xls", "bad\nname.xls", "bad\u0000.xls", "bad\u007f.xls",
                "<report>.xls", "report.xlsx", "report.html", "", null, "a".repeat(211) + ".xls"))
            rejected(controller, directory, name, xls);
        rejected(controller, directory, "empty.xls", new byte[0]);
        rejected(controller, directory, "login.xls", "<html>Sign in</html>".getBytes(StandardCharsets.UTF_8));
        rejected(controller, directory, "truncated.xls", Arrays.copyOf(xls, 32));
        buffer.reset();
        // A ZIP renamed to XLS must not enter the legacy BIFF workbook path.
        try (ZipOutputStream zip = new ZipOutputStream(buffer)) {
            zip.putNextEntry(new ZipEntry("[Content_Types].xml"));
            zip.write("<Types/>".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        rejected(controller, directory, "renamed.xls", buffer.toByteArray());
        long before = count(directory);
        try {
            controller.uploadTemplateFile(file("copy-failure.xls", xls, true));
            throw new AssertionError("Copy failure was accepted");
        } catch (IOException expected) { check(count(directory) == before, "Partial upload remains"); }
        TemplateUploadController missing = new TemplateUploadController(new BahmniReportsProperties() {
            @Override public String getMacroTemplatesTempDirectory() { return ""; }
        });
        try {
            missing.uploadTemplateFile(file("QorliaQA.xls", xls, false));
            throw new AssertionError("Missing storage accepted");
        } catch (ResponseStatusException expected) {
            check(expected.getStatus() == HttpStatus.SERVICE_UNAVAILABLE, "Missing storage was not denied");
        }
        System.out.println("Reports native template upload checks passed: " + checks);
    }
}
