// SPDX-License-Identifier: AGPL-3.0-only
// Native checks against the pinned image's actual Spring, servlet and Reports classes.
// Does not submit reports, alter users or delete files. No additional test dependencies.
package org.bahmni.reports.web;

import com.sun.net.httpserver.HttpServer;
import org.bahmni.reports.BahmniReportsProperties;
import org.bahmni.reports.filter.JasperResponseConverter;
import org.bahmni.reports.persistence.ScheduledReport;
import org.bahmni.reports.scheduler.ReportsScheduler;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.Cookie;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.lang.reflect.Proxy;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class MainReportControllerCheck {
    private static int checks;
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }
    private static void denied(HttpStatus status, Runnable action) {
        try { action.run(); throw new AssertionError("Expected access denial"); }
        catch (ResponseStatusException e) { check(e.getStatus() == status, "Wrong denial status"); }
    }
    private static HttpServletRequest request(Cookie... cookies) {
        return (HttpServletRequest) Proxy.newProxyInstance(MainReportControllerCheck.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, (proxy, method, args) ->
                        "getCookies".equals(method.getName()) ? cookies : null);
    }
    private static class Reply {
        int status = 200;
        final Map<String, String> headers = new HashMap<>();
        final HttpServletResponse response = (HttpServletResponse) Proxy.newProxyInstance(
                MainReportControllerCheck.class.getClassLoader(), new Class<?>[]{HttpServletResponse.class},
                (proxy, method, args) -> {
                    switch (method.getName()) {
                        case "sendError": case "setStatus": status = (int) args[0]; break;
                        case "setHeader": headers.put((String) args[0], (String) args[1]); break;
                        case "isCommitted": return false;
                        default: break;
                    }
                    return null;
                });
    }
    private static ScheduledReport report(String id, String owner, String name, String status) {
        return new ScheduledReport(id, name, owner, "Visit_Report.csv", new Date(), new Date(),
                status, "text/csv", new Date());
    }
    private static class Scheduler extends ReportsScheduler {
        List<ScheduledReport> rows = new ArrayList<>();
        ScheduledReport current = report("own", "alice", "Visit Report", "Completed");
        int reads, writes, deletes, fileReads;
        String queuedUser;
        @Override public List<ScheduledReport> getReports(String user) { reads++; return rows; }
        @Override public ScheduledReport getReportById(String id) { return "missing".equals(id) ? null : current; }
        @Override public String getFilePath(ScheduledReport report) { fileReads++; return "/synthetic/Visit_Report.csv"; }
        @Override public void schedule(ReportParams params) { writes++; queuedUser = params.getUserName(); }
        @Override public void deleteScheduledReport(String id) { deletes++; }
    }
    private static class Converter extends JasperResponseConverter {
        int calls;
        @Override public void applyHttpHeaders(String type, HttpServletResponse response, String name) {
            calls++; super.applyHttpHeaders(type, response, name);
        }
    }
    private static class Controller extends MainReportController {
        boolean allow = true, privilegeFailure;
        int accessChecks;
        Controller(Scheduler scheduler, Converter converter) { super(converter, null, null, null, scheduler, null); }
        @Override protected String authenticatedUser(HttpServletRequest request) { return "alice"; }
        @Override protected boolean hasReportPrivilege(String name, HttpServletRequest request) {
            accessChecks++;
            if (privilegeFailure) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
            return allow && !"Restricted".equals(name);
        }
    }
    private static ReportParams params(String user) {
        ReportParams params = new ReportParams();
        params.setName("Visit Report"); params.setUserName(user); params.setResponseType("text/csv");
        return params;
    }
    public static void main(String[] args) throws Exception {
        Scheduler scheduler = new Scheduler();
        Converter converter = new Converter();
        Controller controller = new Controller(scheduler, converter);
        HttpServletRequest request = request(new Cookie("reporting_session", "synthetic-check"));
        scheduler.rows = Arrays.asList(report("a", "alice", "Visit Report", "Completed"),
                report("b", "alice", "Visit Report", "Completed"),
                report("c", "alice", "Restricted", "Completed"),
                report("d", "bob", "Visit Report", "Completed"));
        check(controller.getReports("alice", request).size() == 2, "Queue leaked a report");
        check(controller.accessChecks == 2, "Repeated report definitions recheck access");
        denied(HttpStatus.FORBIDDEN, () -> controller.getReports("bob", request));
        check(scheduler.reads == 1, "Foreign queue was read");
        controller.privilegeFailure = true;
        denied(HttpStatus.SERVICE_UNAVAILABLE, () -> controller.getReports("alice", request));
        controller.privilegeFailure = false;

        Reply reply = new Reply();
        controller.schedule(params("alice"), reply.response, request);
        check(scheduler.writes == 1 && "alice".equals(scheduler.queuedUser), "Own schedule failed");
        reply = new Reply(); controller.schedule(params("bob"), reply.response, request);
        check(reply.status == 403 && scheduler.writes == 1, "Foreign schedule was accepted");
        reply = new Reply(); controller.schedule(params(null), reply.response, request);
        check(reply.status == 403 && scheduler.writes == 1, "Missing owner was accepted");
        controller.allow = false;
        reply = new Reply(); controller.schedule(params("alice"), reply.response, request);
        check(reply.status == 403 && scheduler.writes == 1, "Restricted scheduling wrote data");
        reply = new Reply(); controller.getReport(params("alice"), reply.response, request);
        check(reply.status == 403 && converter.calls == 0, "Denied direct report entered generation");
        controller.allow = true;
        reply = new Reply(); controller.getScheduledReport("own", reply.response, request);
        check("attachment; filename=Visit_Report.csv".equals(reply.headers.get("Content-Disposition")), "Duplicate extension remains");
        check(scheduler.fileReads == 1, "Own file was not selected");
        controller.allow = false;
        Reply noAccess = new Reply();
        denied(HttpStatus.FORBIDDEN, () -> controller.getScheduledReport("own", noAccess.response, request));
        check(noAccess.headers.isEmpty() && scheduler.fileReads == 1, "Denied download reached file headers");
        reply = new Reply(); controller.delete("own", reply.response, request);
        check(reply.status == 403 && scheduler.deletes == 0, "Restricted deletion was accepted");
        controller.allow = true;
        scheduler.current = report("foreign", "bob", "Visit Report", "Completed");
        Reply foreign = new Reply();
        denied(HttpStatus.NOT_FOUND, () -> controller.getScheduledReport("foreign", foreign.response, request));
        check(scheduler.fileReads == 1, "Foreign file was selected");
        reply = new Reply(); controller.delete("foreign", reply.response, request);
        check(reply.status == 404 && scheduler.deletes == 0, "Foreign deletion was accepted");
        Reply missing = new Reply();
        denied(HttpStatus.NOT_FOUND, () -> controller.getScheduledReport("missing", missing.response, request));
        scheduler.current = report("own", "alice", "Visit Report", "Processing");
        Reply processing = new Reply();
        denied(HttpStatus.CONFLICT, () -> controller.getScheduledReport("own", processing.response, request));
        reply = new Reply(); controller.delete("own", reply.response, request);
        check(reply.status == 409 && scheduler.deletes == 0, "Processing report was deleted");
        scheduler.current = report("own", "alice", "Visit Report", "Completed");
        reply = new Reply(); controller.delete("own", reply.response, request);
        check(reply.status == 200 && scheduler.deletes == 1, "Own deletion did not reach scheduler");

        // Exercise the actual identity HTTP client against a private synthetic stub.
        String[] body = {"{\"authenticated\":true,\"user\":{\"username\":\"alice\"}}"};
        int[] status = {200};
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/session", exchange -> {
            byte[] bytes = body[0].getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status[0], bytes.length);
            exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.start();
        try {
            BahmniReportsProperties properties = new BahmniReportsProperties() {
                @Override public String getOpenmrsRootUrl() { return "http://127.0.0.1:" + server.getAddress().getPort(); }
            };
            MainReportController identity = new MainReportController(null, properties, null, null, scheduler, null);
            check("alice".equals(identity.authenticatedUser(request)), "Session username was not read");
            denied(HttpStatus.UNAUTHORIZED, () -> identity.authenticatedUser(request()));
            denied(HttpStatus.UNAUTHORIZED, () -> identity.authenticatedUser(request(new Cookie("reporting_session", ""))));
            denied(HttpStatus.UNAUTHORIZED, () -> identity.authenticatedUser(request(new Cookie("reporting_session", "bad;cookie"))));
            denied(HttpStatus.UNAUTHORIZED, () -> identity.authenticatedUser(request(
                    new Cookie("reporting_session", "first"), new Cookie("reporting_session", "second"))));
            for (String invalid : Arrays.asList("{}", "{\"authenticated\":false}",
                    "{\"authenticated\":true,\"user\":{}}", "{\"authenticated\":true,\"user\":{\"username\":\" \"}}")) {
                body[0] = invalid;
                denied(HttpStatus.UNAUTHORIZED, () -> identity.authenticatedUser(request));
            }
            status[0] = 500;
            denied(HttpStatus.SERVICE_UNAVAILABLE, () -> identity.authenticatedUser(request));
            status[0] = 200; body[0] = "not-json";
            denied(HttpStatus.SERVICE_UNAVAILABLE, () -> identity.authenticatedUser(request));
        } finally { server.stop(0); }
        System.out.println("Reports native authorization checks passed: " + checks);
    }
}
