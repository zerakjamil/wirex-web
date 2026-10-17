# Routed DNS and hostname browsing, 2026-10-11

The Desktop Web Browser resolves hostnames through the IPv4 resolver configured on the client before starting its HTTP request. A DNS query and response travel through the existing Ethernet, ARP, VLAN, routing, and ACL pipeline. The browser uses the returned IPv4 A record to start HTTP with the same request ID, so the final browser result represents the complete name-lookup and page-load path.

The modeled DNS exchange identifies UDP source/destination ports, uses destination port 53 for queries, and returns an A record from a Server-PT with DNS service enabled. Names are case-insensitive; one trailing dot is accepted. Resolver failures, disabled DNS service, absent records, invalid addresses, and ACL drops produce a failed transaction. If the final ARP or application frame drains without an answer, the store reports a timeout failure rather than leaving the visit pending.

Server Config now has an Enable DNS Service control and editable DNS record list. End-device Desktop > IP Configuration already has a DNS Server field. The Workstation & HTTP Web Server practice lab configures `wirex.test` on the server and points the workstation to it.

## Verification

Eight DNS regressions cover routed A-record resolution, missing names, UDP 53 ACL denial, an unreachable resolver timing out, invalid or missing resolver configuration, shared-store completion, and DNS-to-HTTP continuation under one request ID. The same test set verifies an unreachable HTTP destination does not remain pending. Workspace restoration preserves DNS service state and records.

Live browser acceptance loaded Lab 3, opened the server Config tab and confirmed DNS was enabled with `wirex.test -> 192.168.1.100`. On the workstation, `http://wirex.test/index.html` produced a visible ARP request, DNS query, HTTP request, and the configured server page with HTTP 200.

## Boundaries

This is an educational DNS/UDP message model, not a binary RFC 1035 implementation. It supports one A-record lookup against a directly configured IPv4 resolver. Recursive resolution, delegation, TTL/cache aging, CNAME, AAAA, DNS over TCP, truncation, compression, and arbitrary resource records remain unimplemented. User-created UDP Echo is implemented separately; other UDP application services and raw wire serialization remain open. UDP ports are exposed to ACL evaluation. HTTP uses a structured TCP handshake, sequence/acknowledgment accounting, MSS-sized data segments, destination reassembly, timeout retries and close. TCP options, windows and congestion control remain incomplete. These gaps keep the complete-replacement release gate open.
