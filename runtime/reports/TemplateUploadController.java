// SPDX-License-Identifier: AGPL-3.0-only
// Based on Bahmni/bahmni-reports 1.1.0, commit 8f9d4bbdfec3aacba680a60d7fe47584eb679559.
// Qorlia changes: validate XLS content and filenames; confine unique writes to the template directory.
package org.bahmni.reports.web;

import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.bahmni.reports.BahmniReportsProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.Locale;
import java.util.UUID;

@Controller
public class TemplateUploadController {
    private final BahmniReportsProperties properties;

    @Autowired
    public TemplateUploadController(BahmniReportsProperties properties) {
        this.properties = properties;
    }

    @RequestMapping(value = "/upload", method = RequestMethod.POST, produces = "text/plain;charset=UTF-8")
    @ResponseBody
    public String uploadTemplateFile(@RequestParam(value = "file") MultipartFile file) throws IOException {
        String name = file.getOriginalFilename();
        if (file.isEmpty() || name == null || name.trim().isEmpty()
                || !name.toLowerCase(Locale.ROOT).endsWith(".xls")
                || name.contains("..") || name.matches("(?s).*[\\\\/<>\\p{Cntrl}].*")
                || name.getBytes(StandardCharsets.UTF_8).length > 210)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose an XLS workbook template.");

        // Read only: POI validates the legacy XLS format, never executes VBA, and
        // the original bytes (including existing macros) are stored unchanged.
        try (InputStream input = file.getInputStream(); HSSFWorkbook workbook = new HSSFWorkbook(input)) {
            workbook.getNumberOfSheets();
        } catch (IOException | RuntimeException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a valid XLS workbook template.");
        }

        String configured = properties.getMacroTemplatesTempDirectory();
        if (configured == null || configured.trim().isEmpty())
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Template storage is unavailable.");
        Path directory = Paths.get(configured).toRealPath();
        String storedName = UUID.randomUUID() + "-" + name;
        Path target = directory.resolve(storedName);
        // CREATE_NEW rejects an existing file or symlink. No client directory enters the destination.
        OutputStream created = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        try (OutputStream output = created; InputStream input = file.getInputStream()) {
            input.transferTo(output);
        } catch (IOException | RuntimeException failure) {
            Files.deleteIfExists(target);
            throw failure;
        }
        return storedName;
    }
}
