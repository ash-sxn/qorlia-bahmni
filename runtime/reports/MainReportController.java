// SPDX-License-Identifier: AGPL-3.0-only
// Based on Bahmni/bahmni-reports 1.1.0, commit 8f9d4bbdfec3aacba680a60d7fe47584eb679559.
// Qorlia changes: authenticated ownership, per-report access, fail-closed errors,
// processing deletion guard and single-extension downloads.
package org.bahmni.reports.web;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.bahmni.reports.BahmniReportsProperties;
import org.bahmni.reports.filter.JasperResponseConverter;
import org.bahmni.reports.model.AllDatasources;
import org.bahmni.reports.persistence.ScheduledReport;
import org.bahmni.reports.scheduler.ReportsScheduler;
import org.bahmni.reports.web.security.OpenMRSAuthenticator;
import org.bahmni.reports.web.security.ReportAuthorization;
import org.bahmni.webclients.HttpClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.Cookie;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.*;

@RestController
public class MainReportController {
    private static final Logger logger = LogManager.getLogger(MainReportController.class);
    private final JasperResponseConverter converter;
    private final BahmniReportsProperties properties;
    private final AllDatasources allDatasources;
    private final HttpClient httpClient;
    private final ReportsScheduler scheduler;
    private final OpenMRSAuthenticator authenticator;

    @Autowired
    public MainReportController(JasperResponseConverter converter, BahmniReportsProperties properties,
                                AllDatasources allDatasources, HttpClient httpClient,
                                ReportsScheduler scheduler, OpenMRSAuthenticator authenticator) {
        this.converter = converter;
        this.properties = properties;
        this.allDatasources = allDatasources;
        this.httpClient = httpClient;
        this.scheduler = scheduler;
        this.authenticator = authenticator;
    }

    protected String authenticatedUser(HttpServletRequest request) {
        String session = null;
        if (request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if (!"reporting_session".equals(cookie.getName())) continue;
                if (session != null || cookie.getValue().isEmpty()
                        || !cookie.getValue().matches("[A-Za-z0-9._-]+"))
                    throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in again.");
                session = cookie.getValue();
            }
        }
        if (session == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in again.");
        HttpHeaders headers = new HttpHeaders();
        headers.add("Cookie", "JSESSIONID=" + session);
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(10000);
        try {
            Map<?, ?> body = new RestTemplate(factory).exchange(
                    properties.getOpenmrsRootUrl().replaceAll("/$", "") + "/session",
                    HttpMethod.GET, new HttpEntity<>(null, headers), Map.class).getBody();
            Object user = body == null ? null : body.get("user");
            Object username = user instanceof Map ? ((Map<?, ?>) user).get("username") : null;
            if (body == null || !Boolean.TRUE.equals(body.get("authenticated"))
                    || !(username instanceof String) || ((String) username).trim().isEmpty())
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in again.");
            return (String) username;
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Cannot verify report access.");
        }
    }

    protected boolean hasReportPrivilege(String name, HttpServletRequest request) {
        try {
            return new ReportAuthorization(request, authenticator, properties, httpClient).hasPrivilege(name);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Cannot verify report access.");
        }
    }

    private void requireReport(String name, HttpServletRequest request) {
        if (!hasReportPrivilege(name, request))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Report access is not permitted.");
    }

    private ScheduledReport ownedReport(String id, HttpServletRequest request) {
        String user = authenticatedUser(request);
        ScheduledReport report = scheduler.getReportById(id);
        if (report == null || !user.equals(report.getUser()))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Report is unavailable.");
        requireReport(report.getName(), request);
        return report;
    }

    @RequestMapping(value = "/report", method = RequestMethod.GET)
    public void getReport(ReportParams params, HttpServletResponse response, HttpServletRequest request) {
        try {
            authenticatedUser(request);
            requireReport(params.getName(), request);
            converter.applyHttpHeaders(params.getResponseType(), response, params.getName());
            new ReportGenerator(params, response.getOutputStream(), allDatasources, properties,
                    httpClient, converter).invoke();
        } catch (Exception e) {
            catchBlock(response, e);
        }
    }

    @RequestMapping(value = "/schedule", method = RequestMethod.GET)
    public void schedule(ReportParams params, HttpServletResponse response, HttpServletRequest request) {
        try {
            String user = authenticatedUser(request);
            if (!user.equals(params.getUserName()))
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only your own reports can be scheduled.");
            requireReport(params.getName(), request);
            params.setUserName(user);
            scheduler.schedule(params);
        } catch (Exception e) {
            catchBlock(response, e);
        }
    }

    @RequestMapping(value = "/getReports", method = RequestMethod.GET)
    public List<ScheduledReport> getReports(@RequestParam(name = "user") String user, HttpServletRequest request) {
        String owner = authenticatedUser(request);
        if (!owner.equals(user)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only your own reports can be listed.");
        List<ScheduledReport> visible = new ArrayList<>();
        Map<String, Boolean> access = new HashMap<>();
        for (ScheduledReport report : scheduler.getReports(owner)) {
            if (!owner.equals(report.getUser())) continue;
            // Cache access per distinct report definition, not across requests or sessions.
            boolean allowed = access.computeIfAbsent(report.getName(), name -> hasReportPrivilege(name, request));
            if (allowed) visible.add(report);
        }
        return visible;
    }

    @RequestMapping(value = "/download/{id}", method = RequestMethod.GET)
    @ResponseBody
    public FileSystemResource getScheduledReport(@PathVariable("id") String id, HttpServletResponse response,
                                                 HttpServletRequest request) {
        ScheduledReport report = ownedReport(id, request);
        if (!"Completed".equalsIgnoreCase(report.getStatus()) || report.getFileName() == null)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Report is not ready to download.");
        String name = report.getFileName();
        String extension = JasperResponseConverter.getFileExtension(report.getFormat());
        if (!extension.isEmpty() && name.endsWith(extension)) name = name.substring(0, name.length() - extension.length());
        converter.applyHttpHeaders(report.getFormat(), response, name);
        return new FileSystemResource(scheduler.getFilePath(report));
    }

    @RequestMapping(value = "/delete/{id}", method = RequestMethod.GET)
    public void delete(@PathVariable("id") String id, HttpServletResponse response, HttpServletRequest request) {
        try {
            ScheduledReport report = ownedReport(id, request);
            if ("Processing".equalsIgnoreCase(report.getStatus()))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Report is still processing.");
            scheduler.deleteScheduledReport(id);
            response.setStatus(200);
        } catch (Exception e) {
            catchBlock(response, e);
        }
    }

    private static void catchBlock(HttpServletResponse response, Exception e) {
        try {
            if (response.isCommitted()) return;
            response.reset();
            if (e instanceof ResponseStatusException) {
                ResponseStatusException denied = (ResponseStatusException) e;
                response.sendError(denied.getStatus().value(), denied.getReason());
            } else {
                logger.error("Error running report", e);
                response.sendError(500, "Report request failed.");
            }
        } catch (IOException writeFailure) {
            logger.warn("Could not send report error response.");
        }
    }
}
