# Routed TCP and HTTP practice, 2026-10-11

Desktop > Web Browser sends HTTP over the simulator's routed packet path. A browser visit to a configured server traverses ARP, VLAN, routing, ACL and TCP processing. The page appears only after its response reaches the requesting device.

## Modeled exchange

The client sends a TCP SYN to port 80. An enabled Server-PT replies SYN-ACK, and the client acknowledges while sending its HTTP GET. The server returns its configured page as an HTTP response. Sequence and acknowledgment numbers account for the SYN, request data, response data and FIN. The client and server exchange FIN-ACK and final ACK segments to close the session. A disabled service or a host with no HTTP listener returns RST-ACK; ACL drops, missing routes and failed return paths become failed browser transactions.

The TCP destination port is available to extended ACL evaluation, so a TCP port 80 rule affects the real request path. Response bodies are limited to 64 KiB; larger pages return HTTP 413. Paths are limited to 2,048 characters and control characters are rejected. Browser visits can start with an IPv4 address or a configured DNS A record. HTTPS and custom HTTP ports are not supported.

## Verification

The HTTP regression suite verifies a routed TCP handshake, sequence and acknowledgment arithmetic, GET and response delivery, graceful close, disabled-service reset, invalid address/path rejection, shared-store completion, MSS-sized request/response segmentation, out-of-order reassembly, the exact 64 KiB response boundary, oversized-page handling and inbound ACL denial. The browser flow resolves `wirex.test`, then displays the configured page after HTTP 200. Browser acceptance must be repeated after protocol changes.

## Boundaries

This is a structured educational model, not serialized Ethernet/IP/TCP bytes. HTTP request and response text is split into UTF-8-safe segments of at most 1,460 data bytes and reassembled at the destination; out-of-order and identical duplicate segments are handled, and ACK numbers advance across contiguous bytes. When a segment and its acknowledgment have both left the in-flight queue without completing delivery, the sender waits 16 simulation ticks and retries at most three times. The bounded retry queue keeps a browser transaction pending while packets are temporarily absent and then reports a timeout with the last observed network error. A completed request is remembered for the transaction lifetime so a duplicate request does not start a second response. Fast retransmit, RTT estimation and backoff, TCP options, receive windows, congestion control, arbitrary HTTP headers/methods, redirects, MIME handling and persistent connections remain unimplemented. DNS details are in `DNS_IMPLEMENTATION.md`.

TCP setup, bounded data segmentation/reassembly, timeout retries and close are now modeled, but this does not close the complete-replacement release gate. UDP Echo now provides a configurable routed client/server exchange; additional UDP services remain, followed by NAT/PAT/GRE and redundancy. See `REPLACEMENT_GATES.md` for the full scope.
